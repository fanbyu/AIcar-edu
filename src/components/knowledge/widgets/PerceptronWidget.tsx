import { useMemo, useState } from 'react';

type Cls = 0 | 1;

interface Pt {
  x: number;
  y: number;
  label: Cls;
}

const seed: Pt[] = [
  { x: -1.2, y: -0.8, label: 0 },
  { x: -0.6, y: -1.0, label: 0 },
  { x: -1.0, y: 0.2, label: 0 },
  { x: 0.8, y: 0.9, label: 1 },
  { x: 1.1, y: 0.5, label: 1 },
  { x: 0.6, y: 1.2, label: 1 },
];

export function PerceptronWidget() {
  const [w1, setW1] = useState(1.2);
  const [w2, setW2] = useState(0.8);
  const [b, setB] = useState(-0.2);
  const [paint, setPaint] = useState<Cls>(1);
  const [points, setPoints] = useState<Pt[]>(seed);

  const W = 280;
  const H = 200;
  const toX = (x: number) => ((x + 2) / 4) * W;
  const toY = (y: number) => H - ((y + 2) / 4) * H;
  const fromSvg = (sx: number, sy: number) => ({
    x: (sx / W) * 4 - 2,
    y: ((H - sy) / H) * 4 - 2,
  });

  const predict = (x: number, y: number) => (w1 * x + w2 * y + b >= 0 ? 1 : 0);

  const correct = useMemo(
    () => points.filter((p) => predict(p.x, p.y) === p.label).length,
    [points, w1, w2, b]
  );

  // 决策线：w1*x + w2*y + b = 0
  const line = useMemo(() => {
    if (Math.abs(w2) < 1e-6) {
      const x = -b / (w1 || 1e-6);
      return { x1: toX(x), y1: 0, x2: toX(x), y2: H };
    }
    const yAt = (x: number) => -(w1 * x + b) / w2;
    return { x1: toX(-2), y1: toY(yAt(-2)), x2: toX(2), y2: toY(yAt(2)) };
  }, [w1, w2, b]);

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    const { x, y } = fromSvg(sx, sy);
    setPoints((prev) => [...prev, { x, y, label: paint }]);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：感知机决策边界</p>
      <p className="mb-3 text-xs text-slate-500">
        y = step(w₁x + w₂y + b)。蓝点=类0，橙点=类1。调节权重观察直线旋转/平移。
      </p>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setPaint(0)}
          className={`rounded-full px-3 py-1 ${paint === 0 ? 'bg-blue-600 text-white' : 'bg-white shadow-sm'}`}
        >
          画类 0
        </button>
        <button
          type="button"
          onClick={() => setPaint(1)}
          className={`rounded-full px-3 py-1 ${paint === 1 ? 'bg-amber-500 text-white' : 'bg-white shadow-sm'}`}
        >
          画类 1
        </button>
        <button
          type="button"
          onClick={() => setPoints(seed)}
          className="rounded-full bg-white px-3 py-1 shadow-sm"
        >
          重置样本
        </button>
        <span className="ml-auto self-center text-slate-600">
          分对 {correct}/{points.length}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair rounded-xl bg-white"
        onClick={onClick}
      >
        <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#2f83f7" strokeWidth={2.5} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toX(p.x)}
            cy={toY(p.y)}
            r={6}
            fill={p.label === 1 ? '#f59e0b' : '#3b82f6'}
            stroke={predict(p.x, p.y) === p.label ? 'none' : '#ef4444'}
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-slate-600">
          w₁ = {w1.toFixed(2)}
          <input
            type="range"
            min={-30}
            max={30}
            value={w1 * 10}
            onChange={(e) => setW1(Number(e.target.value) / 10)}
            className="mt-1 w-full"
          />
        </label>
        <label className="text-xs text-slate-600">
          w₂ = {w2.toFixed(2)}
          <input
            type="range"
            min={-30}
            max={30}
            value={w2 * 10}
            onChange={(e) => setW2(Number(e.target.value) / 10)}
            className="mt-1 w-full"
          />
        </label>
        <label className="text-xs text-slate-600">
          b = {b.toFixed(2)}
          <input
            type="range"
            min={-30}
            max={30}
            value={b * 10}
            onChange={(e) => setB(Number(e.target.value) / 10)}
            className="mt-1 w-full"
          />
        </label>
      </div>
      <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-600">
        z = {w1.toFixed(2)}·x + {w2.toFixed(2)}·y + ({b.toFixed(2)})　→　step(z)
      </p>
    </div>
  );
}
