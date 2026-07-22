// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import type { MobileNetAlpha } from '@tensorflow-models/mobilenet';
import { ensureTfReady } from '@/lib/tf';
import {
  EMBEDDING_NODES,
  makeFeatureExtractor,
  probeShape,
  resolveTruncNode,
  type MobileNetConfig,
  type TruncatedMobileNetModel,
} from './mobilenetTrunc';

export type { TruncatedMobileNetModel } from './mobilenetTrunc';
export type { MobileNetConfig } from './mobilenetTrunc';

interface UseMobileNetOpts {
  /** 把 MobileNet 特征提取放进 Web Worker，主线程不被同步推理阻塞（用于实时识别，避免蓝牙断连）。 */
  workerInfer?: boolean;
  /** 推理后端：'cpu' 不占 GPU（与同芯片蓝牙最稳），'webgl' 快但可能与蓝牙射频冲突。仅 worker 模式生效。 */
  backend?: 'webgl' | 'cpu';
}

/**
 * 加载 MobileNet 并用 `execute(中间节点)` 取「截断特征向量」，供 KNN / 自定义头使用。
 * 额外暴露 `truncatedMobileNet`（一个 tf.Model），其输出即为截断层（或内置嵌入）的特征，
 * 供「神经网络代码」里按 `truncatedMobileNet.outputs[0].shape` 构造分类头。
 *
 * 当 `opts.workerInfer` 为 true 时，特征提取在 Web Worker 中执行（主线程只负责
 * createImageBitmap + 与蓝牙通信），从而根治「实时推理持续占用主线程 → 浏览器蓝牙
 * 栈饿死 → supervision timeout 断连」的问题。若运行环境不支持 Worker，则自动回退到
 * 主线程推理（保证功能可用）。
 */
