// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';

/** 3x3 卷积核在图像上滑动提取边缘的简单动画 */
export function ConvWidget() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const W = 220;
    const H = 140;
    const N = 8;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // 简易「图像」格子
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const v = ((x + y) % 2) * 40 + 180;
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x * 26, y * 16, 24, 14);
        }
      }
      // 滑动卷积核
      const kx = (pos % (N - 2)) * 26;
      const ky = (Math.floor(pos / (N - 2)) % (N - 2)) * 16;
      ctx.strokeStyle = '#2f83f7';
      ctx.lineWidth = 2;
      ctx.strokeRect(kx, ky, 3 * 26 - 4, 3 * 16 - 4);
      setPos((p) => (p + 1) % ((N - 2) * (N - 2)));
      raf = window.setTimeout(() => {
        requestAnimationFrame(draw);
      }, 400);
    };
    draw();
    return () => {
      window.clearTimeout(raf);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <p className="mb-2 text-xs text-slate-500">3×3 卷积核在图像上滑动（边缘检测示意）</p>
      <canvas ref={ref} width={220} height={140} className="rounded-lg bg-white" />
    </div>
  );
}
