import { useMemo, useState } from 'react';

type Label = '前进' | '左' | '右' | '停';

interface Point {
  x: number;
  y: number;
  label: Label;
}

const COLORS: Record<Label, string> = {
  前进: '#22c55e',
  左: '#3b82f6',
  右: '#f59e0b',
  停: '#ef4444',
};

const LABELS: Label[] = ['前进', '左', '右', '停'];

function dist(a: Point, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const seed: Point[] = [
  { x: 80, y: 60, label: '前进' },
  { x: 100, y: 80, label: '前进' },
  { x: 70, y: 90, label: '前进' },
  { x: 40, y: 50, label: '左' },
  { x: 50, y: 70, label: '左' },
  { x: 35, y: 100, label: '左' },
  { x: 150, y: 55, label: '右' },
  { x: 160, y: 85, label: '右' },
  { x: 145, y: 110, label: '右' },
  { x: 100, y: 140, label: '停' },
  { x: 120, y: 150, label: '停' },
];

export function KnnWidget() {
  const [points, setPoints] = useState<Point[]>(seed);
  const [paint, setPaint] = useState<Label>('前进');
  const [k, setK] = useState(3);
  const [query, setQuery] = useState<{ x: number; y: number } | null>({ x: 95, y: 100 });
  const [mode, setMode] = useState<'add' | 'query'>('query');

  const result = useMemo(() => {
    if (!query || points.length === 0) return null;
    const ranked = [...points]
      .map((p) => ({ p, d: dist(p, query) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.min(k, points.length));
    const votes: Record<string, number> = {};
    for (const r of ranked) votes[r.p.label] = (votes[r.p.label] || 0) + 1;
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] as Label;
    return { ranked, winner, votes };
  }, [query, points, k]);

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 200;
    const y = ((e.clientY - rect.top) / rect.height) * 180;
    if (mode === 'add') {
      setPoints((prev) => [...prev, { x, y, label: paint }]);
    } else {
      setQuery({ x, y });
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：二维平面上的 KNN</p>
      <p className="mb-3 text-xs text-slate-500">
        点表示训练样本（可理解为压缩后的特征）。点击放置查询点，观察 K 个邻居如何投票。
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === 'query' ? 'bg-slate-900 text-white' : 'bg-white shadow-sm'}`}
          onClick={() => setMode('query')}
        >
          放置查询点
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === 'add' ? 'bg-slate-900 text-white' : 'bg-white shadow-sm'}`}
          onClick={() => setMode('add')}
        >
          添加样本
        </button>
        {LABELS.map((l) => (
          <button
            key={l}
            type="button"
            disabled={mode !== 'add'}
            onClick={() => setPaint(l)}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
            style={{ background: COLORS[l] }}
          >
            {l}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
          K={k}
          <input
            type="range"
            min={1}
            max={9}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            className="w-24"
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-white px-2 py-1 text-xs shadow-sm"
          onClick={() => setPoints(seed)}
        >
          重置
        </button>
      </div>

      <svg
        viewBox="0 0 200 180"
        className="w-full cursor-crosshair rounded-xl bg-white"
        onClick={onSvgClick}
      >
        {result?.ranked.map(({ p }, i) => (
          <line
            key={i}
            x1={query!.x}
            y1={query!.y}
            x2={p.x}
            y2={p.y}
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={5} fill={COLORS[p.label]} opacity={0.9} />
        ))}
        {query && (
          <g>
            <circle cx={query.x} cy={query.y} r={8} fill="none" stroke="#0f172a" strokeWidth={2} />
            <circle cx={query.x} cy={query.y} r={3} fill="#0f172a" />
          </g>
        )}
      </svg>

      {result && (
        <div className="mt-3 rounded-xl bg-white p-3 text-sm">
          预测类别：
          <strong style={{ color: COLORS[result.winner] }}> {result.winner}</strong>
          <span className="ml-2 text-xs text-slate-500">
            票数{' '}
            {Object.entries(result.votes)
              .map(([l, v]) => `${l}:${v}`)
              .join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}
