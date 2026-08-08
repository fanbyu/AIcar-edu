import { useMemo, useState } from 'react';
import { mapLaneToCommand } from '@/features/lane/driveMapper';
import { COMMAND_LABELS } from '@/features/bluetooth/esp32Protocol';

export function LaneWidget() {
  const [offset, setOffset] = useState(-0.2);
  const [angle, setAngle] = useState(12);
  const decision = useMemo(
    () => mapLaneToCommand(offset, angle, true),
    [offset, angle]
  );

  const W = 320;
  const H = 180;
  const cx = W / 2 + offset * (W * 0.35);
  const rad = (angle * Math.PI) / 180;
  const x1 = cx - Math.sin(rad) * 70;
  const y1 = H * 0.35;
  const x2 = cx + Math.sin(rad) * 70;
  const y2 = H - 16;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：切线角 + 偏移 → 控车指令</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-slate-800">
        <rect x={0} y={H * 0.55} width={W} height={H * 0.45} fill="rgba(47,131,247,0.12)" />
        <line
          x1={W / 2}
          y1={H * 0.55}
          x2={W / 2}
          y2={H}
          stroke="#22d3ee"
          strokeDasharray="6 4"
          strokeWidth={1.5}
        />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f59e0b" strokeWidth={4} strokeLinecap="round" />
        <circle cx={cx} cy={(y1 + y2) / 2} r={5} fill="#ef4444" />
        <text x={12} y={20} fill="#94a3b8" fontSize={11}>
          模拟俯拍画面（下方为 ROI）
        </text>
      </svg>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-600">
          横向偏移 {offset.toFixed(2)}
          <input
            type="range"
            min={-100}
            max={100}
            value={offset * 100}
            onChange={(e) => setOffset(Number(e.target.value) / 100)}
            className="mt-1 w-full"
          />
        </label>
        <label className="text-sm text-slate-600">
          切线角 {angle.toFixed(0)}°
          <input
            type="range"
            min={-45}
            max={45}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
      </div>

      <div className="mt-3 rounded-xl bg-white p-3 text-sm">
        决策指令：
        <strong className="ml-1 text-brand-600">{COMMAND_LABELS[decision.cmd]}</strong>
        <p className="mt-1 text-xs text-slate-500">{decision.reason}</p>
      </div>
    </div>
  );
}
