// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';

/** 4x4 特征图经过 2x2 最大池化变成 2x2 的可交互演示 */
export function PoolingWidget() {
  // 4x4 输入特征图
  const input = [
    [0.2, 0.9, 0.1, 0.4],
    [0.7, 0.3, 0.8, 0.2],
    [0.5, 0.6, 0.3, 0.9],
    [0.1, 0.4, 0.7, 0.2],
  ];
  // 2x2 最大池化输出
  const output = [
    [Math.max(input[0][0], input[0][1], input[1][0], input[1][1]), Math.max(input[0][2], input[0][3], input[1][2], input[1][3])],
    [Math.max(input[2][0], input[2][1], input[3][0], input[3][1]), Math.max(input[2][2], input[2][3], input[3][2], input[3][3])],
  ];
  const [cell, setCell] = useState<[number, number] | null>(null);

  const color = (v: number) => {
    const c = Math.round(v * 255);
    return `rgb(${c},${Math.round(c * 0.7)},${Math.round(c * 0.3)})`;
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <p className="mb-3 text-xs text-slate-500">点击 2×2 输出格，高亮它来自输入图的哪个区域（最大池化）</p>
      <div className="flex flex-wrap items-center gap-4">
        {/* 输入 4x4 */}
        <div>
          <p className="mb-1 text-[11px] font-medium text-slate-400">输入 4×4</p>
          <div className="grid grid-cols-4 gap-0.5">
            {input.map((row, y) =>
              row.map((v, x) => {
                const active =
                  cell && Math.floor(cell[0] * 2) === y && Math.floor(cell[1] * 2) === x;
                return (
                  <div
                    key={`${x}-${y}`}
                    className={'h-7 w-7 rounded-sm ' + (active ? 'ring-2 ring-brand-500' : '')}
                    style={{ background: color(v) }}
                  />
                );
              })
            )}
          </div>
        </div>

        <span className="text-lg text-slate-400">→</span>

        {/* 输出 2x2 */}
        <div>
          <p className="mb-1 text-[11px] font-medium text-slate-400">输出 2×2</p>
          <div className="grid grid-cols-2 gap-1">
            {output.map((row, y) =>
              row.map((v, x) => (
                <button
                  key={`o-${x}-${y}`}
                  onClick={() => setCell([y, x])}
                  className={
                    'h-12 w-12 rounded-md text-xs font-bold text-white transition ' +
                    (cell && cell[0] === y && cell[1] === x ? 'ring-2 ring-offset-1 ring-slate-900' : '')
                  }
                  style={{ background: color(v) }}
                >
                  {v.toFixed(1)}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
