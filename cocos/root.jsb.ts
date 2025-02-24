/*
 Copyright (c) 2022-2023 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

import { warnID } from '@base/debug';
import { cclegacy } from '@base/global';
import { memop } from '@base/utils';
import { DataPoolManager } from './3d/skeletal-animation/data-pool-manager';
import { Device, deviceManager } from './gfx';
import { settings, Settings, macro } from './core';
import { ForwardPipeline } from './rendering';
import type { Root as JsbRoot } from './root';

declare const nr: any;
declare const jsb: any;

export const Root: typeof JsbRoot = jsb.Root;
export type Root = JsbRoot;

enum LightType {
    DIRECTIONAL,
    SPHERE,
    SPOT,
    POINT,
    RANGED_DIRECTIONAL,
    UNKNOWN,
}

/**
 * @zh
 * Root描述信息
 */
export interface IRootInfo {
    enableHDR?: boolean;
}

const rootProto: any = Root.prototype;

rootProto._createBatcher2D = function () {
    if (!this._batcher && cclegacy.internal.Batcher2D) {
        this._batcher = new cclegacy.internal.Batcher2D(this);
        if (!this._batcher!.initialize()) {
            this._batcher = null;
            this.destroy();
            return;
        }
        this._batcher._nativeObj = this.getBatcher2D();
    }
}

Object.defineProperty(rootProto, 'batcher2D', {
    configurable: true,
    enumerable: true,
    get() {
        return this._batcher;
    },
});

Object.defineProperty(rootProto, 'dataPoolManager', {
    configurable: true,
    enumerable: true,
    get(): DataPoolManager {
        return this._dataPoolMgr;
    },
});

Object.defineProperty(rootProto, 'pipelineEvent', {
    configurable: true,
    enumerable: true,
    get() {
        return this._pipelineEvent;
    }
});

class DummyPipelineEvent {
    on(type: any, callback: any, target?: any, once?: boolean) { }
    once(type: any, callback: any, target?: any) { }
    off(type: any, callback?: any, target?: any) { }
    emit(type: any, arg0?: any, arg1?: any, arg2?: any, arg3?: any, arg4?: any) { }
    targetOff(typeOrTarget: any) { }
    removeAll(typeOrTarget: any) { }
    hasEventListener(type: any, callback?: any, target?: any): boolean { return false; }
}

rootProto._ctor = function (device: Device) {
    this._device = device;
    this._dataPoolMgr = cclegacy.internal.DataPoolManager && new cclegacy.internal.DataPoolManager(device) as DataPoolManager;
    this._modelPools = new Map();
    this._lightPools = new Map();
    this._batcher = null;
    this._pipelineEvent = new DummyPipelineEvent();
    this._registerListeners();
};

rootProto.initialize = function (info: IRootInfo) {
    // TODO:
    this._initialize(deviceManager.swapchain);
    const customJointTextureLayouts = settings.querySettings(Settings.Category.ANIMATION, 'customJointTextureLayouts') || [];
    this._dataPoolMgr?.jointTexturePool.registerCustomTextureLayouts(customJointTextureLayouts);
};

rootProto.createModel = function (ModelCtor) {
    let p = this._modelPools.get(ModelCtor);
    if (!p) {
        this._modelPools.set(ModelCtor, new memop.Pool(() => new ModelCtor(), 10, (obj) => obj.destroy()));
        p = this._modelPools.get(ModelCtor)!;
    }
    const model = p.alloc();
    model.initialize();
    return model;
};

rootProto.destroyModel = function (m) {
    const p = this._modelPools.get(m.constructor);
    if (p) {
        p.free(m);
        if (m.scene) {
            m.scene.removeModel(m);
        }
    } else {
        warnID(1300, m.constructor.name);
    }
    m.destroy();
};

