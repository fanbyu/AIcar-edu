import { useEffect, useRef, useState } from 'react';

export function ConvWidget() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [kernel, setKernel] = useState<'edge' | 'blur' | 'identity'>('edge');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = 280;
    const H = 160;
    const N = 8;
    let pos = 0;
    let timer = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const lane = x === 3 || x === 4 ? 40 : 210;
          ctx.fillStyle = `rgb(${lane},${lane},${lane})`;
          ctx.fillRect(x * 32 + 8, y * 18 + 8, 30, 16);
        }
      }
      const max = (N - 2) * (N - 2);
      const kx = (pos % (N - 2)) * 32 + 8;
      const ky = (Math.floor(pos / (N - 2)) % (N - 2)) * 18 + 8;
      ctx.strokeStyle = '#2f83f7';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(kx, ky, 3 * 32 - 2, 3 * 18 - 2);
      ctx.fillStyle = 'rgba(47,131,247,0.15)';
      ctx.fillRect(kx, ky, 3 * 32 - 2, 3 * 18 - 2);

      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.fillText(`核: ${kernel}  ·  位置 ${pos + 1}/${max}`, 8, H - 8);

      if (!paused) pos = (pos + 1) % max;
      timer = window.setTimeout(() => requestAnimationFrame(draw), paused ? 800 : 350);
    };
    draw();
    return () => window.clearTimeout(timer);
  }, [paused, kernel]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：3×3 卷积核滑动</p>
      <p className="mb-3 text-xs text-slate-500">
        中间深色竖条模拟赛道胶带。蓝框是卷积核正在「看」的局部区域。
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ['edge', '边缘核'],
            ['blur', '模糊核'],
            ['identity', '恒等核'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKernel(k)}
            className={
              'rounded-lg px-3 py-1.5 text-xs font-semibold ' +
              (kernel === k ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 shadow-sm')
            }
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"
        >
          {paused ? '继续' : '暂停'}
        </button>
      </div>
      <canvas ref={ref} width={280} height={160} className="w-full rounded-xl bg-white" />
    </div>
  );
}
