// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CarClass } from './types';

/** 余弦相似度：dot(a,b) / (|a|·|b|)，结果 ∈ [-1, 1] */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

interface Sample {
  vec: Float32Array;
  label: CarClass;
  id: number;
}

/**
 * KNN 四分类（基于 MobileNet 特征向量的最近邻）。
 * 训练即「记住样本」，预测即「找最近邻 + 多数投票」。
 */
export class KnnClassifier {
  private samples: Sample[] = [];
  private labels: CarClass[];
  public k: number;

  constructor(labels: CarClass[], k = 3) {
    this.labels = labels;
    this.k = k;
  }

  addSample(vec: Float32Array, label: CarClass, id: number) {
    this.samples.push({ vec, label, id });
  }

  count(label: CarClass): number {
    return this.samples.filter((s) => s.label === label).length;
  }

  get size() {
    return this.samples.length;
  }

  clear() {
    this.samples = [];
  }

  /** 按 id 删除单条样本 */
  removeById(id: number) {
    this.samples = this.samples.filter((s) => s.id !== id);
  }

  /** 与全部样本计算余弦相似度，返回相似度最高的 n 条 */
  nearest(vec: Float32Array, n = 4): { label: CarClass; sim: number }[] {
    return this.samples
      .map((s) => ({ label: s.label, sim: cosine(vec, s.vec) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, n);
  }

  private distance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  predict(
    vec: Float32Array,
    k = this.k
  ): {
    label: CarClass;
    confidence: number;
    votes: Record<string, number>;
    neighbors: { label: CarClass; dist: number }[];
    k: number;
  } {
    if (this.samples.length === 0) {
      return { label: this.labels[0], confidence: 0, votes: {}, neighbors: [], k: 0 };
    }
    const kk = Math.max(1, Math.min(k, this.samples.length));
    const dists = this.samples
      .map((s) => ({ d: this.distance(vec, s.vec), label: s.label }))
      .sort((a, b) => a.d - b.d)
      .slice(0, kk);

    const votes: Record<string, number> = {};
    let weightSum = 0;
    const weightByLabel: Record<string, number> = {};
    for (const { d, label } of dists) {
      const w = 1 / (d + 1e-6);
      votes[label] = (votes[label] ?? 0) + 1;
      weightByLabel[label] = (weightByLabel[label] ?? 0) + w;
      weightSum += w;
    }
    let best: CarClass = this.labels[0];
    let bestW = -1;
    for (const l of this.labels) {
      if ((weightByLabel[l] ?? 0) > bestW) {
        bestW = weightByLabel[l] ?? 0;
        best = l;
      }
    }
    return {
      label: best,
      confidence: weightSum > 0 ? bestW / weightSum : 0,
      votes,
      neighbors: dists.map((x) => ({ label: x.label, dist: x.d })),
      k: kk,
    };
  }
}
