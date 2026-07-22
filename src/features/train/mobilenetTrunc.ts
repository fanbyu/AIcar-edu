// SPDX-License-Identifier: AGPL-3.0-or-later
import * as tf from '@tensorflow/tfjs';

/**
 * 轻量「截断特征提取器」的最小接口：GraphModel 无法符号式截断成真实 tf.Model，
 * 这里只声明上层真正用到的两个能力（outputs[0].shape / predict）与 dispose。
 */
export interface TruncatedMobileNetModel {
  outputs: { shape: (number | null)[] }[];
  predict(x: tf.Tensor | tf.Tensor[]): tf.Tensor;
  dispose(): void;
}

export interface MobileNetConfig {
  version: 1 | 2;
  alpha: number;
  /** 截断层名称；留空则使用模型自带的全局平均池化嵌入层 */
  truncationLayer?: string;
}

/**
 * `@tensorflow-models/mobilenet` 内部是一个 GraphModel（来自 TFHub），
 * 只能通过 `execute(input, nodeName)` 取中间节点，没有 LayersModel 的 getLayer。
 * 不同 alpha / 版本下「截断层」在图里的实际节点名可能略有差异
 * （例如 ReLU6 可能已融合进卷积、没有独立的 `/Relu6` 节点），
 * 因此这里不直接硬编码，而是给出若干候选名，运行时用探针验证哪个真实存在。
 */
const NODE_CANDIDATES: Record<1 | 2, Record<string, string[]>> = {
  1: {
    conv_pw_13_relu: [
      'module_apply_default/MobilenetV1/Conv2d_13_pointwise/Relu6',
      'MobilenetV1/Conv2d_13_pointwise/Relu6',
      'module_apply_default/MobilenetV1/Conv2d_13_pointwise',
      'MobilenetV1/Conv2d_13_pointwise',
      'module_apply_default/MobilenetV1/Conv2d_13_pointwise/Relu',
      'MobilenetV1/Conv2d_13_pointwise/Relu',
    ],
    conv_pw_12_relu: [
      'module_apply_default/MobilenetV1/Conv2d_12_pointwise/Relu6',
      'MobilenetV1/Conv2d_12_pointwise/Relu6',
      'module_apply_default/MobilenetV1/Conv2d_12_pointwise',
      'MobilenetV1/Conv2d_12_pointwise',
    ],
    conv_pw_11_relu: [
      'module_apply_default/MobilenetV1/Conv2d_11_pointwise/Relu6',
      'MobilenetV1/Conv2d_11_pointwise/Relu6',
      'module_apply_default/MobilenetV1/Conv2d_11_pointwise',
      'MobilenetV1/Conv2d_11_pointwise',
    ],
  },
  2: {
    conv_pw_13_relu: [
      'module_apply_default/MobilenetV2/expanded_conv_16/output',
      'MobilenetV2/expanded_conv_16/output',
      'module_apply_default/MobilenetV2/expanded_conv_16/Conv_1/Relu6',
      'MobilenetV2/expanded_conv_16/Conv_1/Relu6',
      'module_apply_default/MobilenetV2/expanded_conv_16/add',
      'MobilenetV2/expanded_conv_16/add',
    ],
    out_relu: [
      'module_apply_default/MobilenetV2/Conv_1/Relu6',
      'MobilenetV2/Conv_1/Relu6',
      'module_apply_default/MobilenetV2/Conv_1',
      'MobilenetV2/Conv_1',
    ],
  },
};

/** 内置嵌入（全局平均池化之后）节点名，作为兜底 */
export const EMBEDDING_NODES: Record<1 | 2, string> = {
  1: 'module_apply_default/MobilenetV1/Logits/global_pool',
  2: 'module_apply_default/MobilenetV2/Logits/AvgPool',
};

/**
 * 在已加载的 GraphModel 上探测真实存在的截断层节点名：
 * 依次尝试「用户自定义完整名 → 友好名的候选列表 → 该版本全部候选 → 内置嵌入兜底」。
 */
export function resolveTruncNode(base: tf.GraphModel, version: 1 | 2, preferred: string): string {
  const dummy = tf.zeros([1, 224, 224, 3]);
  const probe = (name: string): boolean => {
    try {
      const out = base.execute(dummy, name) as tf.Tensor | tf.Tensor[];
      if (Array.isArray(out)) out.forEach((t) => t.dispose());
      else out.dispose();
      return true;
    } catch {
      return false;
    }
  };
  try {
    if (preferred && probe(preferred)) return preferred;
    const byFriendly = NODE_CANDIDATES[version]?.[preferred];
    if (byFriendly) {
      for (const n of byFriendly) if (probe(n)) return n;
    }
    for (const list of Object.values(NODE_CANDIDATES[version] ?? {})) {
      for (const n of list) if (probe(n)) return n;
    }
  } finally {
    dummy.dispose();
  }
  return EMBEDDING_NODES[version];
}

/**
 * 探针：用占位输入跑一次 `base.execute(dummy, node)`，取截断层（去掉批维度后的）
 * 输出形状。GraphModel 不支持符号式执行，但用真实占位张量执行一次是安全的。
 */
export function probeShape(base: tf.GraphModel, node: string): number[] {
  const dummy = tf.zeros([1, 224, 224, 3]);
  try {
    const out = base.execute(dummy, node) as tf.Tensor | tf.Tensor[];
    const t = Array.isArray(out) ? out[0] : out;
    const shp = (t.shape as (number | null)[]).slice(1);
    const ok = shp.length > 0 && shp.every((s) => typeof s === 'number');
    if (Array.isArray(out)) out.forEach((o) => o.dispose());
    else out.dispose();
    return ok ? (shp as number[]) : [1024];
  } catch {
    return [1024];
  } finally {
    dummy.dispose();
  }
}

/**
 * 轻量「截断特征提取器」包装：GraphModel 无法符号式截断成新的 tf.Model，
 * 所以这里不构造 tf.model，而是直接封装 `base.execute(真实张量, node)`。
 * 它只暴露上层真正用到的两个能力：
 *   - outputs[0].shape：供自定义神经网络代码读取截断层输出形状
 *   - predict(x)：传入 [N,224,224,3] 真实张量，返回截断层特征
 */
export function makeFeatureExtractor(base: tf.GraphModel, node: string, outShape: number[]) {
  return {
    outputs: [{ shape: [null, ...outShape] as number[] }],
    predict(x: tf.Tensor | tf.Tensor[]): tf.Tensor {
      const r = base.execute(x, node) as tf.Tensor | tf.Tensor[];
      return (Array.isArray(r) ? r[0] : r) as tf.Tensor;
    },
    dispose() {
      /* 图模型由调用方（m）负责释放 */
    },
  };
}
