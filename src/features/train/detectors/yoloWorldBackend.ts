// SPDX-License-Identifier: AGPL-3.0-or-later
// 后端二：ONNX Runtime Web + YOLO-World（开放词汇目标检测）。
// YOLO-World 是 PyTorch 模型（基于 YOLOv8），官方 export_onnx.py 一键导出 ONNX；
// 与 TF.js 不同，它支持“文本提示”检测任意类别（零样本 / 开放词汇），是拓展关的升级点。
//
// 模型加载支持三种来源，全部在浏览器内完成、无需服务器命令：
//   1) 页面上传的 .onnx 字节（modelBuffer）
//   2) 页面填写的模型 URL（modelUrl）
//   3) 默认静态路径 /models/yolo-world/yolo-world.onnx（由下载脚预置，可选）
// wasm 运行时由 Vite 插件在 /models/yolo-world/wasm 提供（dev 中间件 + build 复制）。
import * as ort from 'onnxruntime-web';
import { toZh } from '../yoloDetector';
import type {
  DetectInput,
  DetectedObject,
  DetectOptions,
  DetectorBackend,
  DetectorEngine,
  YoloWorldConfig,
} from './types';

const DEFAULT_WASM_PATHS = `${import.meta.env.BASE_URL}models/yolo-world/wasm/`;
const DEFAULT_MODEL_URL = `${import.meta.env.BASE_URL}models/yolo-world/yolo-world.onnx`;

// 优先 WebGPU，回退 WASM。
const EXECUTION_PROVIDERS = ['webgpu', 'wasm'] as const;

const INPUT_SIZE = 640; // YOLO-World 默认输入尺寸
// ImageNet 归一化（YOLO-World / ultralytics 预处理标准）。
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const IOU_THRESHOLD = 0.45;

// 默认提示词汇：需与导出 ONNX 时 --custom-text 的顺序一致（下面英文词也在 COCO 中英表里，可直显中文）。
const DEFAULT_PROMPTS = [
  'person',
  'car',
  'bus',
  'truck',
  'motorcycle',
  'bicycle',
  'traffic light',
  'stop sign',
];

function imageSize(src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  return [src.width, src.height];
}

export class YoloWorldBackend implements DetectorBackend {
  readonly engine: DetectorEngine = 'ort-yolo-world';
  readonly name = 'YOLO-World（ort-web）';
  readonly openVocabulary = true;
  readonly defaultClasses = DEFAULT_PROMPTS;

  private session: ort.InferenceSession | null = null;
  private classes: string[] = DEFAULT_PROMPTS;
  // 预处理时的 letterbox 映射，用于把 640 空间框还原到原始画面坐标。
  private map = { scale: 1, offX: 0, offY: 0 };
  private wasmConfigured = false;

  private modelBuffer?: ArrayBuffer;
  private modelUrl?: string;

  constructor(config?: YoloWorldConfig) {
    this.modelBuffer = config?.modelBuffer;
    this.modelUrl = config?.modelUrl;
    const wasmPaths = config?.wasmPaths ?? DEFAULT_WASM_PATHS;
    // wasm 路径只需设置一次（全局），用标志位避免重复赋值。
    if (!this.wasmConfigured) {
      ort.env.wasm.wasmPaths = wasmPaths;
      // 单线程，避免 SharedArrayBuffer 需要 COOP/COEP 跨域隔离头（简化静态托管）。
      ort.env.wasm.numThreads = 1;
      this.wasmConfigured = true;
    }
  }

  async load(prompts?: string[]): Promise<void> {
    if (prompts && prompts.length) this.classes = prompts;
    if (this.session) return;

    let buf: ArrayBuffer;
    if (this.modelBuffer) {
      buf = this.modelBuffer;
    } else {
      const url = this.modelUrl ?? DEFAULT_MODEL_URL;
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        buf = await r.arrayBuffer();
      } catch (err) {
        throw new Error(
          '无法加载 YOLO-World 模型。请在页面点击「加载模型」上传 .onnx 文件，或填写模型 URL；' +
            `也可把模型放到 ${DEFAULT_MODEL_URL}（${((err as Error).message)})`
        );
      }
    }

