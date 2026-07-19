// SPDX-License-Identifier: AGPL-3.0-or-later
// 检测引擎工厂：页面按课程阶段选择后端，上层决策/渲染逻辑保持不变。
import type { DetectorBackend, DetectorEngine, YoloWorldConfig } from './types';
import { CocoSsdBackend } from './cocoSsdBackend';
import { YoloWorldBackend } from './yoloWorldBackend';

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
    note: '封闭词汇 80 类，无需训练、即开即用，作为检测基线（YOLO 同族）。',
  },
  {
    engine: 'ort-yolo-world',
    name: 'YOLO-World（ort-web）',
    openVocabulary: true,
    note: '开放词汇：用文本提示检测任意类别；在页面内上传 .onnx 或填写模型 URL 即可加载（无需服务器命令）。',
  },
];

export function createDetector(engine: DetectorEngine, config?: YoloWorldConfig): DetectorBackend {
  switch (engine) {
    case 'tfjs-coco':
      return new CocoSsdBackend();
    case 'ort-yolo-world':
      return new YoloWorldBackend(config);
    default:
      // 穷尽检查，保证新增引擎时编译期报错。
      const _exhaustive: never = engine;
      throw new Error(`未知检测引擎：${String(_exhaustive)}`);
  }
}

export type { DetectorBackend, DetectorEngine, DetectInput, DetectedObject, DetectOptions } from './types';
