// SPDX-License-Identifier: AGPL-3.0-or-later
// 检测引擎抽象层（InferenceEngine）的公共类型。
// 设计目标：把“检测”与具体推理框架解耦，使第四级「拓展」关卡可在
//   - tfjs-coco     : TensorFlow.js + coco-ssd（封闭词汇 80 类，浏览器内即用）
//   - ort-yolo-world: ONNX Runtime Web + YOLO-World（开放词汇，文本提示任意类别）
// 之间切换，且上层（决策/渲染）代码完全不变。

export type DetectorEngine = 'tfjs-coco' | 'ort-yolo-world';

/**
 * YOLO-World（ort-web）的模型来源配置。
 * 用于在「页面内」加载模型，而无需服务器执行下载/导出脚本：
 *   - modelBuffer：浏览器内已读取的 ONNX 字节（页面上传文件 / 从 URL fetch）。优先级最高。
 *   - modelUrl：静态或远程 ONNX 地址（默认 /models/yolo-world/yolo-world.onnx）。
 *   - wasmPaths：ort-web 的 wasm 运行时目录（默认 /models/yolo-world/wasm/，由 Vite 插件托管）。
 * 注：export_onnx.py（PyTorch）无法在浏览器执行；页面只负责“加载已导出的 ONNX”。
 */
export interface YoloWorldConfig {
  modelBuffer?: ArrayBuffer;
  modelUrl?: string;
  wasmPaths?: string;
}

export interface DetectInput {
  htmlVideo?: HTMLVideoElement;
  htmlImage?: HTMLImageElement;
  htmlCanvas?: HTMLCanvasElement;
}

export interface DetectedObject {
  /** 像素坐标 [x, y, width, height]，原点在左上角（已映射回原始画面尺寸）。 */
  bbox: [number, number, number, number];
  /** 英文/提示类别名。 */
  className: string;
  /** 中文显示名。 */
  labelZh: string;
  /** 置信度 0~1。 */
  score: number;
}

export interface DetectOptions {
  maxBoxes?: number;
  minScore?: number;
  /** 开放词汇模型的文本提示（逗号分隔的类别名），仅 ort-yolo-world 使用。 */
  prompts?: string[];
}

/** 小车的驾驶决策（与具体检测引擎无关，只依赖 DetectedObject）。 */
export interface DrivingDecision {
  command: 'F' | 'L' | 'R' | 'S';
  labelZh: string;
  reason: string;
  trigger?: DetectedObject;
}

export interface DetectorBackend {
  readonly engine: DetectorEngine;
  readonly name: string;
  /** 是否支持开放词汇（文本提示）。 */
  readonly openVocabulary: boolean;
  /** 默认类别词汇（开放词汇模型可在运行时用 prompts 覆盖）。 */
  readonly defaultClasses: string[];
  /** 加载模型权重（幂等）。开放词汇模型可在此时传入提示以锁定词汇表。 */
  load(prompts?: string[]): Promise<void>;
  detect(input: DetectInput, opts?: DetectOptions): Promise<DetectedObject[]>;
  dispose?(): Promise<void>;
}
