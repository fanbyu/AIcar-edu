import { useMemo, useState } from 'react';

const LABELS = ['前进', '左', '右', '停'] as const;
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];

function softmax(logits: number[], temperature: number): number[] {
  const t = Math.max(0.05, temperature);
  const scaled = logits.map((v) => v / t);
  const max = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function SoftmaxWidget() {
  const [logits, setLogits] = useState([2.0, 0.5, 0.3, -0.2]);
  const [temperature, setTemperature] = useState(1);
  const probs = useMemo(() => softmax(logits, temperature), [logits, temperature]);
  const best = probs.indexOf(Math.max(...probs));
  const conf = probs[best];

  const formula = `Softmax(z/T)ᵢ = exp(zᵢ/T) / Σ exp(zⱼ/T)`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：Softmax 与温度</p>
      <p className="mb-2 font-mono text-[11px] text-slate-500">{formula}</p>
      <p className="mb-3 text-xs text-slate-500">
        调节四类 logits；温度 T 越小分布越「自信」，越大越「犹豫」。
      </p>

      <label className="mb-4 block text-sm text-slate-600">
        温度 T = {temperature.toFixed(2)}
        <input
          type="range"
          min={15}
          max={300}
          value={temperature * 100}
          onChange={(e) => setTemperature(Number(e.target.value) / 100)}
          className="mt-1 w-full"
        />
      </label>

      <div className="space-y-3">
        {LABELS.map((label, i) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-xs">
              <span style={{ color: COLORS[i] }} className="font-semibold">
                {label}
              </span>
              <span className="text-slate-500">
                z={logits[i].toFixed(1)} → {(probs[i] * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={40}
              value={logits[i] * 10}
              onChange={(e) => {
                const next = [...logits];
                next[i] = Number(e.target.value) / 10;
                setLogits(next);
              }}
              className="w-full"
            />
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${probs[i] * 100}%`, background: COLORS[i] }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-white p-3 text-sm">
        预测：<strong style={{ color: COLORS[best] }}>{LABELS[best]}</strong>
        ，置信度 {(conf * 100).toFixed(1)}%
        {conf < 0.45 && (
          <span className="ml-2 text-rose-600">→ 建议停车（置信度偏低）</span>
        )}
        <p className="mt-2 text-xs text-slate-500">
          概率之和 = {probs.reduce((a, b) => a + b, 0).toFixed(4)}（应≈1）
        </p>
      </div>
    </div>
  );
}
