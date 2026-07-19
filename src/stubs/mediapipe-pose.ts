// SPDX-License-Identifier: AGPL-3.0-or-later
// 占位桩（stub）。
// 本项目使用 MoveNet 的 tfjs 运行时（runtime: 'tfjs'），不会实际加载 mediapipe 运行时，
// 此文件仅为满足 @tensorflow-models/pose-detection 对 "@mediapipe/pose" 的静态 import 而存在，
// 避免在无网络环境下安装 @mediapipe/pose。
export class Pose {
  // 占位构造，tfjs 运行时下不会被调用
  constructor(_options?: unknown) {}
}

export default Pose;
