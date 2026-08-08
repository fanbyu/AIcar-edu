import { useMemo, useState } from 'react';

interface Box {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

function decide(boxes: Box[]): { cmd: string; reason: string } {
  const person = boxes.find((b) => b.label === '人');
  if (person && person.y > 90 && person.x > 80 && person.x < 180) {
    return { cmd: '停止', reason: '画面中央偏下检测到行人，优先制动' };
  }
  const obstacle = boxes.find((b) => b.label === '障碍');
  if (obstacle) {
    if (obstacle.x < 110) return { cmd: '右绕', reason: '左侧障碍，建议向右绕行' };
    if (obstacle.x > 150) return { cmd: '左绕', reason: '右侧障碍，建议向左绕行' };
    return { cmd: '停止', reason: '正前方障碍' };
  }
  return { cmd: '前进', reason: '未发现近距危险目标' };
}

export function YoloWidget() {
  const [boxes, setBoxes] = useState<Box[]>([
    { id: 'p', label: '人', x: 130, y: 70, color: '#ef4444' },
    { id: 'o', label: '障碍', x: 50, y: 100, color: '#f59e0b' },
  ]);
  const [drag, setDrag] = useState<string | null>(null);
  const decision = useMemo(() => decide(boxes), [boxes]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 260;
    const y = ((e.clientY - rect.top) / rect.height) * 160;
    setBoxes((prev) =>
      prev.map((b) => (b.id === drag ? { ...b, x: Math.max(20, Math.min(220, x)), y: Math.max(20, Math.min(130, y)) } : b))
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">交互：检测框 → 驾驶决策（示意）</p>
      <p className="mb-3 text-xs text-slate-500">拖动彩色检测框，观察规则决策如何变化（非真实 YOLO 权重）。</p>
      <svg
        viewBox="0 0 260 160"
        className="w-full cursor-grab rounded-xl bg-slate-900 active:cursor-grabbing"
        onMouseMove={onMove}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
      >
        <text x={8} y={16} fill="#64748b" fontSize={10}>
          模拟前视画面
        </text>
        {boxes.map((b) => (
          <g key={b.id} onMouseDown={() => setDrag(b.id)}>
            <rect
              x={b.x - 28}
              y={b.y - 18}
              width={56}
              height={36}
              fill="transparent"
              stroke={b.color}
              strokeWidth={2}
              rx={4}
            />
            <text x={b.x - 24} y={b.y - 22} fill={b.color} fontSize={11}>
              {b.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-3 rounded-xl bg-white p-3 text-sm">
        决策：<strong className="text-brand-600">{decision.cmd}</strong>
        <p className="mt-1 text-xs text-slate-500">{decision.reason}</p>
      </div>
    </div>
  );
}
