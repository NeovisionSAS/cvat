// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface OverlayContextType {
    overlayVisible: boolean;
    setOverlayVisible: (visible: boolean) => void;
    overlayOpacity: number;
    setOverlayOpacity: (opacity: number) => void;
    overlayColor: string;
    setOverlayColor: (color: string) => void;
    invertColors: boolean;
    setInvertColors: (invert: boolean) => void;
    warpType: 'homography-v1' | 'homography-v2' | 'tps';
    setWarpType: (type: 'homography-v1' | 'homography-v2' | 'tps') => void;
    warpedResult: string | null;
    setWarpedResult: (result: string | null) => void;
}

const OverlayContext = createContext<OverlayContextType | undefined>(undefined);

export const useOverlayContext = () => {
    const context = useContext(OverlayContext);
    if (!context) {
        throw new Error('useOverlayContext must be used within an OverlayProvider');
    }
    return context;
};

interface OverlayProviderProps {
    children: ReactNode;
}

export const OverlayProvider: React.FC<OverlayProviderProps> = ({ children }) => {
    const [overlayVisible, setOverlayVisible] = useState(true);
    const [overlayOpacity, setOverlayOpacity] = useState(90); // 0-100 scale for UI
    const [overlayColor, setOverlayColor] = useState('#00ff00');
    const [invertColors, setInvertColors] = useState(true);
    const [warpType, setWarpType] = useState<'homography-v1' | 'homography-v2' | 'tps'>('homography-v2');
    const [warpedResult, setWarpedResult] = useState<string | null>(null);

    const value = {
        overlayVisible,
        setOverlayVisible,
        overlayOpacity,
        setOverlayOpacity,
        overlayColor,
        setOverlayColor,
        invertColors,
        setInvertColors,
        warpType,
        setWarpType,
        warpedResult,
        setWarpedResult,
    };

    return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
};
