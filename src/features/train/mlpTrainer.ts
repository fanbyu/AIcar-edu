// SPDX-License-Identifier: AGPL-3.0-or-later
import * as tf from '@tensorflow/tfjs';
import type { CarClass } from './types';
import type { TruncatedMobileNetModel } from './useMobileNet';

/** 序列化的模型权重（可直接 JSON.stringify） */
export interface MlpModelArtifacts {
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

export interface MlpOptions {
  learningRate: number;
  hiddenUnits: number;
  epochs: number;
  batchSize: number;
  featureDim: number;
  /** 学生自定义神经网络代码（调用 initializeModel 注册模型），留空则用默认 MLP */
  modelCode?: string;
  /** 截断后的 MobileNet 特征提取器，供自定义代码构造分类头 */
  truncatedMobileNet?: TruncatedMobileNetModel;
}

const DEFAULTS: MlpOptions = {
  learningRate: 0.0001,
  hiddenUnits: 50,
  epochs: 20,
  batchSize: 64,
  featureDim: 256,
};

/**
 * MLP 训练器：在 MobileNet 特征之上叠加一层隐藏层做分类。
 * 支持可调超参（学习率 / 隐藏层神经元数）。
 */
export class MlpTrainer {
  private model: tf.LayersModel | null = null;
  private labels: CarClass[];
  private opts: MlpOptions;

  constructor(labels: CarClass[], opts: Partial<MlpOptions> = {}) {
    this.labels = labels;
    this.opts = { ...DEFAULTS, ...opts };
  }

  /**
   * 运行学生自定义神经网络代码（Teachable Machine 迁移学习风格）：
   * 代码在沙箱里运行，可访问 tf / truncatedMobileNet / numClasses / denseUnits，
   * 并通过调用 initializeModel(model, ...) 注册并编译模型。
   */
  private buildCustomModel() {
    const code = this.opts.modelCode!.trim();
    const truncated = this.opts.truncatedMobileNet;
    if (!truncated) {
      throw new Error('MobileNet 尚未就绪（truncatedMobileNet 为空），无法构建自定义模型');
    }
    const self = this;
    const initializeModel = (
      model: tf.LayersModel,
      _tf?: unknown,
      _trunc?: unknown,
      _n?: unknown,
      _d?: unknown
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
        'truncatedMobileNet',
        'numClasses',
        'denseUnits',
        'initializeModel',
        `"use strict";\n${code}`
      ) as (
        tf: typeof import('@tensorflow/tfjs'),
        truncatedMobileNet: TruncatedMobileNetModel,
        numClasses: number,
        denseUnits: number,
        initializeModel: (model: tf.LayersModel) => void
      ) => void;
      fn(tf, truncated, this.labels.length, this.opts.hiddenUnits, initializeModel);
      if (!this.model) {
        throw new Error('代码未调用 initializeModel(model, tf, truncatedMobileNet, numClasses, denseUnits) 来注册模型');
      }
    } catch (e) {
      throw new Error('神经网络代码错误：' + (e instanceof Error ? e.message : String(e)));
    }
  }

  build() {
    const { featureDim, hiddenUnits, learningRate } = this.opts;
    if (this.opts.modelCode?.trim()) {
      this.buildCustomModel();
      return;
    }
    const model = tf.sequential();
    model.add(
      tf.layers.dense({ inputShape: [featureDim], units: hiddenUnits, activation: 'relu' })
    );
    model.add(tf.layers.dense({ units: this.labels.length, activation: 'softmax' }));
    model.compile({
      optimizer: tf.train.adam(learningRate),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
    this.model = model;
  }

  async train(
    features: Float32Array[],
    labels: CarClass[],
    onEpoch?: (epoch: number, logs: tf.Logs) => void
  ): Promise<tf.History> {
    if (features.length === 0) throw new Error('没有可训练的样本');
    // 维度跟随 MobileNet 实际输出（截断层/版本不同维度也不同）
    this.opts.featureDim = features[0].length;
    // 每次训练都按当前超参与自定义代码重建模型，保证一致性
    this.build();
    // 按模型实际输入形状（截断层可能是 4D，内置嵌入是 2D）重塑特征
    const inShape = (
      this.model!.inputs[0].shape!.slice(1) as (number | null)[]
    ).map((d) => d ?? 1);
    const flat: number[] = [];
    features.forEach((f) => flat.push(...Array.from(f)));
    const xs = tf.tensor(flat, [features.length, ...inShape]);
    const ys = tf.oneHot(
      labels.map((l) => this.labels.indexOf(l)),
      this.labels.length
    );
    const history = await this.model!.fit(xs, ys, {
      epochs: this.opts.epochs,
      batchSize: this.opts.batchSize,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => onEpoch?.(epoch, logs as tf.Logs),
      },
    });
    xs.dispose();
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

  /** 返回所有类别的概率分布（按 labels 顺序），供实时推理面板展示 */
  predictProbs(vec: Float32Array): { label: CarClass; confidence: number }[] {
    if (!this.model) throw new Error('模型未训练');
    // 输入维度以模型实际结构为准（兼容训练生成与权重加载两种来源，支持 4D 截断层）
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

  setOptions(o: Partial<MlpOptions>) {
    this.opts = { ...this.opts, ...o };
    this.model = null;
  }

  /** 导出当前训练好的权重（需先 train）。返回 null 表示未训练。 */
  async exportArtifacts(): Promise<MlpModelArtifacts | null> {
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
  async importArtifacts(json: MlpModelArtifacts): Promise<void> {
    const weightData = base64ToArrayBuffer(json.weightData);
    this.model = await tf.loadLayersModel(
      tf.io.fromMemory(json.modelTopology, json.weightSpecs, weightData)
    );
  }

  getOptions(): MlpOptions {
    return { ...this.opts };
  }

  dispose() {
    this.model?.dispose();
    this.model = null;
  }
}
