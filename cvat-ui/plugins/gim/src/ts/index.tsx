// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { PluginEntryPoint, APIWrapperEnterOptions, ComponentBuilder } from 'components/plugins-entrypoint';

const builder = ({}) => {
    console.log('GROS CACA');

    return {};
};

function register(): void {
    if (Object.prototype.hasOwnProperty.call(window, 'cvatUI')) {
        (window as any as { cvatUI: { registerComponent: PluginEntryPoint } }).cvatUI.registerComponent(builder);
    }
}

window.addEventListener('plugins.ready', register, { once: true });
