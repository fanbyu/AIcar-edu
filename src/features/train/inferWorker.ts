// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference lib="webworker" />
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import type { MobileNetAlpha } from '@tensorflow-models/mobilenet';
import {
  EMBEDDING_NODES,
  resolveTruncNode,
  probeShape,
} from './mobilenetTrunc';

type InitMsg = {
  type: 'init';
  id: number;
  version: 1 | 2;
  alpha: number;
  truncationLayer?: string;
  /** 推理后端：'cpu' 不占 GPU（蓝牙最稳），'webgl' 快但可能与同芯片蓝牙射频冲突。 */
  backend?: 'webgl' | 'cpu';
};
type InferMsg = { type: 'infer'; id: number; bitmap: ImageBitmap };
type InMsg = InitMsg | InferMsg;

const post = (m: unknown, transfer?: Transferable[]) => {
  if (transfer) (self as unknown as Worker).postMessage(m, transfer);
  else (self as unknown as Worker).postMessage(m);
};

let base: tf.GraphModel | null = null;
let node = '';

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as InMsg;
  if (msg.type === 'init') {
    try {
      const wantWebgl = (msg.backend ?? 'webgl') === 'webgl';
      if (wantWebgl) {
        try {
          await tf.setBackend('webgl');
        } catch {
          try {
            await tf.setBackend('cpu');
          } catch {
            /* 交给后续 tf.ready() 抛错，由上层决定回退 */
          }
        }
      } else {
        // CPU 后端：纯 JS/WASM，完全不占用 GPU，避免与同芯片蓝牙发生射频/总线冲突。
        try {
          await tf.setBackend('cpu');
        } catch {
          /* 交给后续 tf.ready() 抛错 */
        }
      }
      await tf.ready();
      const m = await mobilenet.load({ version: msg.version, alpha: msg.alpha as MobileNetAlpha });
      base = (m as unknown as { model: tf.GraphModel }).model;
      node = msg.truncationLayer?.trim()
        ? resolveTruncNode(base, msg.version, msg.truncationLayer)
        : EMBEDDING_NODES[msg.version];
      const outShape = probeShape(base, node);
      const dim = outShape.reduce((a, b) => a * b, 1);
      post({ type: 'inited', id: msg.id, ok: true, featureDim: dim, backend: tf.getBackend() });
    } catch (err) {
      post({
        type: 'inited',
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (msg.type === 'infer') {
    if (!base) {
      post({ type: 'result', id: msg.id, error: 'model not ready' });
      return;
    }
    let bmp: ImageBitmap | null = msg.bitmap;
    try {
      const w = bmp.width;
      const h = bmp.height;
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('worker OffscreenCanvas 2d 上下文不可用');
      ctx.drawImage(bmp, 0, 0);
      // 用 ImageData 喂给 fromPixels：ImageData 在所有 tfjs 版本都被支持，
      // 避免部分环境对 OffscreenCanvas 作为 fromPixels 输入的兼容问题。
      const imageData = ctx.getImageData(0, 0, w, h);
      const px = tf.browser.fromPixels(imageData, 3).toFloat();
      const norm = tf.div(tf.sub(px, 127.5), 127.5);
      const resized = tf.image.resizeBilinear(norm as tf.Tensor3D, [224, 224], true);
      const batched = tf.reshape(resized, [-1, 224, 224, 3]);
      const out = base.execute(batched, node) as tf.Tensor;
      const data = (await out.data()) as Float32Array;
      px.dispose();
      norm.dispose();
      resized.dispose();
      batched.dispose();
      out.dispose();
      post({ type: 'result', id: msg.id, vec: data }, [data.buffer]);
    } catch (err) {
      post({
        type: 'result',
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      bmp?.close();
    }
  }
};