rootProto.createLight = function (LightCtor) {
    let l = this._lightPools.get(LightCtor);
    if (!l) {
        this._lightPools.set(LightCtor, new memop.Pool(() => new LightCtor(), 4, (obj) => obj.destroy()));
        l = this._lightPools.get(LightCtor)!;
    }
    const light = l.alloc();
    light.initialize();
    return light;
};

rootProto.destroyLight = function (l) {
    if (l.scene) {
        switch (l.type) {
            case LightType.DIRECTIONAL:
                l.scene.removeDirectionalLight(l);
                break;
            case LightType.SPHERE:
                l.scene.removeSphereLight(l);
                break;
            case LightType.SPOT:
                l.scene.removeSpotLight(l);
                break;
            case LightType.POINT:
                l.scene.removePointLight(l);
                break;
            case LightType.RANGED_DIRECTIONAL:
                l.scene.removeRangedDirLight(l);
                break;
            default:
                break;
        }
    }
    l.destroy();
};

rootProto.recycleLight = function (l) {
    const p = this._lightPools.get(l.constructor);
    if (p) {
        p.free(l);
        if (l.scene) {
            switch (l.type) {
                case LightType.DIRECTIONAL:
                    l.scene.removeDirectionalLight(l);
                    break;
                case LightType.SPHERE:
                    l.scene.removeSphereLight(l);
                    break;
                case LightType.SPOT:
                    l.scene.removeSpotLight(l);
                    break;
                case LightType.POINT:
                    l.scene.removePointLight(l);
                    break;
                case LightType.RANGED_DIRECTIONAL:
                    l.scene.removeRangedDirLight(l);
                    break;
                default:
                    break;
            }
        }
    }
};

rootProto._onDirectorBeforeCommit = function () {
    cclegacy.director.emit(cclegacy.Director.EVENT_BEFORE_COMMIT);
};

rootProto._onDirectorBeforeRender = function () {
    cclegacy.director.emit(cclegacy.Director.EVENT_BEFORE_RENDER);
};

rootProto._onDirectorAfterRender = function () {
    cclegacy.director.emit(cclegacy.Director.EVENT_AFTER_RENDER);
};

rootProto._onDirectorPipelineChanged = function () {
    const scene = cclegacy.director.getScene();
    if (scene) {
        scene._activate();
    }
}

const oldOnGlobalPipelineStateChanged = rootProto.onGlobalPipelineStateChanged;
rootProto.onGlobalPipelineStateChanged = function() {
    oldOnGlobalPipelineStateChanged.call(this);
    const builder = cclegacy.rendering.getCustomPipeline(macro.CUSTOM_PIPELINE_NAME);
    if (builder) {
        if (typeof builder.onGlobalPipelineStateChanged === 'function') {
            builder.onGlobalPipelineStateChanged();
        }
    }
}

const oldFrameMove = rootProto.frameMove;
rootProto.frameMove = function (deltaTime: number) {
    oldFrameMove.call(this, deltaTime, cclegacy.director.getTotalFrames());
};

const oldSetPipeline = rootProto.setRenderPipeline;
rootProto.setRenderPipeline = function (pipeline) {
    let ppl;
    if (macro.CUSTOM_PIPELINE_NAME !== '' && cclegacy.rendering && this.usesCustomPipeline) {
        cclegacy.rendering.createCustomPipeline();
        ppl = oldSetPipeline.call(this, null);
    } else {
        if (!pipeline) {
            // pipeline should not be created in C++, ._ctor need to be triggered
            pipeline = new ForwardPipeline();
            pipeline.init();
        }
        ppl = oldSetPipeline.call(this, pipeline);
    }
    this._createBatcher2D();
    return ppl;
}

rootProto.addBatch = function (batch) {
    console.error('The Draw Batch class is implemented differently in the native platform and does not support this interface.');
}

rootProto.removeBatch = function (batch) {
    console.error('The Draw Batch class is implemented differently in the native platform and does not support this interface.');
}

rootProto.removeBatches = function () {
    console.error('The Draw Batch class is implemented differently in the native platform and does not support this interface.');
}
