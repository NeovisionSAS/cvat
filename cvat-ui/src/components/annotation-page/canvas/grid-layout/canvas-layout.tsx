// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import 'react-grid-layout/css/styles.css';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import RGL, { WidthProvider } from 'react-grid-layout';
import PropTypes from 'prop-types';
import { isEqual } from 'lodash';
import Layout from 'antd/lib/layout';
import {
    CloseOutlined,
    DragOutlined,
    FullscreenExitOutlined,
    FullscreenOutlined,
    PicCenterOutlined,
    PlusOutlined,
    ReloadOutlined,
} from '@ant-design/icons';

import config from 'config';
import { DimensionType } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';
import CanvasWrapperComponent from 'components/annotation-page/canvas/views/canvas2d/canvas-wrapper';
import CanvasWrapper3DComponent, {
    PerspectiveViewComponent,
    TopViewComponent,
    SideViewComponent,
    FrontViewComponent,
} from 'components/annotation-page/canvas/views/canvas3d/canvas-wrapper3D';
import ContextImage from 'components/annotation-page/canvas/views/context-image/context-image';
import CVATTooltip from 'components/common/cvat-tooltip';
import { useUpdateEffect } from 'utils/hooks';
import defaultLayout, { ItemLayout, ViewType } from './canvas-layout.conf';

const ReactGridLayout = WidthProvider(RGL);

const ViewFabric = (itemLayout: ItemLayout): JSX.Element => {
    const { viewType: type, offset } = itemLayout;

    let component = null;
    switch (type) {
        case ViewType.CANVAS:
            component = <CanvasWrapperComponent />;
            break;
        case ViewType.CANVAS_3D:
            component = <PerspectiveViewComponent />;
            break;
        case ViewType.RELATED_IMAGE:
            component = <ContextImage offset={offset} />;
            break;
        case ViewType.CANVAS_3D_FRONT:
            component = <FrontViewComponent />;
            break;
        case ViewType.CANVAS_3D_SIDE:
            component = <SideViewComponent />;
            break;
        case ViewType.CANVAS_3D_TOP:
            component = <TopViewComponent />;
            break;
        default:
            component = <div> Undefined view </div>;
    }

    return component;
};

const fitLayout = (type: DimensionType, layoutConfig: ItemLayout[]): ItemLayout[] => {
    const updatedLayout: ItemLayout[] = [];

    const relatedViews = layoutConfig.filter((item: ItemLayout) => item.viewType === ViewType.RELATED_IMAGE);
    const relatedViewsCols = relatedViews.length > 6 ? 2 : 1;
    let height = Math.floor(config.CANVAS_WORKSPACE_ROWS / (relatedViews.length / relatedViewsCols));
    height = Math.min(height, config.CANVAS_WORKSPACE_DEFAULT_CONTEXT_HEIGHT);
    relatedViews.forEach((view: ItemLayout, i: number) => {
        updatedLayout.push({
            ...view,
            h: height,
            w: relatedViews.length > 6 ? 2 : 3,
            x: relatedViewsCols === 1 ? 9 : 8 + (i % 2) * 2,
            y: height * i,
        });
    });

    let widthAvail = config.CANVAS_WORKSPACE_COLS;
    if (updatedLayout.length > 0) {
        widthAvail -= updatedLayout[0].w * relatedViewsCols;
    }

    if (type === DimensionType.DIMENSION_2D) {
        const canvas = layoutConfig.find((item: ItemLayout) => item.viewType === ViewType.CANVAS) as ItemLayout;
        updatedLayout.push({
            ...canvas,
            x: 0,
            y: 0,
            w: widthAvail,
            h: config.CANVAS_WORKSPACE_ROWS,
        });
    } else {
        const canvas = layoutConfig.find((item: ItemLayout) => item.viewType === ViewType.CANVAS_3D) as ItemLayout;
        const top = layoutConfig.find((item: ItemLayout) => item.viewType === ViewType.CANVAS_3D_TOP) as ItemLayout;
        const side = layoutConfig.find((item: ItemLayout) => item.viewType === ViewType.CANVAS_3D_SIDE) as ItemLayout;
        const front = layoutConfig.find((item: ItemLayout) => item.viewType === ViewType.CANVAS_3D_FRONT) as ItemLayout;
        const helpfulCanvasViewHeight = 3;
        updatedLayout.push(
            {
                ...canvas,
                x: 0,
                y: 0,
                w: widthAvail,
                h: config.CANVAS_WORKSPACE_ROWS - helpfulCanvasViewHeight,
            },
            {
                ...top,
                x: 0,
                y: config.CANVAS_WORKSPACE_ROWS,
                w: Math.ceil(widthAvail / 3),
                h: helpfulCanvasViewHeight,
            },
            {
                ...side,
                x: Math.ceil(widthAvail / 3),
                y: config.CANVAS_WORKSPACE_ROWS,
                w: Math.ceil(widthAvail / 3),
                h: helpfulCanvasViewHeight,
            },
            {
                ...front,
                x: Math.ceil(widthAvail / 3) * 2,
                y: config.CANVAS_WORKSPACE_ROWS,
                w: Math.floor(widthAvail / 3),
                h: helpfulCanvasViewHeight,
            },
        );
    }

    return updatedLayout;
};

