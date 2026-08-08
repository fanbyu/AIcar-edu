import { useMemo, useState } from 'react';

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function dot(ax: number, ay: number, bx: number, by: number) {
  return ax * bx + ay * by;
}

function norm(x: number, y: number) {
  return Math.hypot(x, y);
}

function cosine(ax: number, ay: number, bx: number, by: number) {
  const na = norm(ax, ay);
  const nb = norm(bx, by);
  if (na < 1e-9 || nb < 1e-9) return 0;
  return clamp(dot(ax, ay, bx, by) / (na * nb), -1, 1);
}

function euclid(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

export function CosineWidget() {
  const [ax, setAx] = useState(1.2);
  const [ay, setAy] = useState(0.4);
  const [bx, setBx] = useState(0.6);
  const [by, setBy] = useState(1.0);

  const cos = useMemo(() => cosine(ax, ay, bx, by), [ax, ay, bx, by]);
  const ang = useMemo(() => (Math.acos(cos) * 180) / Math.PI, [cos]);
  const dist = useMemo(() => euclid(ax, ay, bx, by), [ax, ay, bx, by]);

  const W = 280;
  const H = 220;
  const ox = W / 2;
  const oy = H / 2;
  const scale = 55;

  const toCanvas = (x: number, y: number) => ({
    x: ox + x * scale,
    y: oy - y * scale,
  });

  const A = toCanvas(ax, ay);
  const B = toCanvas(bx, by);

  const setSameDirection = () => {
    setAx(1.0);
    setAy(0.5);
    setBx(2.0);
    setBy(1.0);
  };

  const setOrthogonal = () => {
    setAx(1.2);
    setAy(0);
    setBx(0);
    setBy(1.2);
  };

  const setOpposite = () => {
    setAx(1);
    setAy(0.3);
    setBx(-1);
    setBy(-0.3);
  };

  const drag = (which: 'a' | 'b', e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    const x = clamp((px - ox) / scale, -2.2, 2.2);
    const y = clamp((oy - py) / scale, -2.2, 2.2);
    if (which === 'a') {
      setAx(x);
      setAy(y);
    } else {
      setBx(x);
      setBy(y);
    }
  };

  const [dragging, setDragging] = useState<'a' | 'b' | null>(null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：二维向量的余弦相似度</p>
      <p className="mb-2 font-mono text-[11px] text-slate-500">
        cosθ = (A·B) / (|A|·|B|)
      </p>
      <p className="mb-3 text-xs text-slate-500">
        拖动箭头端点，或点快捷按钮。对比「余弦」与「欧氏距离」。
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={setSameDirection} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium shadow-sm">
          同向不同长
        </button>
        <button type="button" onClick={setOrthogonal} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium shadow-sm">
          互相垂直
        </button>
        <button type="button" onClick={setOpposite} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium shadow-sm">
          近似反向
        </button>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair rounded-xl bg-white"
        onMouseDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const py = ((e.clientY - rect.top) / rect.height) * H;
          const da = Math.hypot(px - A.x, py - A.y);
          const db = Math.hypot(px - B.x, py - B.y);
          setDragging(da <= db ? 'a' : 'b');
          drag(da <= db ? 'a' : 'b', e);
        }}
        onMouseMove={(e) => {
          if (dragging) drag(dragging, e);
        }}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        <line x1={20} y1={oy} x2={W - 20} y2={oy} stroke="#e2e8f0" />
        <line x1={ox} y1={20} x2={ox} y2={H - 20} stroke="#e2e8f0" />
        <line x1={ox} y1={oy} x2={A.x} y2={A.y} stroke="#2f83f7" strokeWidth={3} />
        <line x1={ox} y1={oy} x2={B.x} y2={B.y} stroke="#f59e0b" strokeWidth={3} />
        <circle cx={A.x} cy={A.y} r={7} fill="#2f83f7" />
        <circle cx={B.x} cy={B.y} r={7} fill="#f59e0b" />
        <text x={A.x + 8} y={A.y} fontSize={12} fill="#2f83f7">
          A
        </text>
        <text x={B.x + 8} y={B.y} fontSize={12} fill="#f59e0b">
          B
        </text>
      </svg>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-3 text-sm">
          <div className="text-xs text-slate-400">余弦相似度</div>
          <div className="text-2xl font-bold text-brand-600">{cos.toFixed(3)}</div>
          <div className="text-xs text-slate-500">夹角 ≈ {ang.toFixed(1)}°</div>
        </div>
        <div className="rounded-xl bg-white p-3 text-sm">
          <div className="text-xs text-slate-400">欧氏距离</div>
          <div className="text-2xl font-bold text-slate-800">{dist.toFixed(3)}</div>
          <div className="text-xs text-slate-500">点与点的直线距离</div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        点「同向不同长」：余弦仍接近 1（很像），但欧氏距离会变大——说明余弦更关注方向模式，适合特征相似度。
      </p>
    </div>
  );
}
