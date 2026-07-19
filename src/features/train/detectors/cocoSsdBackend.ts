// SPDX-License-Identifier: AGPL-3.0-or-later
// 后端一：TensorFlow.js + coco-ssd（封闭词汇 80 类）。
// 与 YOLO 同属“单阶段实时检测”家族，无需训练、打开网页即用，作为检测基线。
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { ensureTfReady } from '@/lib/tf';
import { toZh } from '../yoloDetector';
import type {
  DetectInput,
  DetectedObject,
  DetectOptions,
  DetectorBackend,
  DetectorEngine,
} from './types';

// 离线模型：已通过 npm run download:yolo-model 下载到 public/models/coco-ssd/。
const LOCAL_MODEL_URL = `${import.meta.env.BASE_URL}models/coco-ssd/model.json`;

export class CocoSsdBackend implements DetectorBackend {
  readonly engine: DetectorEngine = 'tfjs-coco';
  readonly name = 'coco-ssd（TF.js）';
  readonly openVocabulary = false;
  readonly defaultClasses: string[] = [];

  private model: cocoSsd.ObjectDetection | null = null;

  async load(): Promise<void> {
    if (this.model) return;
    await ensureTfReady();
    try {
      this.model = await cocoSsd.load({
        base: 'lite_mobilenet_v2',
        modelUrl: LOCAL_MODEL_URL,
      });
    } catch (err) {
      console.warn('[coco-ssd] 本地模型加载失败，回退到 CDN：', err);
      this.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    }
  }

  async detect(input: DetectInput, opts?: DetectOptions): Promise<DetectedObject[]> {
    if (!this.model) await this.load();
    const src = (input.htmlVideo ?? input.htmlImage ?? input.htmlCanvas) as
      | HTMLVideoElement
      | HTMLImageElement
      | HTMLCanvasElement;
    const raw = await this.model!.detect(src, opts?.maxBoxes ?? 20, opts?.minScore ?? 0.25);
    return raw.map((r) => ({
      bbox: r.bbox as [number, number, number, number],
      className: r.class,
      labelZh: toZh(r.class),
      score: r.score,
    }));
  }
}
