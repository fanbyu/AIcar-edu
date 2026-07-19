// SPDX-License-Identifier: AGPL-3.0-or-later
import * as tf from '@tensorflow/tfjs';

let backendReady = false;

/**
 * 初始化 TF.js，固定 WebGL 后端并做 warmup，避免首次推理卡顿。
 * 必须在任何模型加载/训练前调用一次。
 */
export async function ensureTfReady(): Promise<void> {
  if (backendReady) return;
  await tf.setBackend('webgl');
  await tf.ready();
  // warmup
  const t = tf.zeros([1, 224, 224, 3]);
  const r = t.dataSync();
  t.dispose();
  void r;
  backendReady = true;
}

export function getBackendName(): string {
  return tf.getBackend();
}

export async function getGpuMemoryMB(): Promise<number | null> {
  const mem = (tf.backend() as unknown as { numBytesInGPU?: number })
    .numBytesInGPU;
  if (typeof mem !== 'number') return null;
  return mem / (1024 * 1024);
}

export { tf };
