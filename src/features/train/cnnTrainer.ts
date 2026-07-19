// SPDX-License-Identifier: AGPL-3.0-or-later
import * as tf from '@tensorflow/tfjs';
import type { CarClass } from './types';

/** 序列化的模型权重（可直接 JSON.stringify） */
export interface CnnModelArtifacts {
  modelTopology: object;
  weightSpecs: tf.io.WeightsManifestEntry[];
  weightData: string; // base64
}

/** ArrayBuffer <-> base64（浏览器内置） */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export interface CnnOptions {
  learningRate: number;
  epochs: number;
  batchSize: number;
  /** 输入图像边长（正方形），即 img_width_height */
  imgSize: number;
  numClasses: number;
  /** 学生自定义神经网络代码（调用 initializeModel 注册模型），留空则用默认 CNN */
  modelCode?: string;
}

const DEFAULTS: CnnOptions = {
  learningRate: 0.001,
  epochs: 2,
  batchSize: 8,
  imgSize: 96,
  numClasses: 4,
};

/** 默认 CNN：小车自动驾驶卷积网络（学生可在页面中修改） */
export const DEFAULT_CNN_CODE = `// 创建一个顺序模型
model = tf.sequential();
// 添加批归一化层，输入形状为 [img_width_height, img_width_height, 3]
model.add(tf.layers.batchNormalization({ inputShape: [img_width_height, img_width_height, 3] }));
// 添加可分离卷积层，使用 16 个过滤器，卷积核大小为 3，步幅为 2，激活函数为 elu
model.add(tf.layers.separableConv2d({ filters: 16, kernelSize: 3, strides: 2, activation: 'elu' }));
// 添加可分离卷积层，使用 32 个过滤器，卷积核大小为 3，步幅为 2，激活函数为 elu
model.add(tf.layers.separableConv2d({ filters: 32, kernelSize: 3, strides: 2, activation: 'elu' }));
// 添加可分离卷积层，使用 48 个过滤器，卷积核大小为 3，激活函数为 elu（步幅默认为 1）
model.add(tf.layers.separableConv2d({ filters: 48, kernelSize: 3, activation: 'elu' }));
// 添加可分离卷积层，使用 64 个过滤器，卷积核大小为 3，激活函数为 elu（步幅默认为 1）
model.add(tf.layers.separableConv2d({ filters: 64, kernelSize: 3, activation: 'elu' }));
// 添加 dropout 层，丢弃率为 0.3，用于防止过拟合
model.add(tf.layers.dropout({ rate: 0.3 }));
// 添加展平层，将多维输入展平为一维，以便于输入到全连接层
model.add(tf.layers.flatten());
// 添加全连接层，输出单元数为 64，激活函数为 elu
model.add(tf.layers.dense({ units: 64, activation: 'elu' }));
// 添加 dropout 层，丢弃率为 0.2，用于防止过拟合
model.add(tf.layers.dropout({ rate: 0.2 }));
// 添加全连接层，输出单元数为 32，激活函数为 elu
model.add(tf.layers.dense({ units: 32, activation: 'elu' }));
// 添加 dropout 层，丢弃率为 0.2，用于防止过拟合
model.add(tf.layers.dropout({ rate: 0.2 }));
// 添加输出层，输出单元数为 numClasses，激活函数为 softmax，用于多类分类
model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
initializeModel(model, tf,  numClasses, img_width_height); // 初始化模型，不要修改这一行
//不要修改 model, tf,  numClasses, img_width_height 这几个变量名`;

/**
 * CNN 训练器：从原始图像 [imgSize,imgSize,3] 直接训练卷积网络。
 * 支持自定义神经网络代码（沙箱），学生可改写卷积/全连接结构。
 */
export class CnnTrainer {
  private model: tf.LayersModel | null = null;
  private labels: CarClass[];
  private opts: CnnOptions;

  constructor(labels: CarClass[], opts: Partial<CnnOptions> = {}) {
    this.labels = labels;
    this.opts = { ...DEFAULTS, ...opts };
  }

