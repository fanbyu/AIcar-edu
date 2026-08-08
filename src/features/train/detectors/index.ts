// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DetectorBackend, DetectorEngine, YoloWorldConfig } from './types';
import { CocoSsdBackend } from './cocoSsdBackend';
import { YoloWorldBackend } from './yoloWorldBackend';
import { Yolov8OnnxBackend } from './yolov8OnnxBackend';

export interface DetectorMeta {
  engine: DetectorEngine;
  name: string;
  openVocabulary: boolean;
  note: string;
}

export const AVAILABLE_DETECTORS: DetectorMeta[] = [
  {
    engine: 'tfjs-coco',
    name: 'coco-ssd（TF.js）',
    openVocabulary: false,
    note: '封闭词汇 80 类，无需训练、即开即用，作为检测基线。',
  },
  {
    engine: 'ort-yolov8',
    name: '训练模型 YOLOv8（ort-web）',
    openVocabulary: false,
    note: '加载 yolo数据 导出的 best.onnx（停/左/前/右），一键用于拓展关控车。',
  },
  {
    engine: 'ort-yolo-world',
    name: 'YOLO-World（ort-web）',
    openVocabulary: true,
    note: '开放词汇：文本提示检测任意类别；可上传 .onnx 或填 URL。',
  },
];

export function createDetector(engine: DetectorEngine, config?: YoloWorldConfig): DetectorBackend {
  switch (engine) {
    case 'tfjs-coco':
      return new CocoSsdBackend();
    case 'ort-yolov8':
      return new Yolov8OnnxBackend(config);
    case 'ort-yolo-world':
      return new YoloWorldBackend(config);
    default: {
      const _exhaustive: never = engine;
      throw new Error(`未知检测引擎：${String(_exhaustive)}`);
    }
  }
}

export type {
  DetectorBackend,
  DetectorEngine,
  DetectInput,
  DetectedObject,
  DetectOptions,
  DrivingDecision,
} from './types';