export function useMobileNet(
  config: MobileNetConfig = { version: 1, alpha: 0.25, truncationLayer: 'conv_pw_13_relu' },
  opts: UseMobileNetOpts = {},
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<'loading' | 'worker' | 'main'>('loading');
  const [usedBackend, setUsedBackend] = useState<'webgl' | 'cpu' | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [featureDim, setFeatureDim] = useState(0);
  const [truncatedMobileNet, setTruncatedMobileNet] = useState<TruncatedMobileNetModel | null>(null);
  const truncRef = useRef<TruncatedMobileNetModel | null>(null);
  const mRef = useRef<{ dispose?: () => void } | null>(null);

  // Worker 推理状态
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const inferSeq = useRef(0);
  const inferPending = useRef(
    new Map<number, { res: (v: Float32Array) => void; rej: (e: unknown) => void }>(),
  );
  // 主线程推理闭包（仅当 worker 不可用时使用）
  const inferMainRef = useRef<((img: CanvasImageSource) => Promise<Float32Array>) | null>(null);

  const cfgKey = `${config.version}|${config.alpha}|${config.truncationLayer ?? ''}|${opts.workerInfer ? 'w' : 'm'}|${opts.backend ?? 'webgl'}`;

  useEffect(() => {
    let cancelled = false;
    workerReadyRef.current = false;

    const fallbackToMain = async () => {
      if (cancelled || truncRef.current) return;
      try {
        await ensureTfReady();
        const m = await mobilenet.load({ version: config.version, alpha: config.alpha as MobileNetAlpha });
        if (cancelled) {
          (m as unknown as { dispose?: () => void }).dispose?.();
          return;
        }
        const base = (m as unknown as { model: tf.GraphModel }).model;
        const node = config.truncationLayer?.trim()
          ? resolveTruncNode(base, config.version, config.truncationLayer)
          : EMBEDDING_NODES[config.version];
        const outShape = probeShape(base, node);
        const truncated = makeFeatureExtractor(base, node, outShape);
        if (cancelled) {
          (m as unknown as { dispose?: () => void }).dispose?.();
          return;
        }
        mRef.current = m as unknown as { dispose?: () => void };
        truncRef.current = truncated;
        inferMainRef.current = async (img: CanvasImageSource) => {
          const px = tf.browser.fromPixels(
            img as unknown as HTMLImageElement | HTMLCanvasElement | ImageBitmap | HTMLVideoElement,
            3,
          ).toFloat();
          const norm = tf.div(tf.sub(px, 127.5), 127.5);
          const resized = tf.image.resizeBilinear(norm as tf.Tensor3D, [224, 224], true);
          const batched = tf.reshape(resized, [-1, 224, 224, 3]);
          const out = truncated.predict(batched) as tf.Tensor;
          const data = (await out.data()) as Float32Array;
          px.dispose();
          norm.dispose();
          resized.dispose();
          batched.dispose();
          out.dispose();
          return data;
        };
        const dim = outShape.reduce((a, b) => a * b, 1);
        setFeatureDim(dim);
        setTruncatedMobileNet(truncated);
        setEngine('main');
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'MobileNet 加载失败');
      }
    };

    const setupWorker = () => {
      try {
        const worker = new Worker(new URL('./inferWorker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        worker.onmessage = (e: MessageEvent) => {
          const msg = e.data as { type: string; id?: number; ok?: boolean; error?: string; featureDim?: number; vec?: Float32Array };
          if (msg.type === 'inited') {
            if (msg.ok) {
              workerReadyRef.current = true;
              setEngine('worker');
              setUsedBackend((msg as { backend?: 'webgl' | 'cpu' }).backend ?? 'cpu');
              setFeatureDim(msg.featureDim ?? 0);
              setReady(true);
            } else {
              console.warn('[MobileNet] Worker 初始化失败，回退主线程推理：', msg.error);
              setEngine('main');
              setWorkerError(msg.error || 'Worker 初始化失败');
              fallbackToMain();
            }
          } else if (msg.type === 'result') {
            const id = msg.id ?? -1;
            const p = inferPending.current.get(id);
            if (p) {
              inferPending.current.delete(id);
              if (msg.error) p.rej(new Error(msg.error));
              else p.res(msg.vec as Float32Array);
            }
          }
        };
        worker.onerror = (ev) => {
          console.warn('[MobileNet] Worker 出错，回退主线程推理：', ev.message);
          setEngine('main');
          setWorkerError(ev.message || 'Worker 加载/执行出错');
          fallbackToMain();
        };
        const id = ++inferSeq.current;
        worker.postMessage({
          type: 'init',
          id,
          version: config.version,
          alpha: config.alpha,
          truncationLayer: config.truncationLayer,
          backend: opts.backend ?? 'webgl',
        });
      } catch (err) {
        console.warn('[MobileNet] 无法创建 Worker，回退主线程推理：', err);
        setEngine('main');
        setWorkerError(err instanceof Error ? err.message : '无法创建 Worker');
        fallbackToMain();
      }
    };

    if (opts.workerInfer && typeof Worker !== 'undefined') {
      setupWorker();
    } else {
      fallbackToMain();
    }

    return () => {
      cancelled = true;
      workerReadyRef.current = false;
      inferPending.current.clear();
      workerRef.current?.terminate();
      workerRef.current = null;
      truncRef.current?.dispose();
      truncRef.current = null;
      mRef.current?.dispose?.();
      mRef.current = null;
      inferMainRef.current = null;
    };
  }, [cfgKey]);

  const infer = useCallback(async (img: CanvasImageSource): Promise<Float32Array> => {
    if (workerRef.current && workerReadyRef.current) {
      const bmp = await createImageBitmap(img as never);
      const id = ++inferSeq.current;
      return new Promise<Float32Array>((res, rej) => {
        inferPending.current.set(id, { res, rej });
        workerRef.current!.postMessage({ type: 'infer', id, bitmap: bmp }, [bmp]);
      });
    }
    if (inferMainRef.current) return inferMainRef.current(img);
    throw new Error('MobileNet 尚未就绪，请稍候再试');
  }, []);

  return { ready, error, engine, usedBackend, workerError, infer, featureDim, truncatedMobileNet, config };
}
