// SPDX-License-Identifier: AGPL-3.0-or-later
// AI 训练平台通用 UI 与工具
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export const CLASS_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#ca8a04',
  '#0d9488',
];

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
export function downloadBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SectionCard({
  icon,
  title,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-soft ${className ?? ''}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-brand-600">{icon}</span>
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function UnsupportedNotice({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{reason}</span>
    </div>
  );
}

export function SampleBars({
  counts,
  names,
}: {
  counts: number[];
  names: string[];
}) {
  const max = Math.max(1, ...counts);
  return (
    <div className="space-y-1.5">
      {names.map((name, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-16 truncate text-[11px] text-slate-600">{name}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded"
              style={{
                width: `${((counts[i] ?? 0) / max) * 100}%`,
                background: CLASS_COLORS[i % CLASS_COLORS.length],
              }}
            />
          </div>
          <span className="w-8 text-right text-[11px] text-slate-500">{counts[i] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

export function PredictionBars({
  prediction,
  max = Math.max(0.0001, ...([] as number[])),
}: {
  prediction: { className: string; probability: number }[];
  max?: number;
}) {
  const m = Math.max(0.0001, ...prediction.map((p) => p.probability));
  const used = max > 0.0001 ? max : m;
  return (
    <div className="space-y-1.5">
      {prediction.map((p, i) => (
        <div key={i}>
          <div className="flex justify-between text-[11px] text-slate-600">
            <span>{p.className}</span>
            <span>{(p.probability * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded"
              style={{
                width: `${(p.probability / used) * 100}%`,
                background: CLASS_COLORS[i % CLASS_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 轻量折线图：同时画 loss（红）与 accuracy（蓝）。 */
export function MiniLineChart({
  history,
}: {
  history: { epoch: number; loss: number; acc: number }[];
}) {
  const W = 280;
  const H = 90;
  const pad = 6;
  const n = history.length;
  const maxLoss = Math.max(...history.map((h) => h.loss), 0.001);
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
  const yLoss = (v: number) => H - pad - (v / maxLoss) * (H - 2 * pad);
  const yAcc = (v: number) => H - pad - v * (H - 2 * pad);
  const lossPts = history.map((h, i) => `${x(i)},${yLoss(h.loss)}`).join(' ');
  const accPts = history.map((h, i) => `${x(i)},${yAcc(h.acc)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded border border-slate-100 bg-white">
      <polyline points={lossPts} fill="none" stroke="#ef4444" strokeWidth={1.5} />
      <polyline points={accPts} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
      <text x={pad} y={10} fontSize={9} fill="#ef4444">loss</text>
      <text x={W - 34} y={10} fontSize={9} fill="#3b82f6">acc</text>
    </svg>
  );
}

/** 训练超参的数字输入小控件。 */
export function LabeledNum({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 1,
  digits = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-slate-500">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="w-16 rounded border border-slate-300 px-1 py-0.5 text-slate-700"
      />
      {digits > 0 && <span className="text-[10px] text-gray-400">({digits}位小数)</span>}
    </label>
  );
}
