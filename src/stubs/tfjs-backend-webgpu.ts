// SPDX-License-Identifier: AGPL-3.0-or-later
// 占位桩（stub）。
// @tensorflow-models/pose-detection 在 esm 入口静态 import 了 webgpu 后端，
// 但本项目的 MoveNet 仅使用 tfjs(webgl) 运行时，不会初始化 webgpu 后端，
// 故用占位桩满足打包/解析，避免在无网络环境下安装 @tensorflow/tfjs-backend-webgpu。
export const webgpu_util = {};

export class WebGPUBackend {
  constructor() {
    throw new Error('WebGPUBackend 为占位桩，本项目不使用 webgpu 运行时');
  }
}

export default WebGPUBackend;
