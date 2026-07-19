// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';

type Act = 'relu' | 'sigmoid' | 'tanh';

function f(act: Act, x: number): number {
  if (act === 'relu') return Math.max(0, x);
  if (act === 'sigmoid') return 1 / (1 + Math.exp(-x));
  return Math.tanh(x);
}

const colors: Record<Act, string> = { relu: '#2f83f7', sigmoid: '#06b6d4', tanh: '#8b5cf6' };

export function ActivationWidget() {
  const [act, setAct] = useState<Act>('relu');
  const W = 280;
  const H = 140;
  const pts: string[] = [];
  for (let px = 0; px <= W; px++) {
    const x = (px / W) * 10 - 5;
    const y = f(act, x);
    const py = H / 2 - (y / 3) * (H / 2 - 10);
    pts.push(`${px},${py}`);
  }
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex gap-2 text-xs">
        {(['relu', 'sigmoid', 'tanh'] as Act[]).map((a) => (
          <button
            key={a}
            onClick={() => setAct(a)}
            className={
              'rounded-lg px-3 py-1 font-medium ' +
              (act === a ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')
            }
          >
            {a}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#e2e8f0" />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#e2e8f0" />
        <polyline points={pts.join(' ')} fill="none" stroke={colors[act]} strokeWidth={2.5} />
      </svg>
    </div>
  );
}
