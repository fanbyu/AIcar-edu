// SPDX-License-Identifier: AGPL-3.0-or-later
export interface Point {
  epoch: number;
  loss: number;
  acc: number;
}

/** 轻量 SVG 损失/准确率曲线（避免重型图表依赖） */
export function TrainingChart({ data, height = 140 }: { data: Point[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-xs text-slate-400">
        训练开始后显示损失与准确率曲线
      </div>
    );
  }
  const W = 320;
  const H = height;
  const pad = 18;
  const finite = (v: number) => (Number.isFinite(v) ? v : 0);
  const losses = data.map((d) => finite(d.loss)).filter((v) => v > 0);
  const accs = data.map((d) => finite(d.acc)).filter((v) => v > 0);
  const maxLoss = Math.max(losses.length ? Math.max(...losses) : 0.1, 0.1);
  const maxAcc = Math.max(accs.length ? Math.max(...accs) : 1, 0.1);
  const x = (i: number) => pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
  const yLoss = (v: number) => H - pad - (finite(v) / maxLoss) * (H - pad * 2);
  const yAcc = (v: number) => H - pad - (finite(v) / maxAcc) * (H - pad * 2);
  const lossPath = data
    .map((d, i) => `${i ? 'L' : 'M'}${x(i)},${yLoss(d.loss)}`)
    .join(' ');
  const accPath = data
    .map((d, i) => `${i ? 'L' : 'M'}${x(i)},${yAcc(d.acc)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e2e8f0" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#e2e8f0" />
      <path d={lossPath} fill="none" stroke="#ef4444" strokeWidth={2} />
      <path d={accPath} fill="none" stroke="#22c55e" strokeWidth={2} />
      <g className="text-[8px] fill-slate-400">
        <text x={W - pad - 28} y={yLoss(data[data.length - 1].loss) - 4} fill="#ef4444">
          损失
        </text>
        <text x={W - pad - 28} y={yAcc(data[data.length - 1].acc) - 4} fill="#22c55e">
          准确率
        </text>
      </g>
    </svg>
  );
}
