// SPDX-License-Identifier: AGPL-3.0-or-later
// 检测引擎抽象层（InferenceEngine）的公共类型。
// 设计目标：把“检测”与具体推理框架解耦，使第四级「拓展」关卡可在
//   - tfjs-coco     : TensorFlow.js + coco-ssd（封闭词汇 80 类，浏览器内即用）
//   - ort-yolo-world: ONNX Runtime Web + YOLO-World（开放词汇）
//   - ort-yolov8    : ONNX Runtime Web + 同学训练的 YOLOv8 Detect（如 yolo数据/best.onnx）
// 之间切换，且上层（决策/渲染）代码完全不变。

export type DetectorEngine = 'tfjs-coco' | 'ort-yolo-world' | 'ort-yolov8';

/**
 * ONNX 检测模型来源配置（YOLO-World / YOLOv8 共用字段）。
 *   - modelBuffer：页面上传或 fetch 得到的字节
 *   - modelUrl：静态路径（如 /models/yolo-trained/zhao-best.onnx）
 *   - classes：封闭词汇类别名（与训练 classes.txt 顺序一致；YOLOv8 用）
 *   - wasmPaths：ort-web wasm 目录
 */
export interface YoloWorldConfig {
  modelBuffer?: ArrayBuffer;
  modelUrl?: string;
  wasmPaths?: string;
  classes?: string[];
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
  /**
   * 避障逻辑判定「前方无障碍、本可前进」。
   * YOLO 页开启「避障 + MLP 巡线」时，可在此分支改用 MLP 输出 L/F/R/S。
   */
  clearPath?: boolean;
  /** 决策来源：障碍避让 / 训练四类 / MLP 巡线接管 */
  source?: 'obstacle' | 'drive-class' | 'mlp-lane';
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
