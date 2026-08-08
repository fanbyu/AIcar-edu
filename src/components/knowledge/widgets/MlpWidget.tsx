import { useMemo, useState } from 'react';

/** 极简：用线性模型 + tanh 做二维二分类，演示学习率与迭代 */
function train(
  points: { x: number; y: number; label: number }[],
  lr: number,
  steps: number
) {
  let w1 = 0.2;
  let w2 = -0.1;
  let b = 0;
  const losses: number[] = [];
  for (let s = 0; s < steps; s++) {
    let loss = 0;
    let gw1 = 0;
    let gw2 = 0;
    let gb = 0;
    for (const p of points) {
      const z = w1 * p.x + w2 * p.y + b;
      const pred = Math.tanh(z);
      const err = pred - p.label;
      loss += err * err;
      const d = (1 - pred * pred) * err;
      gw1 += d * p.x;
      gw2 += d * p.y;
      gb += d;
    }
    const n = points.length;
    w1 -= (lr * gw1) / n;
    w2 -= (lr * gw2) / n;
    b -= (lr * gb) / n;
    losses.push(loss / n);
  }
  return { w1, w2, b, losses };
}

const DATA = [
  { x: -1.2, y: -0.8, label: -1 },
  { x: -0.9, y: -1.1, label: -1 },
  { x: -1.0, y: 0.2, label: -1 },
  { x: 0.9, y: 1.0, label: 1 },
  { x: 1.2, y: 0.7, label: 1 },
  { x: 0.8, y: 1.3, label: 1 },
  { x: -0.2, y: 1.0, label: 1 },
  { x: 0.3, y: -1.0, label: -1 },
];

export function MlpWidget() {
  const [lr, setLr] = useState(0.15);
  const [steps, setSteps] = useState(40);
  const model = useMemo(() => train(DATA, lr, steps), [lr, steps]);
  const lastLoss = model.losses[model.losses.length - 1] ?? 0;

  const W = 260;
  const H = 180;
  const toX = (x: number) => ((x + 2) / 4) * W;
  const toY = (y: number) => H - ((y + 2) / 4) * H;

  // 决策边界：w1*x + w2*y + b = 0 → y = -(w1*x+b)/w2
  const boundary = useMemo(() => {
    if (Math.abs(model.w2) < 1e-6) return null;
    const x1 = -2;
    const x2 = 2;
    const y1 = -(model.w1 * x1 + model.b) / model.w2;
    const y2 = -(model.w1 * x2 + model.b) / model.w2;
    return { x1: toX(x1), y1: toY(y1), x2: toX(x2), y2: toY(y2) };
  }, [model]);

  const lossPath = model.losses
    .map((l, i) => {
      const x = (i / Math.max(1, model.losses.length - 1)) * (W - 20) + 10;
      const y = H - 20 - Math.min(2, l) * 60;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：玩具 MLP / 梯度下降</p>
      <p className="mb-3 text-xs text-slate-500">
        蓝/橙点为两类样本。调节学习率与步数，观察决策边界与损失曲线（简化一维感知机直觉）。
      </p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">
          学习率 {lr.toFixed(2)}
          <input
            type="range"
            min={1}
            max={50}
            value={lr * 100}
            onChange={(e) => setLr(Number(e.target.value) / 100)}
            className="mt-1 w-full"
          />
        </label>
        <label className="text-xs text-slate-600">
          训练步数 {steps}
          <input
            type="range"
            min={5}
            max={120}
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-white">
          {boundary && (
            <line
              x1={boundary.x1}
              y1={boundary.y1}
              x2={boundary.x2}
              y2={boundary.y2}
              stroke="#2f83f7"
              strokeWidth={2}
            />
          )}
          {DATA.map((p, i) => (
            <circle
              key={i}
              cx={toX(p.x)}
              cy={toY(p.y)}
              r={6}
              fill={p.label > 0 ? '#f59e0b' : '#3b82f6'}
            />
          ))}
        </svg>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-white">
          <text x={10} y={18} fontSize={11} fill="#94a3b8">
            损失曲线（越小越好）
          </text>
          <path d={lossPath} fill="none" stroke="#8b5cf6" strokeWidth={2} />
          <text x={10} y={H - 8} fontSize={11} fill="#64748b">
            当前损失 ≈ {lastLoss.toFixed(3)}
          </text>
        </svg>
      </div>
    </div>
  );
}
