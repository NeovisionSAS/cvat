// Copyright (C) 2024 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Button, Slider, Select, Switch, Typography } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { useOverlayContext } from 'components/annotation-page/overlay-context';

const { Text } = Typography;
const { Option } = Select;

const OverlayControls: React.FC = () => {
    const {
        warpedResult,
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
    } = useOverlayContext();

    if (!warpedResult) {
        return (
            <div style={{ padding: '4px 16px', borderTop: '1px solid #d9d9d9', backgroundColor: '#fafafa' }}>
                <Text type='secondary' style={{ fontSize: '12px' }}>
                    Warped: No
                </Text>
            </div>
        );
    }

    return (
        <div
            style={{
                padding: '4px 16px',
                borderTop: '1px solid #d9d9d9',
                backgroundColor: '#fafafa',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
            }}
        >
            <Text style={{ fontSize: '12px', fontWeight: 'bold' }}>Warped: Yes</Text>

            <Button
                type={overlayVisible ? 'primary' : 'default'}
                size='small'
                icon={overlayVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                onClick={() => setOverlayVisible(!overlayVisible)}
                title='Toggle overlay visibility'
            >
                {overlayVisible ? 'Hide' : 'Show'}
            </Button>

            {overlayVisible && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Text style={{ fontSize: '12px' }}>Opacity:</Text>
                        <Slider
                            min={0}
                            max={1}
                            step={0.1}
                            value={overlayOpacity}
                            onChange={setOverlayOpacity}
                            style={{ width: '80px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Text style={{ fontSize: '12px' }}>Color:</Text>
                        <input
                            type='color'
                            value={overlayColor}
                            onChange={(e) => setOverlayColor(e.target.value)}
                            style={{ width: '30px', height: '20px', border: 'none', cursor: 'pointer' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Text style={{ fontSize: '12px' }}>Invert:</Text>
                        <Switch size='small' checked={invertColors} onChange={setInvertColors} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Text style={{ fontSize: '12px' }}>Warp:</Text>
                        <Select size='small' value={warpType} onChange={setWarpType} style={{ width: '140px' }}>
                            <Option value='homography-v1'>Homography v1</Option>
                            <Option value='homography-v2'>Homography v2</Option>
                            <Option value='tps'>TPS</Option>
                        </Select>
                    </div>
                </>
            )}
        </div>
    );
};

export default OverlayControls;
