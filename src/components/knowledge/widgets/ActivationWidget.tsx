import { useMemo, useState } from 'react';

type Act = 'relu' | 'sigmoid' | 'tanh';

function f(act: Act, x: number): number {
  if (act === 'relu') return Math.max(0, x);
  if (act === 'sigmoid') return 1 / (1 + Math.exp(-x));
  return Math.tanh(x);
}

const colors: Record<Act, string> = {
  relu: '#2f83f7',
  sigmoid: '#06b6d4',
  tanh: '#8b5cf6',
};

const hints: Record<Act, string> = {
  relu: '负数归零，正数原样通过。深层网络最常用。',
  sigmoid: '输出挤到 (0,1)，像概率；深层时梯度可能变小。',
  tanh: '输出在 (-1,1)，关于原点对称。',
};

export function ActivationWidget() {
  const [act, setAct] = useState<Act>('relu');
  const [x, setX] = useState(1.2);
  const W = 320;
  const H = 160;
  const y = f(act, x);

  const pts = useMemo(() => {
    const arr: string[] = [];
    for (let px = 0; px <= W; px++) {
      const xv = (px / W) * 10 - 5;
      const yv = f(act, xv);
      const py = H / 2 - (yv / 2.2) * (H / 2 - 12);
      arr.push(`${px},${py}`);
    }
    return arr.join(' ');
  }, [act]);

  const px = ((x + 5) / 10) * W;
  const py = H / 2 - (y / 2.2) * (H / 2 - 12);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-3 text-sm font-medium text-slate-800">交互：激活函数曲线</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(['relu', 'sigmoid', 'tanh'] as Act[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAct(a)}
            className={
              'rounded-lg px-3 py-1.5 text-xs font-semibold ' +
              (act === a ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 shadow-sm')
            }
          >
            {a}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-white">
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#e2e8f0" />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#e2e8f0" />
        <polyline points={pts} fill="none" stroke={colors[act]} strokeWidth={2.5} />
        <circle cx={px} cy={py} r={6} fill={colors[act]} />
      </svg>
      <label className="mt-3 block text-sm text-slate-600">
        输入 x = {x.toFixed(2)} → 输出 y = {y.toFixed(3)}
        <input
          type="range"
          min={-5}
          max={5}
          step={0.1}
          value={x}
          onChange={(e) => setX(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">{hints[act]}</p>
    </div>
  );
}
