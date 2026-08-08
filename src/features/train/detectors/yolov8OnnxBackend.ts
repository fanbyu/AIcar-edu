// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Ultralytics YOLOv8 Detect（封闭词汇）ONNX 后端。
 * 适合加载同学在「yolo数据」里训练导出的 best.onnx（如 ting/zuo/qian/you）。
 * 预处理：/255（与 ultralytics 一致），非 YOLO-World 的 ImageNet 归一化。
 */
import * as ort from 'onnxruntime-web';
import { DRIVE_CLASS_ZH } from '@/content/trainedYoloModels';
import type {
  DetectInput,
  DetectedObject,
  DetectOptions,
  DetectorBackend,
  DetectorEngine,
  YoloWorldConfig,
} from './types';

const DEFAULT_WASM_PATHS = `${import.meta.env.BASE_URL}models/yolo-world/wasm/`;
const INPUT_SIZE = 640;
const IOU_THRESHOLD = 0.45;

function imageSize(src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  return [src.width, src.height];
}

export class Yolov8OnnxBackend implements DetectorBackend {
  readonly engine: DetectorEngine = 'ort-yolov8';
  readonly name = 'YOLOv8 训练模型（ort-web）';
  readonly openVocabulary = false;
  readonly defaultClasses: string[];

  private session: ort.InferenceSession | null = null;
  private classes: string[];
  private map = { scale: 1, offX: 0, offY: 0 };
  private modelBuffer?: ArrayBuffer;
  private modelUrl?: string;

  constructor(config?: YoloWorldConfig & { classes?: string[] }) {
    this.modelBuffer = config?.modelBuffer;
    this.modelUrl = config?.modelUrl;
    this.classes = config?.classes?.length
      ? config.classes
      : ['ting', 'zuo', 'qian', 'you'];
    this.defaultClasses = this.classes;
    const wasmPaths = config?.wasmPaths ?? DEFAULT_WASM_PATHS;
    ort.env.wasm.wasmPaths = wasmPaths;
    ort.env.wasm.numThreads = 1;
  }

  async load(prompts?: string[]): Promise<void> {
    if (prompts?.length) this.classes = prompts;
    if (this.session) return;

    let buf: ArrayBuffer;
    if (this.modelBuffer) {
      buf = this.modelBuffer;
    } else if (this.modelUrl) {
      const r = await fetch(this.modelUrl);
      if (!r.ok) throw new Error(`无法下载模型 HTTP ${r.status}：${this.modelUrl}`);
      buf = await r.arrayBuffer();
    } else {
      throw new Error('请指定训练好的 ONNX 模型（上传或选择本地预设）');
    }

    try {
      this.session = await ort.InferenceSession.create(buf, {
        executionProviders: ['wasm'],
      });
    } catch (err) {
      throw new Error('YOLOv8 会话创建失败：' + (err as Error).message);
    }
  }

