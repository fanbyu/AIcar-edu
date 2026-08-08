import { useMemo, useState } from 'react';

/** XOR 四点：相同→0，不同→1 */
const XOR: { x: number; y: number; label: 0 | 1 }[] = [
  { x: 0, y: 0, label: 0 },
  { x: 0, y: 1, label: 1 },
  { x: 1, y: 0, label: 1 },
  { x: 1, y: 1, label: 0 },
];

export function XorWidget() {
  const [angle, setAngle] = useState(35);
  const [offset, setOffset] = useState(0.5);
  const [showCurve, setShowCurve] = useState(false);

  const W = 260;
  const H = 220;
  const pad = 40;
  const toX = (x: number) => pad + x * (W - 2 * pad);
  const toY = (y: number) => H - pad - y * (H - 2 * pad);

  // 直线：过点沿 angle，用法线形式简化为 y = tan* x + c 的采样
  const rad = (angle * Math.PI) / 180;
  // 决策：点到直线的有符号距离。直线：点法线 n=(cos,sin)，过 (offset 相关)
  const nx = Math.cos(rad);
  const ny = Math.sin(rad);
  const c = offset; // n·p = c 为边界

  const side = (x: number, y: number) => (nx * x + ny * y >= c ? 1 : 0);

  const correct = useMemo(
    () => XOR.filter((p) => side(p.x, p.y) === p.label).length,
    [angle, offset]
  );

  // 边界线段：在单位正方形内求 n·p = c 的两端
  const boundary = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    // 与四边求交
    const edges: [number, number, number, number][] = [
      [0, 0, 1, 0],
      [0, 1, 1, 1],
      [0, 0, 0, 1],
      [1, 0, 1, 1],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      const d1 = nx * x1 + ny * y1 - c;
      const d2 = nx * x2 + ny * y2 - c;
      if (d1 === 0) pts.push({ x: x1, y: y1 });
      if (d1 * d2 < 0) {
        const t = d1 / (d1 - d2);
        pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
      }
    }
    if (pts.length < 2) return null;
    return { x1: toX(pts[0].x), y1: toY(pts[0].y), x2: toX(pts[1].x), y2: toY(pts[1].y) };
  }, [angle, offset]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：XOR 线性不可分</p>
      <p className="mb-3 text-xs text-slate-500">
        橙=异或为真(1)，蓝=假(0)。任意直线最多分对 3 个点；勾选「示意非线性边界」看多层思路。
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-white">
        <rect
          x={pad}
          y={pad}
          width={W - 2 * pad}
          height={H - 2 * pad}
          fill="#f8fafc"
          stroke="#e2e8f0"
        />
        {showCurve && (
          <path
            d={`M ${toX(0)} ${toY(0.55)} Q ${toX(0.5)} ${toY(1.15)} ${toX(1)} ${toY(0.55)}`}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth={2.5}
            strokeDasharray="6 4"
          />
        )}
        {boundary && (
          <line
            x1={boundary.x1}
            y1={boundary.y1}
            x2={boundary.x2}
            y2={boundary.y2}
            stroke="#2f83f7"
            strokeWidth={2.5}
          />
        )}
        {XOR.map((p, i) => (
          <g key={i}>
            <circle
              cx={toX(p.x)}
              cy={toY(p.y)}
              r={10}
              fill={p.label === 1 ? '#f59e0b' : '#3b82f6'}
              stroke={side(p.x, p.y) === p.label ? '#22c55e' : '#ef4444'}
              strokeWidth={2.5}
            />
            <text
              x={toX(p.x)}
              y={toY(p.y) - 14}
              textAnchor="middle"
              fontSize={10}
              fill="#64748b"
            >
              ({p.x},{p.y})→{p.label}
            </text>
          </g>
        ))}
        <text x={pad} y={H - 8} fontSize={11} fill="#64748b">
          绿圈=分对 · 红圈=分错
        </text>
      </svg>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">
          直线角度 {angle}°
          <input
            type="range"
            min={0}
            max={180}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <label className="text-xs text-slate-600">
          直线偏移 {offset.toFixed(2)}
          <input
            type="range"
            min={0}
            max={100}
            value={offset * 100}
            onChange={(e) => setOffset(Number(e.target.value) / 100)}
            className="mt-1 w-full"
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showCurve}
          onChange={(e) => setShowCurve(e.target.checked)}
        />
        示意非线性边界（多层网络才能学到的弯折）
      </label>

      <div
        className={`mt-3 rounded-xl p-3 text-sm ${
          correct === 4 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
        }`}
      >
        当前直线分对 <strong>{correct}/4</strong>
        {correct < 4
          ? ' — 无法用一条直线完美分开 XOR（线性不可分）。'
          : ' — 若你看到 4/4，请检查边界是否穿过点；严格来说 XOR 线性不可分。'}
      </div>
    </div>
  );
}
