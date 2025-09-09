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
import Button from 'antd/lib/button';
import Slider from 'antd/lib/slider';
import Select from 'antd/lib/select';
import Switch from 'antd/lib/switch';
import Typography from 'antd/lib/typography';
import {
    CloseOutlined,
    DragOutlined,
    FullscreenExitOutlined,
    FullscreenOutlined,
    PicCenterOutlined,
    PlusOutlined,
    ReloadOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
} from '@ant-design/icons';

import config from 'config';
import { DimensionType } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';
import notification from 'antd/lib/notification';
import { useOverlayContext } from 'components/annotation-page/overlay-context';
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
import { TPS } from 'transformation-models';

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

    // Use overlay context for shared state
    const { overlayVisible, overlayOpacity, overlayColor, invertColors, warpType } = useOverlayContext();

    // Convert opacity from 0-100 scale to 0-1 scale for processing
    const overlayOpacityFloat = overlayOpacity / 100;

    // Local state for warped result
    const [warpedResult, setWarpedResult] = useState<string | null>(null);

    // Get clean image without annotations from the displayed canvas
    const getRawCanvasImage = useCallback(async (): Promise<HTMLCanvasElement | null> => {
        console.log('getRawCanvasImage: Starting - canvasInstance exists:', !!canvasInstance, 'frame:', frame);
        try {
            if (canvasInstance) {
                console.log('getRawCanvasImage: Attempting to get canvas element');

                // Get the actual canvas element being displayed
                const canvasWrapper = document.getElementById('cvat_canvas_wrapper') as HTMLDivElement;
                const backgroundCanvas = document.getElementById('cvat_canvas_background') as HTMLCanvasElement;

                if (backgroundCanvas) {
                    console.log(
                        'getRawCanvasImage: Found background canvas, size:',
                        backgroundCanvas.width,
                        'x',
                        backgroundCanvas.height,
                    );
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    canvas.width = backgroundCanvas.width;
                    canvas.height = backgroundCanvas.height;

                    if (ctx) {
                        // Copy the background canvas (which contains the clean image)
                        ctx.drawImage(backgroundCanvas, 0, 0);
                        console.log('getRawCanvasImage: Successfully copied background canvas');

                        // Debug: Check if we're getting actual image data
                        const testData = ctx.getImageData(
                            0,
                            0,
                            Math.min(50, canvas.width),
                            Math.min(50, canvas.height),
                        );
                        const hasData = Array.from(testData.data).some((val) => val > 0);
                        console.log('getRawCanvasImage: Canvas has image data:', hasData);

                        return canvas;
                    }
                }

                // Fallback: try to get from job if background canvas not available
                console.log('getRawCanvasImage: Background canvas not found, trying job method');
                if (job) {
                    const frameData = await job.frames.get(frame);
                    const imageData = await frameData.data();

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
                    }
                }
            } else {
                console.log('getRawCanvasImage: No canvas instance available');
            }
        } catch (error) {
            console.error('getRawCanvasImage: Error:', error);
        }
        console.log('getRawCanvasImage: Returning null');
        return null;
    }, [canvasInstance, frame, job]);

    const processImageData = (
        canvas: HTMLCanvasElement,
        tintColor: string,
        shouldInvert: boolean,
    ): HTMLCanvasElement => {
        console.log(
            'processImageData - Starting with canvas size:',
            canvas.width,
            'x',
            canvas.height,
            'tint:',
            tintColor,
            'invert:',
            shouldInvert,
        );

        const processedCanvas = document.createElement('canvas');
        const processedCtx = processedCanvas.getContext('2d')!;
        processedCanvas.width = canvas.width;
        processedCanvas.height = canvas.height;

        processedCtx.drawImage(canvas, 0, 0);
        const imageData = processedCtx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const hexColor = tintColor.replace('#', '');
        const tintR = parseInt(hexColor.substr(0, 2), 16);
        const tintG = parseInt(hexColor.substr(2, 2), 16);
        const tintB = parseInt(hexColor.substr(4, 2), 16);

        console.log('processImageData - Tint RGB:', tintR, tintG, tintB);

        let processedPixels = 0;
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha === 0) continue;

            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            if (shouldInvert) {
                r = 255 - r;
                g = 255 - g;
                b = 255 - b;
            }

            const brightness = (r + g + b) * 0.0013072;
            data[i] = Math.floor(tintR * brightness);
            data[i + 1] = Math.floor(tintG * brightness);
            data[i + 2] = Math.floor(tintB * brightness);

            processedPixels++;
        }

        console.log('processImageData - Processed', processedPixels, 'pixels');
        processedCtx.putImageData(imageData, 0, 0);
        return processedCanvas;
    };

    // Resample a polyline's points to a target number of point pairs (uniform sampling)
    const resamplePoints = (points: number[], targetPairs: number): number[] => {
        const pairs = Math.floor(points.length / 2);
        if (pairs <= targetPairs) return points.slice(0, targetPairs * 2);

        const sampled: number[] = [];
        if (targetPairs === 1) {
            sampled.push(points[0], points[1]);
            return sampled;
        }

        for (let i = 0; i < targetPairs; i++) {
            const t = i / (targetPairs - 1);
            const idx = Math.round(t * (pairs - 1)) * 2;
            sampled.push(points[idx], points[idx + 1]);
        }

        return sampled;
    };

    // --- Generic helpers for polyline handling (refactored) ---
    const avgXOfPoints = (points: number[]): number => {
        if (!points || points.length === 0) return 0;
        let s = 0;
        let c = 0;
        for (let i = 0; i < points.length; i += 2) {
            s += points[i];
            c += 1;
        }
        return c ? s / c : 0;
    };

    const groupPolylinesBySide = (annotations: any[], fullWidth: number) => {
        const half = fullWidth / 2;
        const left: any[] = [];
        const right: any[] = [];
        for (const p of annotations) {
            const pts: number[] = p.points;
            const avg = avgXOfPoints(pts);
            if (avg < half) left.push(p);
            else right.push(p);
        }
        return { left, right };
    };

    const chooseLongestPoints = (group: any[]): number[] => {
        if (!group || group.length === 0) return [];
        const sorted = [...group].sort((a: any, b: any) => b.points.length - a.points.length);
        return sorted[0].points.slice();
    };

    const splitPolylineByXMedian = (points: number[]): { left: number[]; right: number[] } => {
        if (!points || points.length < 4) return { left: [], right: [] };
        const xs: number[] = [];
        for (let i = 0; i < points.length; i += 2) xs.push(points[i]);
        const median = xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
        const leftPts: number[] = [];
        const rightPts: number[] = [];
        for (let i = 0; i < points.length; i += 2) {
            if (points[i] < median) leftPts.push(points[i], points[i + 1]);
            else rightPts.push(points[i], points[i + 1]);
        }
        return { left: leftPts, right: rightPts };
    };

    const fallbackTwoLongestOrSplit = (annotations: any[], fullWidth: number, requiredCoords: number) => {
        const sorted = [...annotations].sort((a: any, b: any) => b.points.length - a.points.length);
        const a = sorted[0] ? sorted[0].points.slice() : [];
        const b = sorted[1] ? sorted[1].points.slice() : [];

        const avgA = avgXOfPoints(a);
        const avgB = avgXOfPoints(b);
        const half = fullWidth / 2;

        if (
            a.length >= requiredCoords &&
            b.length >= requiredCoords &&
            ((avgA < half && avgB >= half) || (avgA >= half && avgB < half))
        ) {
            return { first: a, second: b };
        }

        // Otherwise split the longest by median
        const pts = a.length >= b.length ? a : b;
        const { left, right } = splitPolylineByXMedian(pts);
        return { first: left, second: right };
    };

    const mergePolylinesPerSide = (annotations: any[], fullWidth: number) => {
        const half = fullWidth / 2;
        const mergedLeft: number[] = [];
        const mergedRight: number[] = [];
        for (const p of annotations) {
            const pts: number[] = p.points;
            const avg = avgXOfPoints(pts);
            if (avg < half) mergedLeft.push(...pts);
            else mergedRight.push(...pts);
        }
        return { mergedLeft, mergedRight };
    };

    const normalizeAndResamplePairs = (
        left: number[],
        right: number[],
        warpTypeLocal: 'tps' | 'homography',
    ): { ok: boolean; leftOut: number[]; rightOut: number[] } => {
        const minPointsLocal = warpTypeLocal === 'tps' ? 6 : 4;
        const availablePairsLeft = Math.floor(left.length / 2);
        const availablePairsRight = Math.floor(right.length / 2);
        let pairsToUse = Math.min(availablePairsLeft, availablePairsRight);

        if (pairsToUse * 2 >= minPointsLocal) {
            const targetPairs = pairsToUse;
            const l = resamplePoints(left, targetPairs);
            const r = resamplePoints(right, targetPairs);
            if (l.length >= minPointsLocal && r.length >= minPointsLocal && l.length === r.length) {
                return { ok: true, leftOut: l, rightOut: r };
            }
        }
        return { ok: false, leftOut: left, rightOut: right };
    };

    // --- End helpers ---

    // Homography-based warping (centroid alignment)
    const homography = (
        canvasElement: HTMLCanvasElement,
        firstPolyline: number[],
        secondPolyline: number[],
        tintColor: string = '#00ff00',
        shouldInvert: boolean = true,
    ): string => {
        const ctx = canvasElement.getContext('2d')!;
        const halfWidth = canvasElement.width / 2;

        // Split image
        const leftCanvas = document.createElement('canvas');
        const rightCanvas = document.createElement('canvas');
        const leftCtx = leftCanvas.getContext('2d')!;
        const rightCtx = rightCanvas.getContext('2d')!;

        leftCanvas.width = halfWidth;
        rightCanvas.width = halfWidth;
        leftCanvas.height = canvasElement.height;
        rightCanvas.height = canvasElement.height;

        leftCtx.putImageData(ctx.getImageData(0, 0, halfWidth, canvasElement.height), 0, 0);
        rightCtx.putImageData(ctx.getImageData(halfWidth, 0, halfWidth, canvasElement.height), 0, 0);

        // Convert points
        const srcPoints = [];
        const dstPoints = [];
        for (let i = 0; i < firstPolyline.length; i += 2) {
            srcPoints.push([firstPolyline[i], firstPolyline[i + 1]]);
            dstPoints.push([secondPolyline[i] - halfWidth, secondPolyline[i + 1]]);
        }

        // Calculate centroids
        const srcCentroidX = srcPoints.reduce((sum, p) => sum + p[0], 0) / srcPoints.length;
        const srcCentroidY = srcPoints.reduce((sum, p) => sum + p[1], 0) / srcPoints.length;
        const dstCentroidX = dstPoints.reduce((sum, p) => sum + p[0], 0) / dstPoints.length;
        const dstCentroidY = dstPoints.reduce((sum, p) => sum + p[1], 0) / dstPoints.length;

        // Calculate scale
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

        const scaleX = (dstBounds.maxX - dstBounds.minX) / (srcBounds.maxX - srcBounds.minX);
        const scaleY = (dstBounds.maxY - dstBounds.minY) / (srcBounds.maxY - srcBounds.minY);

        // Create result
        const warpedCanvas = document.createElement('canvas');
        const warpedCtx = warpedCanvas.getContext('2d')!;
        warpedCanvas.width = halfWidth;
        warpedCanvas.height = canvasElement.height;

        warpedCtx.drawImage(rightCanvas, 0, 0);
        console.log('Homography - Drew right canvas as base');

        const processedLeft = processImageData(leftCanvas, tintColor, shouldInvert);
        console.log('Homography - Processed left image with tint:', tintColor, 'invert:', shouldInvert);

        warpedCtx.save();
        warpedCtx.globalCompositeOperation = 'screen';
        warpedCtx.translate(dstCentroidX - srcCentroidX * scaleX, dstCentroidY - srcCentroidY * scaleY);
        warpedCtx.scale(scaleX, scaleY);
        warpedCtx.drawImage(processedLeft, 0, 0);
        warpedCtx.restore();
        console.log('Homography - Drew processed left image over right base with screen blend mode');

        return warpedCanvas.toDataURL();
    };

    // TPS (Thin Plate Spline) warping for accurate point-to-point deformation
    const tps = async (
        canvasElement: HTMLCanvasElement,
        firstPolyline: number[],
        secondPolyline: number[],
        tintColor: string = '#00ff00',
        shouldInvert: boolean = true,
    ): Promise<string> => {
        console.log('TPS - Starting TPS transformation');
        const ctx = canvasElement.getContext('2d')!;
        const halfWidth = canvasElement.width / 2;

        // Split image
        const leftCanvas = document.createElement('canvas');
        const rightCanvas = document.createElement('canvas');
        const leftCtx = leftCanvas.getContext('2d')!;
        const rightCtx = rightCanvas.getContext('2d')!;

        leftCanvas.width = halfWidth;
        rightCanvas.width = halfWidth;
        leftCanvas.height = canvasElement.height;
        rightCanvas.height = canvasElement.height;

        leftCtx.putImageData(ctx.getImageData(0, 0, halfWidth, canvasElement.height), 0, 0);
        rightCtx.putImageData(ctx.getImageData(halfWidth, 0, halfWidth, canvasElement.height), 0, 0);

        // Convert points to coordinate pairs for TPS inverse transformation
        // We need: output coordinates -> input coordinates
        const outputPoints = []; // Points in the output (right side coordinates, adjusted)
        const inputPoints = []; // Corresponding points in input (left side coordinates)
        for (let i = 0; i < firstPolyline.length; i += 2) {
            // Output coordinates: right side points adjusted to 0-based half-width
            outputPoints.push([secondPolyline[i] - halfWidth, secondPolyline[i + 1]]);
            // Input coordinates: left side points
            inputPoints.push([firstPolyline[i], firstPolyline[i + 1]]);
        }

        console.log(`TPS - Processing ${inputPoints.length} control point pairs`);
        console.log('TPS - Input points (left side):', inputPoints);
        console.log('TPS - Output points (right side):', outputPoints);

        const warpedCanvas = document.createElement('canvas');
        const warpedCtx = warpedCanvas.getContext('2d')!;
        warpedCanvas.width = halfWidth;
        warpedCanvas.height = canvasElement.height;

        // Start with the right canvas as base
        warpedCtx.drawImage(rightCanvas, 0, 0);
        console.log('TPS - Drew right canvas as base');

        if (inputPoints.length >= 3) {
            try {
                // Create TPS transformation with source and target points directly
                console.log('TPS - Creating TPS transformation object');
                const tpsTransform = new (TPS as any)(inputPoints, outputPoints);

                // Process and apply color tinting to the left image first (same as homography)
                const processedLeft = processImageData(leftCanvas, tintColor, shouldInvert);
                console.log('TPS - Processed left image with tint:', tintColor, 'invert:', shouldInvert);

                // Apply TPS warping using same blend mode as homography
                warpedCtx.save();
                warpedCtx.globalCompositeOperation = 'screen'; // Same as homography

                // Create a temporary canvas for the warped processed image
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d')!;
                tempCanvas.width = halfWidth;
                tempCanvas.height = canvasElement.height;

                // Get source image data from processed left
                const processedCtx = processedLeft.getContext('2d')!;
                const sourceImageData = processedCtx.getImageData(0, 0, halfWidth, canvasElement.height);
                const sourceData = sourceImageData.data;

                // Create output image data for warped result
                const warpedImageData = tempCtx.createImageData(halfWidth, canvasElement.height);
                const warpedData = warpedImageData.data;

                console.log(`TPS - Applying TPS warping to ${halfWidth}x${canvasElement.height} pixels`);

                let transformedPixels = 0;
                let skippedPixels = 0;

                // Apply TPS transformation pixel by pixel
                for (let destY = 0; destY < canvasElement.height; destY++) {
                    for (let destX = 0; destX < halfWidth; destX++) {
                        const outIndex = (destY * halfWidth + destX) * 4;

                        try {
                            // Use inverse transformation to map from output to input coordinates
                            const sourcePoint = (tpsTransform as any).inverse([destX, destY]);
                            const srcX = sourcePoint[0];
                            const srcY = sourcePoint[1];

                            // Check if source coordinates are within bounds
                            if (srcX >= 0 && srcX < halfWidth - 1 && srcY >= 0 && srcY < canvasElement.height - 1) {
                                // Bilinear interpolation for smooth results
                                const x0 = Math.floor(srcX);
                                const x1 = Math.min(x0 + 1, halfWidth - 1);
                                const y0 = Math.floor(srcY);
                                const y1 = Math.min(y0 + 1, canvasElement.height - 1);

                                const dx = srcX - x0;
                                const dy = srcY - y0;

                                // Get the four surrounding pixels
                                const idx00 = (y0 * halfWidth + x0) * 4;
                                const idx01 = (y0 * halfWidth + x1) * 4;
                                const idx10 = (y1 * halfWidth + x0) * 4;
                                const idx11 = (y1 * halfWidth + x1) * 4;

                                // Interpolate each color channel
                                for (let c = 0; c < 4; c++) {
                                    const val00 = sourceData[idx00 + c];
                                    const val01 = sourceData[idx01 + c];
                                    const val10 = sourceData[idx10 + c];
                                    const val11 = sourceData[idx11 + c];

                                    const val0 = val00 * (1 - dx) + val01 * dx;
                                    const val1 = val10 * (1 - dx) + val11 * dx;
                                    const finalVal = val0 * (1 - dy) + val1 * dy;

                                    warpedData[outIndex + c] = Math.round(finalVal);
                                }

                                transformedPixels++;
                            } else {
                                // Outside bounds - make transparent
                                warpedData[outIndex + 0] = 0; // R
                                warpedData[outIndex + 1] = 0; // G
                                warpedData[outIndex + 2] = 0; // B
                                warpedData[outIndex + 3] = 0; // A
                                skippedPixels++;
                            }
                        } catch (tpsError) {
                            // If TPS calculation fails for this pixel, make it transparent
                            warpedData[outIndex + 0] = 0;
                            warpedData[outIndex + 1] = 0;
                            warpedData[outIndex + 2] = 0;
                            warpedData[outIndex + 3] = 0;
                            skippedPixels++;
                        }
                    }
                }

                console.log(`TPS - Transformed ${transformedPixels} pixels, skipped ${skippedPixels} pixels`);

                // Put the warped image data to temp canvas
                tempCtx.putImageData(warpedImageData, 0, 0);

                // Now draw the warped image using exact same method as homography
                warpedCtx.drawImage(tempCanvas, 0, 0);
                warpedCtx.restore();
                console.log('TPS - Drew warped processed left image over right base');

                console.log('TPS - TPS warping completed successfully');
            } catch (error) {
                console.error('TPS - Error in TPS transformation:', error);

                // Show notification about TPS error
                notification.error({
                    message: 'TPS Warping Error',
                    description: `TPS transformation failed: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }. Please check your polylines or try using Homography mode instead.`,
                    placement: 'topRight',
                    duration: 5,
                    className: 'cvat-notification-tps-error',
                });

                // Return empty string to prevent overlay display when there's an error
                console.log('TPS - Returning empty string due to error, no overlay will be shown');
                return '';
            }
        } else if (inputPoints.length === 2) {
            // For 2 points, use simple scaling and translation
            console.log('TPS - Using 2-point transformation (similarity)');
            const src1 = inputPoints[0],
                src2 = inputPoints[1];
            const dst1 = outputPoints[0],
                dst2 = outputPoints[1];

            const srcVec = [src2[0] - src1[0], src2[1] - src1[1]];
            const dstVec = [dst2[0] - dst1[0], dst2[1] - dst1[1]];
            const srcLen = Math.sqrt(srcVec[0] * srcVec[0] + srcVec[1] * srcVec[1]);
            const dstLen = Math.sqrt(dstVec[0] * dstVec[0] + dstVec[1] * dstVec[1]);

            const processedLeft = processImageData(leftCanvas, tintColor, shouldInvert);
            warpedCtx.save();
            warpedCtx.globalCompositeOperation = 'screen';

            if (srcLen > 0 && dstLen > 0) {
                const scale = dstLen / srcLen;
                const angle = Math.atan2(dstVec[1], dstVec[0]) - Math.atan2(srcVec[1], srcVec[0]);
                warpedCtx.translate(dst1[0], dst1[1]);
                warpedCtx.rotate(angle);
                warpedCtx.scale(scale, scale);
                warpedCtx.translate(-src1[0], -src1[1]);
                warpedCtx.drawImage(processedLeft, 0, 0);
            } else {
                warpedCtx.translate(dst1[0] - src1[0], dst1[1] - src1[1]);
                warpedCtx.drawImage(processedLeft, 0, 0);
            }
            warpedCtx.restore();
        } else {
            // Fallback for insufficient points
            console.log('TPS - Insufficient points, using simple overlay');
            const processedLeft = processImageData(leftCanvas, tintColor, shouldInvert);
            warpedCtx.save();
            warpedCtx.globalCompositeOperation = 'screen';
            if (inputPoints.length === 1) {
                const src = inputPoints[0];
                const dst = outputPoints[0];
                warpedCtx.translate(dst[0] - src[0], dst[1] - src[1]);
            }
            warpedCtx.drawImage(processedLeft, 0, 0);
            warpedCtx.restore();
        }

        return warpedCanvas.toDataURL();
    };
    const createWarpedImage = async (
        canvasElement: HTMLCanvasElement,
        firstPolyline: number[],
        secondPolyline: number[],
        tintColor: string = '#00ff00',
        shouldInvert: boolean = true,
        transformType: 'homography' | 'tps' = 'tps',
    ): Promise<string> => {
        console.log(
            'createWarpedImage: Starting with',
            transformType,
            'canvas size:',
            canvasElement.width,
            'x',
            canvasElement.height,
        );
        console.log(
            'createWarpedImage: First polyline length:',
            firstPolyline.length,
            'Second polyline length:',
            secondPolyline.length,
        );
        console.log('createWarpedImage: Tint color:', tintColor, 'Invert:', shouldInvert);

        if (transformType === 'homography') {
            return homography(canvasElement, firstPolyline, secondPolyline, tintColor, shouldInvert);
        } else {
            return await tps(canvasElement, firstPolyline, secondPolyline, tintColor, shouldInvert);
        }
    };

    // Process warping with clean image
    const processWarping = useCallback(async () => {
        try {
            console.log('processWarping: Starting...');
            let rawCanvas = await getRawCanvasImage();

            // Fallback to current canvas if job method fails
            if (!rawCanvas && canvasInstance) {
                console.log('processWarping: Using fallback canvas method');
                const currentCanvas = document.querySelector('canvas') as HTMLCanvasElement;
                if (currentCanvas) {
                    rawCanvas = document.createElement('canvas');
                    const ctx = rawCanvas.getContext('2d');
                    rawCanvas.width = currentCanvas.width;
                    rawCanvas.height = currentCanvas.height;
                    if (ctx) {
                        ctx.drawImage(currentCanvas, 0, 0);
                    }
                }
            }

            if (rawCanvas && annotations) {
                console.log(
                    'processWarping: Have raw canvas and annotations, canvas size:',
                    rawCanvas.width,
                    'x',
                    rawCanvas.height,
                );

                const frameAnnotations = annotations.states.filter(
                    (state: any) =>
                        state.frame === frame &&
                        (state.shapeType === 'polygon' || state.shapeType === 'polyline') &&
                        !state.outside, // Exclude annotations marked as outside
                );

                console.log('processWarping: Found', frameAnnotations.length, 'annotations for frame', frame);

                // Handle polygons (existing logic)
                const polygonAnnotations = frameAnnotations.filter((state: any) => state.shapeType === 'polygon');
                if (polygonAnnotations.length >= 2) {
                    console.log('processWarping: Using polygon warping with', polygonAnnotations.length, 'polygons');
                    const firstPolyline = polygonAnnotations[0].points;
                    const secondPolyline = polygonAnnotations[1].points;

                    console.log('processWarping: First polygon points:', firstPolyline.length / 2, 'pairs');
                    console.log('processWarping: Second polygon points:', secondPolyline.length / 2, 'pairs');

                    const warpedImageUrl = await createWarpedImage(
                        rawCanvas,
                        firstPolyline,
                        secondPolyline,
                        overlayColor,
                        invertColors,
                        warpType,
                    );
                    console.log('processWarping: Generated warped image from polygons');

                    // Only set result if warpedImageUrl is valid (not empty)
                    if (warpedImageUrl && warpedImageUrl.trim() !== '') {
                        setWarpedResult(warpedImageUrl);
                    } else {
                        console.log('processWarping: Warped image creation failed, clearing result');
                        setWarpedResult(null);
                    }
                    return;
                }

                // Handle polylines (directional approach)
                // Polylines are directional: first coord for left image, second coord for right image
                const polylineAnnotations = frameAnnotations.filter((state: any) => state.shapeType === 'polyline');
                if (polylineAnnotations.length >= 1) {
                    console.log(`processWarping: Found ${polylineAnnotations.length} directional polyline(s)`);

                    // Collect all points from all polylines and separate into left/right
                    let leftPoints: number[] = [];
                    let rightPoints: number[] = [];

                    for (const polyline of polylineAnnotations) {
                        const points = polyline.points;
                        console.log(`processWarping: Processing polyline with ${points.length / 2} point pairs`);

                        // Extract alternating coordinates: first for left, second for right
                        for (let i = 0; i < points.length; i += 4) {
                            if (i + 3 < points.length) {
                                // First coordinate pair (left image)
                                leftPoints.push(points[i], points[i + 1]);
                                // Second coordinate pair (right image)
                                rightPoints.push(points[i + 2], points[i + 3]);
                            }
                        }
                    }

                    console.log(
                        `processWarping: Extracted ${leftPoints.length / 2} left points and ${
                            rightPoints.length / 2
                        } right points from directional polylines`,
                    );

                    if (leftPoints.length >= 6 && rightPoints.length >= 6) {
                        // Need at least 3 point pairs for warping
                        const warpedImageUrl = await createWarpedImage(
                            rawCanvas,
                            leftPoints,
                            rightPoints,
                            overlayColor,
                            invertColors,
                            warpType,
                        );
                        console.log('processWarping: Warped image created from directional polylines');

                        // Only set result if warpedImageUrl is valid (not empty)
                        if (warpedImageUrl && warpedImageUrl.trim() !== '') {
                            setWarpedResult(warpedImageUrl);
                        } else {
                            console.log('processWarping: Warped image creation failed, clearing result');
                            setWarpedResult(null);
                        }
                        return;
                    } else {
                        console.log('processWarping: Need at least 3 point pairs (6 points) on each side for warping');
                    }
                }

                console.log(
                    'processWarping: Need at least 2 polygons or 1+ directional polylines with 3+ point pairs for warping',
                );

                console.log('processWarping: No suitable annotations found');
                setWarpedResult(null);
            } else {
                console.log('processWarping: Missing prerequisites');
                setWarpedResult(null);
            }
        } catch (error) {
            console.error('processWarping: Error:', error);
            setWarpedResult(null);
        }
    }, [annotations, frame, getRawCanvasImage, canvasInstance, overlayColor, invertColors, warpType]);

    // No complex debounced update needed with simple image element approach

    // Cache the last processed frame and annotation fingerprint to avoid unnecessary recomputation
    const [lastProcessedFingerprint, setLastProcessedFingerprint] = useState<string>('');
    const [debounceTimeoutId, setDebounceTimeoutId] = useState<NodeJS.Timeout | null>(null);

    // Create a stable fingerprint of relevant annotation data
    const annotationFingerprint = useMemo(() => {
        if (!annotations?.states) return '';

        const relevantStates = annotations.states
            .filter((state: any) => state.frame === frame && !state.outside)
            .filter((state: any) => state.shapeType === 'polygon' || state.shapeType === 'polyline')
            .map((state: any) => {
                // Include coordinates in fingerprint to detect keypoint movements
                const pointsStr = state.points ? state.points.join(',') : '';
                return `${state.clientID}:${state.shapeType}:${pointsStr}`;
            })
            .sort()
            .join('|');

        // Include overlay settings in fingerprint so changes trigger reprocessing
        return `${frame}:${warpType}:${overlayColor}:${invertColors}:${relevantStates}`;
    }, [annotations?.states, frame, warpType, overlayColor, invertColors]); // Include overlay settings

    useEffect(() => {
        console.log(
            'Annotation fingerprint useEffect triggered - fingerprint changed:',
            annotationFingerprint !== lastProcessedFingerprint,
        );

        // Only process if the fingerprint has actually changed
        if (annotationFingerprint !== lastProcessedFingerprint && annotationFingerprint !== '') {
            const relevantAnnotationCount = annotationFingerprint.split('|').filter((s) => s).length;

            // Clear any existing timeout
            if (debounceTimeoutId) {
                clearTimeout(debounceTimeoutId);
            }

            // Process warping when we have at least 1 relevant annotation
            if (relevantAnnotationCount >= 1) {
                console.log('Fingerprint changed, processing warping after debounce delay...');
                // Use longer debounce for coordinate changes to avoid rapid-fire updates during dragging
                const timeoutId = setTimeout(() => {
                    console.log('Fingerprint useEffect: About to call processWarping');
                    processWarping();
                    setLastProcessedFingerprint(annotationFingerprint);
                }, 300); // Increased debounce to 300ms for smoother dragging

                setDebounceTimeoutId(timeoutId);

                return () => {
                    clearTimeout(timeoutId);
                    setDebounceTimeoutId(null);
                };
            } else {
                console.log('Fingerprint useEffect: Not enough annotations, clearing warped result');
                setWarpedResult(null);
                setLastProcessedFingerprint(annotationFingerprint);
            }
        }
    }, [annotationFingerprint, processWarping]); // Removed overlayColor and invertColors since they're in fingerprint

    // Temporary test effect - create a simple test overlay to verify the system works
    useEffect(() => {
        // Check if we have no relevant annotations by examining the fingerprint
        const hasAnnotations =
            annotationFingerprint &&
            annotationFingerprint.includes('|') &&
            annotationFingerprint.split('|').filter((s) => s).length > 0;

        if (canvasInstance && !hasAnnotations) {
            console.log('Creating simple test overlay - no annotations present');
            // Create a simple test overlay with half green, half transparent
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 400; // Simulate half-width result
            testCanvas.height = 300;
            const ctx = testCanvas.getContext('2d');
            if (ctx) {
                // Fill with green color (similar to the warped overlay effect)
                ctx.fillStyle = overlayColor;
                ctx.fillRect(0, 0, testCanvas.width, testCanvas.height);

                // Add some pattern to make it obvious this is the overlay
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                for (let i = 0; i < testCanvas.width; i += 20) {
                    ctx.fillRect(i, 0, 10, testCanvas.height);
                }

                const testDataUrl = testCanvas.toDataURL();
                console.log('Test overlay created with color:', overlayColor);
                setWarpedResult(testDataUrl);
            }
        }
    }, [canvasInstance, annotationFingerprint]); // overlayColor is now included in annotationFingerprint

    // Debug effect to track warpedResult changes
    useEffect(() => {
        console.log(
            'WarpedResult changed:',
            warpedResult ? 'Generated' : 'Null',
            warpedResult ? warpedResult.substring(0, 50) + '...' : 'N/A',
        );
    }, [warpedResult]);

    // No need to cache the warped image anymore since we're using img element directly

    // Optimized opacity change handler - updated for container structure
    useEffect(() => {
        if (overlayVisible) {
            const overlayContainer = document.getElementById('warp-overlay-element') as HTMLDivElement;
            if (overlayContainer) {
                const overlayImage = overlayContainer.querySelector('img') as HTMLImageElement;
                if (overlayImage) {
                    overlayImage.style.opacity = overlayOpacityFloat.toString();
                }
            }
        }
    }, [overlayOpacityFloat, overlayVisible]);

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
    }, [canvasInstance]); // Remove processWarping to prevent infinite loop

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
                    overlayContainer.style.zIndex = '2'; // Low positive z-index to appear between background and annotations
                    overlayContainer.style.overflow = 'hidden'; // Clip the content

                    // Create the image element inside the container
                    const overlayImage = document.createElement('img');
                    overlayImage.src = warpedResult;
                    overlayImage.style.position = 'absolute';
                    overlayImage.style.top = '0';
                    overlayImage.style.left = '50%'; // Position so it appears on the right half
                    overlayImage.style.width = '50%'; // The warped result canvas is halfWidth, so this stretches it to fit the right half
                    overlayImage.style.height = '100%';
                    overlayImage.style.opacity = overlayOpacityFloat.toString();
                    overlayImage.style.objectFit = 'fill'; // Fill the entire right half area (changed from 'cover')
                    overlayImage.style.imageRendering = 'pixelated'; // Keep sharp pixels

                    console.log('Creating overlay image with src:', warpedResult.substring(0, 50), '...');
                    console.log('Overlay opacity:', overlayOpacityFloat, 'Overlay visible:', overlayVisible);

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
    }, [canvasInstance, warpedResult, overlayVisible, overlayOpacityFloat]);

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

    // Overlay Controls Component
    const { Text } = Typography;
    const { Option } = Select;

    const OverlayControlsBar = () => {
        if (!warpedResult) {
            return (
                <div
                    style={{
                        padding: '8px 16px',
                        borderBottom: '1px solid #d9d9d9',
                        backgroundColor: '#fafafa',
                        fontSize: '12px',
                        color: '#666',
                    }}
                >
                    Warped: No
                </div>
            );
        }

        return (
            <div
                style={{
                    padding: '8px 16px',
                    borderBottom: '1px solid #d9d9d9',
                    backgroundColor: '#fafafa',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#000',
                }}
            >
                Warped: Yes
            </div>
        );
    };

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
                    resizeHandle={() => <div className='cvat-grid-item-resize-handler react-resizable-handle' />}
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

                                {/* Removed debug overlay controls - moved to top bar */}

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