    try {
      this.session = await ort.InferenceSession.create(buf, {
        executionProviders: EXECUTION_PROVIDERS as unknown as string[],
      });
    } catch (err) {
      throw new Error('YOLO-World 会话创建失败：' + (err as Error).message);
    }
  }

  async detect(input: DetectInput, opts?: DetectOptions): Promise<DetectedObject[]> {
    if (!this.session) await this.load(opts?.prompts);
    if (opts?.prompts?.length) this.classes = opts.prompts;
    const session = this.session;
    if (!session) throw new Error('YOLO-World 会话初始化失败');

    const src = (input.htmlVideo ?? input.htmlImage ?? input.htmlCanvas) as
      | HTMLVideoElement
      | HTMLImageElement
      | HTMLCanvasElement
      | undefined;
    if (!src) throw new Error('YOLO-World 仅支持视频 / 图片 / 画布输入');

    const [sw, sh] = imageSize(src);
    const tensorData = this.preprocess(src, sw, sh);
    const tensor = new ort.Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);

    const feeds: Record<string, ort.Tensor> = {};
    feeds[session.inputNames[0]] = tensor;
    const results = await session.run(feeds);
    const out = results[session.outputNames[0]] as ort.Tensor;

    return this.decode(out, opts);
  }

  /** 把源帧 letterbox 缩放到 640×640，并做 ImageNet 归一化（CHW）。 */
  private preprocess(
    src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    sw: number,
    sh: number
  ): Float32Array {
    const canvas = document.createElement('canvas');
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
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
      const r = data[i * 4] / 255;
      const g = data[i * 4 + 1] / 255;
      const b = data[i * 4 + 2] / 255;
      chw[i] = (r - MEAN[0]) / STD[0];
      chw[i + area] = (g - MEAN[1]) / STD[1];
      chw[i + 2 * area] = (b - MEAN[2]) / STD[2];
    }
    return chw;
  }

  /**
   * 解码 YOLOv8 / YOLO-World 风格输出。
   * 常见两种布局都兼容：
   *   - [1, 4+nc, 8400]（通道在前）→ 转置为 [8400, 4+nc]
   *   - [1, 8400, 4+nc]（锚点在前）→ 直接使用
   */
  private decode(out: ort.Tensor, opts?: DetectOptions): DetectedObject[] {
    const dims = out.dims;
    const raw = out.data as Float32Array;

    // 从模型真实输出维度反推类别数，而非依赖提示词数量（模型导出时固定了类别数）。
    // 常见两种布局都兼容：
    //   - [1, C, A]（通道在前，C = 4 + nc）
    //   - [1, A, C]（锚点在前）
    const A = 8400;
    let C: number;
    let anchors: number;
    if (dims[1] !== A && dims[2] === A) {
      // [1, C, A]
      C = dims[1];
      anchors = dims[2];
    } else if (dims[2] !== A && dims[1] === A) {
      // [1, A, C]
      C = dims[2];
      anchors = dims[1];
    } else {
      // 退化：用第二维反推（兜底）
      C = dims[1];
      anchors = dims[2];
    }
    const nc = Math.max(0, C - 4);

    // 实际类别名：优先用提示词对齐，不足部分回退到 cls<i>。
    const classNames =
      nc <= this.classes.length
        ? this.classes.slice(0, nc)
        : [
            ...this.classes,
            ...Array.from({ length: nc - this.classes.length }, (_, i) => `cls${i}`),
          ];

    let pred: Float32Array;
    if (dims[1] === C) {
      // [1, C, A] -> [A, C]
      pred = new Float32Array(C * anchors);
      for (let c = 0; c < C; c++) {
        for (let a = 0; a < anchors; a++) pred[a * C + c] = raw[c * anchors + a];
      }
    } else {
      // [1, A, C]
      pred = raw;
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

      // 找该锚点得分最高的类别（对分数做 sigmoid）。
      let best = 0;
      let bestScore = -1;
      for (let c = 0; c < nc; c++) {
        const s = 1 / (1 + Math.exp(-pred[base + 4 + c]));
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      if (bestScore < minScore) continue;

      // 由 640 空间映射回原始画面坐标。
      const x = (cx - w / 2 - offX) / scale;
      const y = (cy - h / 2 - offY) / scale;
      const bw = w / scale;
      const bh = h / scale;

      const className = classNames[best] ?? `cls${best}`;
      candidates.push({
        bbox: [x, y, bw, bh],
        className,
        labelZh: toZh(className),
        score: bestScore,
      });
    }

    return this.nms(candidates, IOU_THRESHOLD).slice(0, maxBoxes);
  }

  /** 按类别做非极大值抑制（NMS），保留高置信度、低重叠的框。 */
  private nms(boxes: DetectedObject[], iou: number): DetectedObject[] {
    const sorted = [...boxes].sort((a, b) => b.score - a.score);
    const suppressed = new Array(sorted.length).fill(false);
    const keep: DetectedObject[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (suppressed[i]) continue;
      keep.push(sorted[i]);
      for (let j = i + 1; j < sorted.length; j++) {
        if (suppressed[j]) continue;
        if (this.iou(sorted[i].bbox, sorted[j].bbox) > iou) suppressed[j] = true;
      }
    }
    return keep;
  }

  private iou(a: [number, number, number, number], b: [number, number, number, number]): number {
    const xa = Math.max(a[0], b[0]);
    const ya = Math.max(a[1], b[1]);
    const xb = Math.min(a[0] + a[2], b[0] + b[2]);
    const yb = Math.min(a[1] + a[3], b[1] + b[3]);
    const iw = Math.max(0, xb - xa);
    const ih = Math.max(0, yb - ya);
    const inter = iw * ih;
    const uni = a[2] * a[3] + b[2] * b[3] - inter;
    return uni <= 0 ? 0 : inter / uni;
  }
}
