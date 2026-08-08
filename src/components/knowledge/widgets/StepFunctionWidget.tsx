import { useMemo, useState } from 'react';

function step(z: number, theta: number) {
  return z >= theta ? 1 : 0;
}

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

export function StepFunctionWidget() {
  const [z, setZ] = useState(0.5);
  const [theta, setTheta] = useState(0);
  const W = 320;
  const H = 160;

  const stepPts = useMemo(() => {
    const pts: string[] = [];
    for (let px = 0; px <= W; px++) {
      const xv = (px / W) * 10 - 5;
      const yv = step(xv, theta);
      const py = H - 20 - yv * (H - 40);
      pts.push(`${px},${py}`);
    }
    return pts.join(' ');
  }, [theta]);

  const sigPts = useMemo(() => {
    const pts: string[] = [];
    for (let px = 0; px <= W; px++) {
      const xv = (px / W) * 10 - 5;
      const yv = sigmoid(xv - theta);
      const py = H - 20 - yv * (H - 40);
      pts.push(`${px},${py}`);
    }
    return pts.join(' ');
  }, [theta]);

  const zx = ((z + 5) / 10) * W;
  const stepY = H - 20 - step(z, theta) * (H - 40);
  const sigY = H - 20 - sigmoid(z - theta) * (H - 40);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：阶跃函数 vs Sigmoid</p>
      <p className="mb-3 text-xs text-slate-500">
        蓝线为阶跃（硬开关），紫线为 Sigmoid（平滑）。阈值 θ 平移「开关」位置。
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-white">
        <line x1={0} y1={H - 20} x2={W} y2={H - 20} stroke="#e2e8f0" />
        <polyline points={sigPts} fill="none" stroke="#8b5cf6" strokeWidth={2} />
        <polyline points={stepPts} fill="none" stroke="#2f83f7" strokeWidth={2.5} />
        <line
          x1={((theta + 5) / 10) * W}
          y1={10}
          x2={((theta + 5) / 10) * W}
          y2={H - 10}
          stroke="#94a3b8"
          strokeDasharray="4 3"
        />
        <circle cx={zx} cy={stepY} r={5} fill="#2f83f7" />
        <circle cx={zx} cy={sigY} r={4} fill="#8b5cf6" />
        <text x={8} y={16} fontSize={11} fill="#64748b">
          蓝=阶跃 · 紫=Sigmoid · 虚线=阈值 θ
        </text>
      </svg>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-600">
          输入 z = {z.toFixed(2)}
          <input
            type="range"
            min={-50}
            max={50}
            value={z * 10}
            onChange={(e) => setZ(Number(e.target.value) / 10)}
            className="mt-1 w-full"
          />
        </label>
        <label className="text-sm text-slate-600">
          阈值 θ = {theta.toFixed(2)}
          <input
            type="range"
            min={-30}
            max={30}
            value={theta * 10}
            onChange={(e) => setTheta(Number(e.target.value) / 10)}
            className="mt-1 w-full"
          />
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
        <div className="rounded-xl bg-white p-3">
          阶跃输出：<strong className="text-brand-600">{step(z, theta)}</strong>
          <p className="mt-1 text-xs text-slate-500">z ≥ θ → 1，否则 0</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          Sigmoid：<strong className="text-violet-600">{sigmoid(z - theta).toFixed(3)}</strong>
          <p className="mt-1 text-xs text-slate-500">平滑过渡，便于梯度训练</p>
        </div>
      </div>
    </div>
  );
}
