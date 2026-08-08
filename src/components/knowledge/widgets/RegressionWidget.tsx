import { useMemo, useState } from 'react';
import { clamp } from '@/lib/utils';

function classify(offset: number): string {
  if (offset < -0.5) return '左';
  if (offset > 0.5) return '右';
  if (Math.abs(offset) < 0.2) return '前进';
  return offset < 0 ? '左' : '右';
}

function continuous(offset: number): number {
  return clamp(offset, -1, 1);
}

function continuousLabel(s: number): string {
  if (Math.abs(s) < 0.12) return '前进 (F)';
  if (s < -0.55) return '急左 (TL)';
  if (s > 0.55) return '急右 (TR)';
  if (s < 0) return '左前 (LF)';
  return '右前 (RF)';
}

export function RegressionWidget() {
  const [offset, setOffset] = useState(0.35);
  const cls = useMemo(() => classify(offset), [offset]);
  const steer = useMemo(() => continuous(offset), [offset]);
  const bar = ((steer + 1) / 2) * 100;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：分类四档 vs 连续转向</p>
      <p className="mb-3 text-xs text-slate-500">
        横向偏移 offset ∈ [-1,1]：负=偏左，正=偏右。对比两种决策方式。
      </p>

      <label className="block text-sm text-slate-700">
        偏移 offset = {offset.toFixed(2)}
        <input
          type="range"
          min={-100}
          max={100}
          value={offset * 100}
          onChange={(e) => setOffset(Number(e.target.value) / 100)}
          className="mt-1 w-full"
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">分类</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{cls}</div>
          <p className="mt-2 text-xs text-slate-500">
            只有少数档位，offset 从 0.25 到 0.45 可能仍是同一指令，弯道易抖动。
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">回归</div>
          <div className="mt-2 text-2xl font-bold text-brand-600">{steer.toFixed(2)}</div>
          <p className="mt-1 text-sm text-slate-700">{continuousLabel(steer)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-gradient"
              style={{ width: `${bar}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">连续数值可映射到更细的转向档位。</p>
        </div>
      </div>
    </div>
  );
}
