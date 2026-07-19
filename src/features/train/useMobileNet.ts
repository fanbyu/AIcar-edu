// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import type { MobileNetAlpha } from '@tensorflow-models/mobilenet';
import { ensureTfReady } from '@/lib/tf';

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
const EMBEDDING_NODES: Record<1 | 2, string> = {
  1: 'module_apply_default/MobilenetV1/Logits/global_pool',
  2: 'module_apply_default/MobilenetV2/Logits/AvgPool',
};

/**
 * 在已加载的 GraphModel 上探测真实存在的截断层节点名：
 * 依次尝试「用户自定义完整名 → 友好名的候选列表 → 该版本全部候选 → 内置嵌入兜底」。
 */
function resolveTruncNode(base: tf.GraphModel, version: 1 | 2, preferred: string): string {
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
function probeShape(base: tf.GraphModel, node: string): number[] {
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
function makeFeatureExtractor(base: tf.GraphModel, node: string, outShape: number[]) {
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

/**
 * MobileNet 特征提取封装：加载指定版本/宽度，可选在某卷积层截断，
 * 反复抽取图像特征向量（供 MLP / KNN 等上层分类器使用）。
 *
 * 额外暴露 `truncatedMobileNet`（一个 tf.Model），其输出即为截断层（或内置嵌入）的特征，
 * 供「神经网络代码」里按 `truncatedMobileNet.outputs[0].shape` 构造分类头。
 */
export function useMobileNet(
  config: MobileNetConfig = { version: 1, alpha: 0.25, truncationLayer: 'conv_pw_13_relu' }
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureDim, setFeatureDim] = useState(0);
  const [truncatedMobileNet, setTruncatedMobileNet] = useState<TruncatedMobileNetModel | null>(null);
  const truncRef = useRef<TruncatedMobileNetModel | null>(null);
  const mRef = useRef<{ dispose?: () => void } | null>(null);
  const cfgKey = `${config.version}|${config.alpha}|${config.truncationLayer ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureTfReady();
        setReady(false);
        setError(null);
        setTruncatedMobileNet(null);
        const m = await mobilenet.load({
          version: config.version,
          alpha: config.alpha as MobileNetAlpha,
        });
        if (cancelled) {
          (m as unknown as { dispose?: () => void }).dispose?.();
          return;
        }
        const base = (m as unknown as { model: tf.GraphModel }).model;
        const layer = config.truncationLayer?.trim();
        // 截断层节点：用户留空则用内置全局池化嵌入层；否则运行时探测真实存在的节点
        const node = layer
          ? resolveTruncNode(base, config.version, layer)
          : EMBEDDING_NODES[config.version];
        // 截断层输出形状（去掉批维度）
        const outShape = probeShape(base, node);

        // GraphModel 无法符号式截断成 tf.model（execute 只接受真实张量），
        // 因此用轻量包装对象直接封装 base.execute(真实张量, node) 作为特征提取器。
        const truncated = makeFeatureExtractor(base, node, outShape);

        if (cancelled) {
          (m as unknown as { dispose?: () => void }).dispose?.();
          return;
        }
        mRef.current = m as unknown as { dispose?: () => void };
        truncRef.current = truncated;
        setTruncatedMobileNet(truncated);

        // 特征维度 = 截断层输出形状各维乘积
        const dim = outShape.reduce((a, b) => a * b, 1);
        setFeatureDim(dim);
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? `${e.message}（请检查截断层名称是否正确，留空可使用默认嵌入层）`
            : 'MobileNet 加载失败'
        );
      }
    })();
    return () => {
      cancelled = true;
      truncRef.current?.dispose();
      truncRef.current = null;
      mRef.current?.dispose?.();
      mRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  /** 抽取图像特征（img 为 img/video/canvas 元素），返回截断层输出（已展平） */
  async function infer(
    img: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  ): Promise<Float32Array> {
    const t = truncRef.current;
    if (!t) throw new Error('模型未就绪');
    const px = tf.browser.fromPixels(img as never, 3).toFloat();
    // 与 MobileNet 一致的归一化：[0,255] -> [-1,1]
    const norm = tf.div(tf.sub(px, 127.5), 127.5);
    const resized = tf.image.resizeBilinear(norm as tf.Tensor3D, [224, 224], true);
    const batched = tf.reshape(resized, [-1, 224, 224, 3]);
    const out = t.predict(batched) as tf.Tensor;
    const data = (await out.data()) as Float32Array;
    px.dispose();
    norm.dispose();
    resized.dispose();
    batched.dispose();
    out.dispose();
    return data;
  }

  return { ready, error, infer, featureDim, truncatedMobileNet, config };
}