  /**
   * 运行学生自定义神经网络代码：可访问 tf / numClasses / img_width_height，
   * 并通过调用 initializeModel(model, tf, numClasses, img_width_height) 注册并编译模型。
   * 注意：学生代码常写 `model = tf.sequential();`（未声明 let），故外层预置 `let model;`。
   */
  private buildCustomModel() {
    const code = this.opts.modelCode!.trim();
    const self = this;
    const initializeModel = (
      model: tf.LayersModel,
      _tf?: unknown,
      _n?: unknown,
      _s?: unknown
    ) => {
      if (!(model instanceof tf.LayersModel) && !(model as unknown as { compile?: unknown }).compile) {
        throw new Error('initializeModel 收到的 model 无效，请确认已用 tf.sequential() 等构建模型');
      }
      model.compile({
        optimizer: tf.train.adam(self.opts.learningRate),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
      });
      self.model = model;
    };
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'tf',
        'numClasses',
        'img_width_height',
        'initializeModel',
        `"use strict";\nlet model;\n${code}`
      ) as (
        tf: typeof import('@tensorflow/tfjs'),
        numClasses: number,
        img_width_height: number,
        initializeModel: (model: tf.LayersModel) => void
      ) => void;
      fn(tf, this.labels.length, this.opts.imgSize, initializeModel);
      if (!this.model) {
        throw new Error(
          '代码未调用 initializeModel(model, tf, numClasses, img_width_height) 来注册模型'
        );
      }
    } catch (e) {
      throw new Error('神经网络代码错误：' + (e instanceof Error ? e.message : String(e)));
    }
  }

  /** 默认 CNN（当未提供自定义代码时） */
  private buildDefault() {
    const { imgSize, learningRate } = this.opts;
    const model = tf.sequential();
    model.add(tf.layers.batchNormalization({ inputShape: [imgSize, imgSize, 3] }));
    model.add(tf.layers.separableConv2d({ filters: 16, kernelSize: 3, strides: 2, activation: 'elu' }));
    model.add(tf.layers.separableConv2d({ filters: 32, kernelSize: 3, strides: 2, activation: 'elu' }));
    model.add(tf.layers.separableConv2d({ filters: 48, kernelSize: 3, activation: 'elu' }));
    model.add(tf.layers.separableConv2d({ filters: 64, kernelSize: 3, activation: 'elu' }));
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.flatten());
    model.add(tf.layers.dense({ units: 64, activation: 'elu' }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: 32, activation: 'elu' }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: this.labels.length, activation: 'softmax' }));
    model.compile({
      optimizer: tf.train.adam(learningRate),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
    this.model = model;
  }

  build() {
    if (this.opts.modelCode?.trim()) {
      this.buildCustomModel();
      return;
    }
    this.buildDefault();
  }

  async train(
    images: tf.Tensor4D,
    labels: CarClass[],
    onEpoch?: (epoch: number, logs: tf.Logs) => void
  ): Promise<tf.History> {
    if (images.shape[0] === 0) throw new Error('没有可训练的样本');
    // 每次训练都按当前超参与自定义代码重建模型，保证一致性
    this.build();
    const ys = tf.oneHot(
      labels.map((l) => this.labels.indexOf(l)),
      this.labels.length
    );
    const history = await this.model!.fit(images, ys, {
      epochs: this.opts.epochs,
      batchSize: this.opts.batchSize,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => onEpoch?.(epoch, logs as tf.Logs),
      },
    });
    ys.dispose();
    return history;
  }

  predict(vec: Float32Array): { label: CarClass; confidence: number } {
    const all = this.predictProbs(vec);
    let idx = 0;
    all.forEach((p, i) => {
      if (p.confidence > all[idx].confidence) idx = i;
    });
    return all[idx];
  }

  /** 返回所有类别的概率分布（按 labels 顺序） */
  predictProbs(vec: Float32Array): { label: CarClass; confidence: number }[] {
    if (!this.model) throw new Error('模型未训练');
    const inShape = (
      this.model.inputs[0].shape!.slice(1) as (number | null)[]
    ).map((d) => d ?? 1);
    const x = tf.tensor(Array.from(vec), [1, ...inShape]);
    const out = this.model.predict(x) as tf.Tensor;
    const probs = Array.from(out.dataSync() as Float32Array);
    x.dispose();
    out.dispose();
    return this.labels.map((l, i) => ({ label: l, confidence: probs[i] ?? 0 }));
  }

  setOptions(o: Partial<CnnOptions>) {
    this.opts = { ...this.opts, ...o };
    this.model = null;
  }

  /** 导出当前训练好的权重（需先 train）。返回 null 表示未训练。 */
  async exportArtifacts(): Promise<CnnModelArtifacts | null> {
    if (!this.model) return null;
    let artifacts: tf.io.ModelArtifacts | null = null;
    await this.model.save(
      tf.io.withSaveHandler(async (a) => {
        artifacts = a;
        return {
          modelArtifactsInfo: {
            dateSaved: new Date(),
            modelTopologyType: 'JSON' as const,
          },
        };
      })
    );
    return {
      modelTopology: artifacts!.modelTopology as object,
      weightSpecs: artifacts!.weightSpecs!,
      weightData: arrayBufferToBase64(artifacts!.weightData as ArrayBuffer),
    };
  }

  /** 从序列化权重恢复模型（无需重新训练即可推理）。 */
  async importArtifacts(json: CnnModelArtifacts): Promise<void> {
    const weightData = base64ToArrayBuffer(json.weightData);
    this.model = await tf.loadLayersModel(
      tf.io.fromMemory(json.modelTopology, json.weightSpecs, weightData)
    );
  }

  getOptions(): CnnOptions {
    return { ...this.opts };
  }

  dispose() {
    this.model?.dispose();
    this.model = null;
  }
}