  async detect(input: DetectInput, opts?: DetectOptions): Promise<DetectedObject[]> {
    if (!this.session) await this.load(opts?.prompts);
    if (opts?.prompts?.length) this.classes = opts.prompts;
    const session = this.session;
    if (!session) throw new Error('YOLOv8 会话未就绪');

    const src = (input.htmlVideo ?? input.htmlImage ?? input.htmlCanvas) as
      | HTMLVideoElement
      | HTMLImageElement
      | HTMLCanvasElement
      | undefined;
    if (!src) throw new Error('需要视频 / 图片 / 画布输入');

    const [sw, sh] = imageSize(src);
    const tensorData = this.preprocess(src, sw, sh);
    const tensor = new ort.Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: tensor };
    const results = await session.run(feeds);
    const out = results[session.outputNames[0]] as ort.Tensor;
    return this.decode(out, opts);
  }

  private preprocess(
    src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    sw: number,
    sh: number
  ): Float32Array {
    const canvas = document.createElement('canvas');
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#114';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);

    const scale = Math.min(INPUT_SIZE / sw, INPUT_SIZE / sh);
    const nw = sw * scale;
    const nh = sh * scale;
    const offX = (INPUT_SIZE - nw) / 2;
    const offY = (INPUT_SIZE - nh) / 2;
    this.map = { scale, offX, offY };
    ctx.drawImage(src, offX, offY, nw, nh);

    const data = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
    const chw = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    const area = INPUT_SIZE * INPUT_SIZE;
    for (let i = 0; i < area; i++) {
      chw[i] = data[i * 4] / 255;
      chw[i + area] = data[i * 4 + 1] / 255;
      chw[i + 2 * area] = data[i * 4 + 2] / 255;
    }
    return chw;
  }

  private decode(out: ort.Tensor, opts?: DetectOptions): DetectedObject[] {
    const dims = out.dims;
    const nc = this.classes.length;
    const C = 4 + nc;
    const raw = out.data as Float32Array;

    let pred: Float32Array;
    let anchors: number;
    if (dims.length === 3 && dims[1] === C) {
      anchors = dims[2];
      pred = new Float32Array(C * anchors);
      for (let c = 0; c < C; c++) {
        for (let a = 0; a < anchors; a++) pred[a * C + c] = raw[c * anchors + a];
      }
    } else if (dims.length === 3 && dims[2] === C) {
      anchors = dims[1];
      pred = raw;
    } else {
      // 尝试用输出第二维推断类别数
      const cGuess = dims[1] > dims[2] ? dims[1] : dims[2];
      throw new Error(
        `YOLOv8 输出形状异常：dims=${dims.join('×')}，期望通道=${C}（4+${nc}类）。猜到的通道维≈${cGuess}`
      );
    }

    const minScore = opts?.minScore ?? 0.25;
    const maxBoxes = opts?.maxBoxes ?? 20;
    const { scale, offX, offY } = this.map;
    const candidates: DetectedObject[] = [];

    for (let a = 0; a < anchors; a++) {
      const base = a * C;
      const cx = pred[base];
      const cy = pred[base + 1];
      const w = pred[base + 2];
      const h = pred[base + 3];

      let best = 0;
      let bestScore = -1;
      for (let c = 0; c < nc; c++) {
        let s = pred[base + 4 + c];
        // ultralytics 导出通常已是概率；若像 logits 则 sigmoid
        if (s < 0 || s > 1) s = 1 / (1 + Math.exp(-s));
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      if (bestScore < minScore) continue;

      const x = (cx - w / 2 - offX) / scale;
      const y = (cy - h / 2 - offY) / scale;
      const bw = w / scale;
      const bh = h / scale;
      const className = this.classes[best] ?? `cls${best}`;
      candidates.push({
        bbox: [x, y, bw, bh],
        className,
        labelZh: DRIVE_CLASS_ZH[className] ?? className,
        score: bestScore,
      });
    }

    return this.nms(candidates).slice(0, maxBoxes);
  }

  private nms(boxes: DetectedObject[]): DetectedObject[] {
    const sorted = [...boxes].sort((a, b) => b.score - a.score);
    const suppressed = new Array(sorted.length).fill(false);
    const keep: DetectedObject[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (suppressed[i]) continue;
      keep.push(sorted[i]);
      for (let j = i + 1; j < sorted.length; j++) {
        if (!suppressed[j] && this.iou(sorted[i].bbox, sorted[j].bbox) > IOU_THRESHOLD) {
          suppressed[j] = true;
        }
      }
    }
    return keep;
  }

  private iou(a: [number, number, number, number], b: [number, number, number, number]): number {
    const xa = Math.max(a[0], b[0]);
    const ya = Math.max(a[1], b[1]);
    const xb = Math.min(a[0] + a[2], b[0] + b[2]);
    const yb = Math.min(a[1] + a[3], b[1] + b[3]);
    const inter = Math.max(0, xb - xa) * Math.max(0, yb - ya);
    const uni = a[2] * a[3] + b[2] * b[3] - inter;
    return uni <= 0 ? 0 : inter / uni;
  }

  async dispose() {
    this.session = null;
  }
}