function CanvasLayout({ type }: { type?: DimensionType }): JSX.Element {
    const relatedFiles = useSelector((state: CombinedState) => state.annotation.player.frame.relatedFiles);
    const canvasInstance = useSelector((state: CombinedState) => state.annotation.canvas.instance);
    const canvasBackgroundColor = useSelector((state: CombinedState) => state.settings.player.canvasBackgroundColor);
    const annotations = useSelector((state: CombinedState) => state.annotation.annotations);
    const frame = useSelector((state: CombinedState) => state.annotation.player.frame.number);
    const job = useSelector((state: CombinedState) => state.annotation.job.instance);
    const [warpedResult, setWarpedResult] = useState<string | null>(null);
    const [overlayVisible, setOverlayVisible] = useState<boolean>(true);
    const [overlayOpacity, setOverlayOpacity] = useState<number>(0.7);
    const [overlayColor, setOverlayColor] = useState<string>('#00ff00'); // Default green color

    // Get clean image without annotations from job data
    const getRawCanvasImage = useCallback(async (): Promise<HTMLCanvasElement | null> => {
        console.log('getRawCanvasImage: Starting - job exists:', !!job, 'frame:', frame);
        try {
            if (job) {
                console.log('getRawCanvasImage: Attempting to get frame data');
                // Get the raw frame data directly from the job (without annotations)
                const frameData = await job.frames.get(frame);
                console.log('getRawCanvasImage: Got frame data:', frameData);

                const imageData = await frameData.data();
                console.log('getRawCanvasImage: Got image data:', typeof imageData, imageData);

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Handle CVAT's specific image data structure
                if (
                    imageData &&
                    typeof imageData === 'object' &&
                    'imageData' in imageData &&
                    imageData.imageData instanceof ImageBitmap
                ) {
                    console.log('getRawCanvasImage: Processing CVAT ImageData object');
                    const bitmap = imageData.imageData as ImageBitmap;
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    if (ctx) {
                        ctx.drawImage(bitmap, 0, 0);
                    }
                    return canvas;
                } else if (imageData instanceof ImageBitmap) {
                    console.log('getRawCanvasImage: Processing ImageBitmap');
                    canvas.width = imageData.width;
                    canvas.height = imageData.height;
                    if (ctx) {
                        ctx.drawImage(imageData, 0, 0);
                    }
                    return canvas;
                } else if (imageData instanceof Blob) {
                    console.log('getRawCanvasImage: Processing Blob');
                    const img = new Image();
                    const url = URL.createObjectURL(imageData);

                    return new Promise((resolve) => {
                        img.onload = () => {
                            console.log('getRawCanvasImage: Blob image loaded successfully');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            if (ctx) {
                                ctx.drawImage(img, 0, 0);
                            }
                            URL.revokeObjectURL(url);
                            resolve(canvas);
                        };
                        img.onerror = (error) => {
                            console.error('getRawCanvasImage: Error loading blob image:', error);
                            URL.revokeObjectURL(url);
                            resolve(null);
                        };
                        img.src = url;
                    });
                } else if (typeof imageData === 'string') {
                    console.log('getRawCanvasImage: Processing string URL');
                    const img = new Image();
                    return new Promise((resolve) => {
                        img.onload = () => {
                            console.log('getRawCanvasImage: String URL image loaded successfully');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            if (ctx) {
                                ctx.drawImage(img, 0, 0);
                            }
                            resolve(canvas);
                        };
                        img.onerror = (error) => {
                            console.error('getRawCanvasImage: Error loading string URL:', error);
                            resolve(null);
                        };
                        img.src = imageData;
                    });
                } else {
                    console.log('getRawCanvasImage: Unexpected image data type:', typeof imageData, imageData);
                }
            } else {
                console.log('getRawCanvasImage: No job available');
            }
        } catch (error) {
            console.error('getRawCanvasImage: Error:', error);
        }
        console.log('getRawCanvasImage: Returning null');
        return null;
    }, [job, frame]);
    const createWarpedImage = (
        canvasElement: HTMLCanvasElement,
        firstPolyline: number[],
        secondPolyline: number[],
        tintColor: string = '#00ff00', // Default green, but configurable
    ): string => {
        const ctx = canvasElement.getContext('2d')!;
        const halfWidth = canvasElement.width / 2;

        // Create canvases for left and right halves
        const leftCanvas = document.createElement('canvas');
        const rightCanvas = document.createElement('canvas');
        const leftCtx = leftCanvas.getContext('2d')!;
        const rightCtx = rightCanvas.getContext('2d')!;

        leftCanvas.width = halfWidth;
        leftCanvas.height = canvasElement.height;
        rightCanvas.width = halfWidth;
        rightCanvas.height = canvasElement.height;

        // Extract left and right halves
        leftCtx.putImageData(ctx.getImageData(0, 0, halfWidth, canvasElement.height), 0, 0);
        rightCtx.putImageData(ctx.getImageData(halfWidth, 0, halfWidth, canvasElement.height), 0, 0);

        // Create warped canvas
        const warpedCanvas = document.createElement('canvas');
        const warpedCtx = warpedCanvas.getContext('2d')!;
        warpedCanvas.width = halfWidth;
        warpedCanvas.height = canvasElement.height;

        // Optimize canvas rendering for performance
        warpedCtx.imageSmoothingEnabled = false; // Disable smoothing for faster rendering

        // Convert polygon points to coordinate arrays - handles any number of points
        const srcPoints = [];
        const dstPoints = [];

        // Source points from first polygon (left image coordinates)
        for (let i = 0; i < firstPolyline.length; i += 2) {
            srcPoints.push([firstPolyline[i], firstPolyline[i + 1]]);
        }

        // Destination points from second polygon (right image coordinates, adjusted)
        for (let i = 0; i < secondPolyline.length; i += 2) {
            dstPoints.push([secondPolyline[i] - halfWidth, secondPolyline[i + 1]]);
        }

        console.log(`Source polygon (${srcPoints.length} points, left image):`, srcPoints);
        console.log(`Destination polygon (${dstPoints.length} points, right image):`, dstPoints);

        // Start with the right image as base
        warpedCtx.drawImage(rightCanvas, 0, 0);

        // Calculate bounding boxes for both polygons
        const srcBounds = {
            minX: Math.min(...srcPoints.map((p) => p[0])),
            maxX: Math.max(...srcPoints.map((p) => p[0])),
            minY: Math.min(...srcPoints.map((p) => p[1])),
            maxY: Math.max(...srcPoints.map((p) => p[1])),
        };

        const dstBounds = {
            minX: Math.min(...dstPoints.map((p) => p[0])),
            maxX: Math.max(...dstPoints.map((p) => p[0])),
            minY: Math.min(...dstPoints.map((p) => p[1])),
            maxY: Math.max(...dstPoints.map((p) => p[1])),
        };

        // Calculate transformation parameters based on polygon mapping
        const srcWidth = srcBounds.maxX - srcBounds.minX;
        const srcHeight = srcBounds.maxY - srcBounds.minY;
        const dstWidth = dstBounds.maxX - dstBounds.minX;
        const dstHeight = dstBounds.maxY - dstBounds.minY;

        const scaleX = dstWidth / srcWidth;
        const scaleY = dstHeight / srcHeight;

        // Calculate centroids for alignment (works for any polygon shape)
        const srcCentroidX = srcPoints.reduce((sum, p) => sum + p[0], 0) / srcPoints.length;
        const srcCentroidY = srcPoints.reduce((sum, p) => sum + p[1], 0) / srcPoints.length;
        const dstCentroidX = dstPoints.reduce((sum, p) => sum + p[0], 0) / dstPoints.length;
        const dstCentroidY = dstPoints.reduce((sum, p) => sum + p[1], 0) / dstPoints.length;

        // For more complex polygons, we could implement more sophisticated warping here
        // For now, we use the centroid-based approach which works reasonably well

        // Create a processed version of the left image with green tint and inversion
        const processedLeftCanvas = document.createElement('canvas');
        const processedLeftCtx = processedLeftCanvas.getContext('2d')!;
        processedLeftCanvas.width = halfWidth;
        processedLeftCanvas.height = canvasElement.height;

        // Draw left image to processed canvas
        processedLeftCtx.drawImage(leftCanvas, 0, 0);

        // Get image data for color manipulation
        const imageData = processedLeftCtx.getImageData(0, 0, halfWidth, canvasElement.height);
        const data = imageData.data;

        // Parse the tint color from hex to RGB
        const hexColor = tintColor.replace('#', '');
        const tintR = parseInt(hexColor.substr(0, 2), 16);
        const tintG = parseInt(hexColor.substr(2, 2), 16);
        const tintB = parseInt(hexColor.substr(4, 2), 16);

        // Apply color tint and inversion (optimized for performance)
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const alpha = data[i + 3];

            // Skip transparent pixels
            if (alpha === 0) continue;

            // Fast inversion and brightness calculation
            const invertedR = 255 - r;
            const invertedG = 255 - g;
            const invertedB = 255 - b;

            // Optimized brightness calculation (avoid division by using bit shifting)
            const brightness = (invertedR + invertedG + invertedB) * 0.0013072; // Equivalent to / (3 * 255) but faster

            // Apply pure color tint with brightness masking (using multiplication instead of Math.round)
            data[i] = (tintR * brightness) | 0; // Bitwise OR for faster integer conversion
            data[i + 1] = (tintG * brightness) | 0; // Bitwise OR for faster integer conversion
            data[i + 2] = (tintB * brightness) | 0; // Bitwise OR for faster integer conversion
        }

        // Put the processed image data back
        processedLeftCtx.putImageData(imageData, 0, 0);

        // Apply the transformation to overlay the processed left image
        warpedCtx.save();
        warpedCtx.globalAlpha = 1.0; // Full opacity for the processed overlay
        warpedCtx.globalCompositeOperation = 'screen'; // Bright overlay mode

        // Calculate transformation to map the entire left image based on polygon correspondence
        const scaleFactorX = scaleX;
        const scaleFactorY = scaleY;

        // Calculate offset to align the polygon regions (centroid-based approach)
        const offsetX = dstCentroidX - srcCentroidX * scaleFactorX;
        const offsetY = dstCentroidY - srcCentroidY * scaleFactorY;

        // Transform and draw the processed left image
        warpedCtx.translate(offsetX, offsetY);
        warpedCtx.scale(scaleFactorX, scaleFactorY);
        warpedCtx.drawImage(processedLeftCanvas, 0, 0);

        warpedCtx.restore();

        return warpedCanvas.toDataURL();
    };

    // Process warping with clean image
    const processWarping = useCallback(async () => {
        console.log('processWarping: Starting');
        console.trace('processWarping: Call stack trace'); // Add stack trace to see what's calling this
        try {
            let rawCanvas = await getRawCanvasImage();

            // Fallback to current canvas if job method fails
            if (!rawCanvas && canvasInstance) {
                console.log('processWarping: Fallback to current canvas');
                const currentCanvas = document.querySelector('canvas') as HTMLCanvasElement;
                if (currentCanvas) {
                    rawCanvas = document.createElement('canvas');
                    const ctx = rawCanvas.getContext('2d');
                    rawCanvas.width = currentCanvas.width;
                    rawCanvas.height = currentCanvas.height;
                    if (ctx) {
                        ctx.drawImage(currentCanvas, 0, 0);
                        console.log('processWarping: Successfully copied current canvas');
                    }
                }
            }

            console.log('processWarping: Raw canvas available:', !!rawCanvas);
            console.log('processWarping: Annotations available:', !!annotations);

            if (rawCanvas && annotations) {
                const frameAnnotations = annotations.states.filter(
                    (state: any) => state.frame === frame && state.shapeType === 'polygon',
                );
                console.log('processWarping: Found frame annotations:', frameAnnotations.length);

                if (frameAnnotations.length >= 2) {
                    const firstPolyline = frameAnnotations[0].points;
                    const secondPolyline = frameAnnotations[1].points;
                    console.log('processWarping: Processing polygons');

                    const warpedImageUrl = createWarpedImage(rawCanvas, firstPolyline, secondPolyline, overlayColor);
                    console.log('processWarping: Warped image created');
                    setWarpedResult(warpedImageUrl);
                } else {
                    console.log('processWarping: Not enough polygons');
                    setWarpedResult(null);
                }
            } else {
                console.log('processWarping: Missing prerequisites');
                setWarpedResult(null);
            }
        } catch (error) {
            console.error('processWarping: Error:', error);
            setWarpedResult(null);
        }
    }, [annotations, frame, getRawCanvasImage, canvasInstance, overlayColor]);

    // No complex debounced update needed with simple image element approach

    // Memoized polygon count to avoid unnecessary updates
    const polygonCount = useMemo(() => {
        if (annotations && annotations.states) {
            return annotations.states.filter((state: any) => state.frame === frame && state.shapeType === 'polygon')
                .length;
        }
        return 0;
    }, [annotations?.states, frame]);

    useEffect(() => {
        console.log('Polygon count useEffect triggered - polygonCount:', polygonCount, 'frame:', frame);

        // Only process warping when we have at least 2 polygons
        if (polygonCount >= 2) {
            // Much faster response for frame changes - immediate processing
            const timeoutId = setTimeout(() => {
                console.log('Polygon count useEffect: About to call processWarping');
                processWarping();
            }, 10); // Reduced from 100ms to 10ms for much faster frame changes

            return () => clearTimeout(timeoutId);
        } else {
            setWarpedResult(null);
        }
    }, [polygonCount, processWarping]); // Only depend on polygon count, not the entire annotations array

    // No need to cache the warped image anymore since we're using img element directly

    // Optimized opacity change handler - updated for container structure
    useEffect(() => {
        if (overlayVisible) {
            const overlayContainer = document.getElementById('warp-overlay-element') as HTMLDivElement;
            if (overlayContainer) {
                const overlayImage = overlayContainer.querySelector('img') as HTMLImageElement;
                if (overlayImage) {
                    overlayImage.style.opacity = overlayOpacity.toString();
                }
            }
        }
    }, [overlayOpacity, overlayVisible]);

    // Listen for annotation changes - only for drawing/deleting, not mouse movements
    useEffect(() => {
        if (canvasInstance) {
            let debounceTimeout: NodeJS.Timeout;

            const handleAnnotationChange = () => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(processWarping, 50); // Reduced delay for annotation changes (was 300ms)
            };

            const canvasElement = canvasInstance.html() as HTMLDivElement;
            if (canvasElement && 'addEventListener' in canvasElement) {
                // Only listen to annotation creation/deletion events, not editing or mouse events
                canvasElement.addEventListener('canvas.drawn', handleAnnotationChange);
                canvasElement.addEventListener('canvas.deleted', handleAnnotationChange);

                return () => {
                    clearTimeout(debounceTimeout);
                    canvasElement.removeEventListener('canvas.drawn', handleAnnotationChange);
                    canvasElement.removeEventListener('canvas.deleted', handleAnnotationChange);
                };
            }
        }
    }, [canvasInstance, processWarping]);

    // Function removed - using CSS-based positioning instead

    // Main canvas overlay effect - create overlay image element that matches CVAT canvas positioning
    useEffect(() => {
        const createOverlay = () => {
            if (canvasInstance && warpedResult && overlayVisible) {
                // Find the canvas wrapper and background canvas to copy their positioning
                const canvasWrapper = document.getElementById('cvat_canvas_wrapper') as HTMLDivElement;
                const backgroundCanvas = document.getElementById('cvat_canvas_background') as HTMLCanvasElement;

                if (canvasWrapper && backgroundCanvas) {
                    // Remove any existing overlay
                    const existingOverlay = document.getElementById('warp-overlay-element');
                    if (existingOverlay) {
                        existingOverlay.remove();
                    }

                    // Create a div container to hold the clipped image
                    const overlayContainer = document.createElement('div');
                    overlayContainer.id = 'warp-overlay-element';

                    // Copy the exact styling from the background canvas
                    const canvasStyle = window.getComputedStyle(backgroundCanvas);
                    overlayContainer.style.position = 'absolute';
                    overlayContainer.style.transform = canvasStyle.transform; // Copy scale and rotation
                    overlayContainer.style.top = canvasStyle.top; // Copy exact positioning
                    overlayContainer.style.left = canvasStyle.left;
                    overlayContainer.style.width = canvasStyle.width; // Copy dimensions
                    overlayContainer.style.height = canvasStyle.height;
                    overlayContainer.style.pointerEvents = 'none'; // Allow clicks to pass through
                    overlayContainer.style.zIndex = '1'; // Just above background canvas, below annotations
                    overlayContainer.style.overflow = 'hidden'; // Clip the content

                    // Create the image element inside the container
                    const overlayImage = document.createElement('img');
                    overlayImage.src = warpedResult;
                    overlayImage.style.position = 'absolute';
                    overlayImage.style.top = '0';
                    overlayImage.style.left = '50%'; // Position so only right half shows
                    overlayImage.style.width = '50%'; // Make it half width to show the warped result properly
                    overlayImage.style.height = '100%';
                    overlayImage.style.opacity = overlayOpacity.toString();
                    overlayImage.style.objectFit = 'cover'; // Scale to fit the area
                    overlayImage.style.imageRendering = 'pixelated'; // Keep sharp pixels

                    // Add the image to the container
                    overlayContainer.appendChild(overlayImage);

                    // Insert the overlay after the background canvas but before other elements
                    // This ensures it appears between the image and annotations
                    const nextSibling = backgroundCanvas.nextSibling;
                    if (nextSibling) {
                        canvasWrapper.insertBefore(overlayContainer, nextSibling);
                    } else {
                        canvasWrapper.appendChild(overlayContainer);
                    }
                }
            } else {
                // Remove overlay when not visible
                const existingOverlay = document.getElementById('warp-overlay-element');
                if (existingOverlay) {
                    existingOverlay.remove();
                }
            }
        };

        createOverlay();
    }, [canvasInstance, warpedResult, overlayVisible, overlayOpacity]);

    // CSS-based automatic positioning - overlay inherits canvas transforms
    useEffect(() => {
        if (canvasInstance && overlayVisible && warpedResult) {
            const updateOverlayTransform = () => {
                const overlayContainer = document.getElementById('warp-overlay-element') as HTMLDivElement;
                const backgroundCanvas = document.getElementById('cvat_canvas_background') as HTMLCanvasElement;

                if (overlayContainer && backgroundCanvas) {
                    // Copy the transform directly from the background canvas
                    const canvasStyle = window.getComputedStyle(backgroundCanvas);
                    overlayContainer.style.transform = canvasStyle.transform;
                    overlayContainer.style.top = canvasStyle.top;
                    overlayContainer.style.left = canvasStyle.left;
                    overlayContainer.style.width = canvasStyle.width;
                    overlayContainer.style.height = canvasStyle.height;
                }
            };

            // Set up a MutationObserver to watch for style changes on the background canvas
            const backgroundCanvas = document.getElementById('cvat_canvas_background') as HTMLCanvasElement;

            if (backgroundCanvas) {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                            updateOverlayTransform();
                        }
                    });
                });

                // Observe style attribute changes
                observer.observe(backgroundCanvas, {
                    attributes: true,
                    attributeFilter: ['style'],
                });

                // Initial positioning
                updateOverlayTransform();

                return () => {
                    observer.disconnect();
                };
            }
        }
    }, [canvasInstance, overlayVisible, warpedResult]);

    const computeRowHeight = (): number => {
        const container = window.document.getElementsByClassName('cvat-annotation-header')[0];
        let containerHeight = window.innerHeight;
        if (container) {
            containerHeight = window.innerHeight - container.getBoundingClientRect().bottom;
            // https://github.com/react-grid-layout/react-grid-layout/issues/628#issuecomment-1228453084
            return Math.floor(
                (containerHeight - config.CANVAS_WORKSPACE_MARGIN * config.CANVAS_WORKSPACE_ROWS) /
                    config.CANVAS_WORKSPACE_ROWS,
            );
        }

        return 0;
    };

    const getLayout = useCallback(
        () => defaultLayout[(type as DimensionType).toUpperCase() as '2D' | '3D'][Math.min(relatedFiles, 3)],
        [type, relatedFiles],
    );

    const [layoutConfig, setLayoutConfig] = useState<ItemLayout[]>(getLayout());
    const [rowHeight, setRowHeight] = useState<number>(Math.floor(computeRowHeight()));
    const [fullscreenKey, setFullscreenKey] = useState<string>('');

    const fitCanvas = useCallback(() => {
        if (canvasInstance) {
            canvasInstance.fitCanvas();
            canvasInstance.fit();
        }
    }, [canvasInstance]);

    useEffect(() => {
        const onResize = (): void => {
            setRowHeight(computeRowHeight());
            fitCanvas();
            const [el] = window.document.getElementsByClassName('cvat-canvas-grid-root');
            if (el) {
                el.addEventListener(
                    'transitionend',
                    () => {
                        fitCanvas();
                    },
                    { once: true },
                );
            }
        };

        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, [fitCanvas]);

    useEffect(() => {
        setRowHeight(computeRowHeight());
    }, []);

    useUpdateEffect(() => {
        window.dispatchEvent(new Event('resize'));
    }, [layoutConfig]);

    const children = layoutConfig.map((value: ItemLayout) => ViewFabric(value));
    const layout = layoutConfig.map((value: ItemLayout) => ({
        x: value.x,
        y: value.y,
        w: value.w,
        h: value.h,
        i: typeof value.viewIndex !== 'undefined' ? `${value.viewType}_${value.viewIndex}` : `${value.viewType}`,
    }));

    const singleClassName = 'cvat-canvas-grid-root-single';
    const className =
        !relatedFiles && children.length <= 1 ? `cvat-canvas-grid-root ${singleClassName}` : 'cvat-canvas-grid-root';

    return (
        <Layout.Content>
            {!!rowHeight && (
                <ReactGridLayout
                    cols={config.CANVAS_WORKSPACE_COLS}
                    maxRows={config.CANVAS_WORKSPACE_ROWS}
                    style={{ background: canvasBackgroundColor }}
                    containerPadding={[config.CANVAS_WORKSPACE_PADDING, config.CANVAS_WORKSPACE_PADDING]}
                    margin={[config.CANVAS_WORKSPACE_MARGIN, config.CANVAS_WORKSPACE_MARGIN]}
                    className={className}
                    rowHeight={rowHeight}
                    layout={layout}
                    onLayoutChange={(updatedLayout: RGL.Layout[]) => {
                        const transformedLayout = layoutConfig.map(
                            (itemLayout: ItemLayout, i: number): ItemLayout => ({
                                ...itemLayout,
                                x: updatedLayout[i].x,
                                y: updatedLayout[i].y,
                                w: updatedLayout[i].w,
                                h: updatedLayout[i].h,
                            }),
                        );

                        if (!isEqual(layoutConfig, transformedLayout)) {
                            setLayoutConfig(transformedLayout);
                        }
                    }}
                    resizeHandle={(_: any, ref: React.MutableRefObject<HTMLDivElement>) => (
                        <div ref={ref} className='cvat-grid-item-resize-handler react-resizable-handle' />
                    )}
                    draggableHandle='.cvat-grid-item-drag-handler'
                >
                    {children.map((child: JSX.Element, idx: number): JSX.Element => {
                        const { viewType, viewIndex } = layoutConfig[idx];
                        const key = typeof viewIndex !== 'undefined' ? `${viewType}_${viewIndex}` : `${viewType}`;
                        return (
                            <div
                                style={fullscreenKey === key ? { backgroundColor: canvasBackgroundColor } : {}}
                                className={
                                    fullscreenKey === key
                                        ? 'cvat-canvas-grid-item cvat-canvas-grid-fullscreen-item'
                                        : 'cvat-canvas-grid-item'
                                }
                                key={key}
                            >
                                <DragOutlined className='cvat-grid-item-drag-handler' />
                                <CloseOutlined
                                    className='cvat-grid-item-close-button'
                                    style={{
                                        pointerEvents: viewType !== ViewType.RELATED_IMAGE ? 'none' : undefined,
                                        opacity: viewType !== ViewType.RELATED_IMAGE ? 0.2 : undefined,
                                    }}
                                    onClick={() => {
                                        if (viewType === ViewType.RELATED_IMAGE) {
                                            setLayoutConfig(
                                                layoutConfig.filter(
                                                    (item: ItemLayout) =>
                                                        !(item.viewType === viewType && item.viewIndex === viewIndex),
                                                ),
                                            );
                                        }
                                    }}
                                />
                                {fullscreenKey === key ? (
                                    <FullscreenExitOutlined
                                        className='cvat-grid-item-fullscreen-handler'
                                        onClick={() => {
                                            window.dispatchEvent(new Event('resize'));
                                            setFullscreenKey('');
                                        }}
                                    />
                                ) : (
                                    <FullscreenOutlined
                                        className='cvat-grid-item-fullscreen-handler'
                                        onClick={() => {
                                            window.dispatchEvent(new Event('resize'));
                                            setFullscreenKey(key);
                                        }}
                                    />
                                )}

                                {/* Debug info */}
                                {annotations && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '10px',
                                            left: '10px',
                                            background: 'rgba(0,0,0,0.8)',
                                            color: 'white',
                                            padding: '5px',
                                            fontSize: '12px',
                                            zIndex: 1000,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                        }}
                                    >
                                        <span>
                                            Frame: {frame} | Polygons:{' '}
                                            {annotations.states?.filter(
                                                (s: any) => s.frame === frame && s.shapeType === 'polygon',
                                            ).length || 0}{' '}
                                            | Warped: {warpedResult ? 'Yes' : 'No'}
                                        </span>
                                        {warpedResult && (
                                            <>
                                                <button
                                                    onClick={() => setOverlayVisible(!overlayVisible)}
                                                    style={{
                                                        background: overlayVisible ? '#f0f0f0' : '#666',
                                                        color: overlayVisible ? '#000' : '#fff',
                                                        border: 'none',
                                                        padding: '2px 8px',
                                                        fontSize: '10px',
                                                        cursor: 'pointer',
                                                        borderRadius: '3px',
                                                    }}
                                                >
                                                    {overlayVisible ? 'Hide' : 'Show'}
                                                </button>

                                                {/* Opacity slider */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <span style={{ fontSize: '10px' }}>Opacity:</span>
                                                    <input
                                                        type='range'
                                                        min='0'
                                                        max='1'
                                                        step='0.1'
                                                        value={overlayOpacity}
                                                        onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                                                        style={{
                                                            width: '60px',
                                                            height: '15px',
                                                            cursor: 'pointer',
                                                        }}
                                                    />
                                                    <span style={{ fontSize: '10px', minWidth: '25px' }}>
                                                        {Math.round(overlayOpacity * 100)}%
                                                    </span>
                                                </div>

                                                {/* Color picker */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <span style={{ fontSize: '10px' }}>Color:</span>
                                                    <input
                                                        type='color'
                                                        value={overlayColor}
                                                        onChange={(e) => setOverlayColor(e.target.value)}
                                                        style={{
                                                            width: '30px',
                                                            height: '20px',
                                                            cursor: 'pointer',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            padding: '0',
                                                        }}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {child}
                            </div>
                        );
                    })}
                </ReactGridLayout>
            )}
            {type === DimensionType.DIMENSION_3D && <CanvasWrapper3DComponent />}
            <div className='cvat-grid-layout-common-setups'>
                <CVATTooltip title='Fit views'>
                    <PicCenterOutlined
                        onClick={() => {
                            setLayoutConfig(fitLayout(type as DimensionType, layoutConfig));
                            window.dispatchEvent(new Event('resize'));
                        }}
                    />
                </CVATTooltip>
                <CVATTooltip title='Add context image'>
                    <PlusOutlined
                        style={{
                            pointerEvents: !relatedFiles ? 'none' : undefined,
                            opacity: !relatedFiles ? 0.2 : undefined,
                        }}
                        disabled={!!relatedFiles}
                        onClick={() => {
                            const MAXIMUM_RELATED = 12;
                            const existingRelated = layoutConfig.filter(
                                (configItem: ItemLayout) => configItem.viewType === ViewType.RELATED_IMAGE,
                            );

                            if (existingRelated.length >= MAXIMUM_RELATED) {
                                return;
                            }

                            if (existingRelated.length === 0) {
                                setLayoutConfig(defaultLayout[type?.toUpperCase() as '2D' | '3D']['1']);
                                return;
                            }

                            const viewIndexes = existingRelated
                                .map((item: ItemLayout) => +(item.viewIndex as string))
                                .sort();
                            const max = Math.max(...viewIndexes);
                            let viewIndex = max + 1;
                            for (let i = 0; i < max + 1; i++) {
                                if (!viewIndexes.includes(i)) {
                                    viewIndex = i;
                                    break;
                                }
                            }

                            const latest = existingRelated[existingRelated.length - 1];
                            const copy = { ...latest, offset: [0, viewIndex], viewIndex: `${viewIndex}` };
                            setLayoutConfig(fitLayout(type as DimensionType, [...layoutConfig, copy]));
                            window.dispatchEvent(new Event('resize'));
                        }}
                    />
                </CVATTooltip>
                <CVATTooltip title='Reload layout'>
                    <ReloadOutlined
                        onClick={() => {
                            setLayoutConfig([...getLayout()]);
                            window.dispatchEvent(new Event('resize'));
                        }}
                    />
                </CVATTooltip>
            </div>
        </Layout.Content>
    );
}

CanvasLayout.defaultProps = {
    type: DimensionType.DIMENSION_2D,
};

CanvasLayout.PropType = {
    type: PropTypes.oneOf(Object.values(DimensionType)),
};

export default React.memo(CanvasLayout);
