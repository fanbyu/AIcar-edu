// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Link2, Bot, Route } from 'lucide-react';
import '@/features/code/monacoSetup';
import { runJs } from '@/features/code/jsSandbox';
import { runPython } from '@/features/code/pythonSandbox';
import { useCarSim } from '@/features/sim/useCarSim';
import { BluetoothPanel } from '@/components/shared/BluetoothPanel';
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import type { CarCommand } from '@/features/bluetooth/esp32Protocol';
import { COMMAND_LABELS } from '@/features/bluetooth/esp32Protocol';
import { Card, Chip } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const EXAMPLES_JS: Record<string, string> = {
  '数组求和': `// 计算 1..10 的和
const sum = Array.from({length:10},(_,i)=>i+1).reduce((a,b)=>a+b,0);
console.log('结果 =', sum);
return sum;`,
  'KNN 思路': `// 最近邻分类示意（欧氏距离）
const a=[1,2,3], b=[1,2,4], c=[5,5,5];
function dist(x,y){return Math.sqrt(x.reduce((s,v,i)=>s+(v-y[i])**2,0));}
console.log('a-b', dist(a,b).toFixed(2));
console.log('a-c', dist(a,c).toFixed(2));
return 'a 更接近 b';`,
  '激活函数': `function relu(x){return Math.max(0,x);}
console.log(relu(-2), relu(3));
return relu(3);`,
  '驾驶决策': `// 模拟检测框 → 指令（与拓展关决策类似）
const frameW = 320, frameH = 200;
const dets = [
  { name: 'qian', score: 0.82, cx: 160 },
  { name: 'ting', score: 0.41, cx: 90 },
];
const map = { ting:'S', zuo:'L', qian:'F', you:'R' };
const top = dets.sort((a,b)=>b.score-a.score)[0];
const cmd = map[top.name];
console.log('最高置信度', top.name, top.score);
console.log('下发指令', cmd);
return cmd;`,
};

const EXAMPLES_PY: Record<string, string> = {
  '列表求和': `# 计算 1..10 的和
s = sum(range(1, 11))
print("结果 =", s)
s`,
  'KNN 思路': `# 最近邻分类示意（欧氏距离）
import math
a=[1,2,3]; b=[1,2,4]; c=[5,5,5]
def dist(x, y): return math.sqrt(sum((v-u)**2 for v,u in zip(x,y)))
print("a-b", round(dist(a,b), 2))
print("a-c", round(dist(a,c), 2))`,
  '激活函数': `def relu(x):
    return max(0, x)
print(relu(-2), relu(3))`,
  '驾驶决策': `# 检测类名 → 小车指令
dets = [("qian", 0.82), ("ting", 0.41)]
dets.sort(key=lambda x: -x[1])
name, score = dets[0]
cmd = {"ting":"S","zuo":"L","qian":"F","you":"R"}[name]
print("最高置信度", name, score)
print("下发指令", cmd)
cmd`,
};

const PAD: { c: CarCommand; label: string }[] = [
  { c: 'LF', label: '左前' },
  { c: 'F', label: '前进' },
  { c: 'RF', label: '右前' },
  { c: 'L', label: '左转' },
  { c: 'S', label: '停止' },
  { c: 'R', label: '右转' },
  { c: 'LB', label: '左后' },
  { c: 'B', label: '后退' },
  { c: 'RB', label: '右后' },
];

export function PlaygroundPage() {
  const [lang, setLang] = useState<'js' | 'python'>('js');
  const [code, setCode] = useState(EXAMPLES_JS['数组求和']);
  const [example, setExample] = useState('数组求和');
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [linked, setLinked] = useState(false);
  const [params, setParams] = useState({ speed: 2, steer: 0.4, laneFollow: true });
  const { canvasRef, setCommand } = useCarSim(params);
  const bt = useBluetooth();

  function switchLang(next: 'js' | 'python') {
    if (next === lang) return;
    setLang(next);
    const first = next === 'js' ? Object.keys(EXAMPLES_JS)[0] : Object.keys(EXAMPLES_PY)[0];
    setExample(first);
    setCode(next === 'js' ? EXAMPLES_JS[first] : EXAMPLES_PY[first]);
  }

  async function run() {
    setRunning(true);
    setLogs(['▶ 运行中…']);
    const r = lang === 'js' ? await runJs(code) : await runPython(code);
    setRunning(false);
    const nextLogs = [
      ...(r.logs.length ? r.logs : []),
      r.error ? '✖ ' + r.error : '✔ 完成' + (r.result ? ' → ' + r.result : ''),
    ];
    setLogs(nextLogs);

    // 若返回值是合法驾驶指令，一键驱动仿真（可再经「同步真车」下发）
    const maybe = String(r.result || '').trim().toUpperCase();
    if (!r.error && (['F', 'B', 'L', 'R', 'S', 'LF', 'RF', 'LB', 'RB', 'TL', 'TR'] as string[]).includes(maybe)) {
      drive(maybe as CarCommand);
      setLogs((prev) => [...prev, `🚗 已将返回值「${maybe}」发给仿真`]);
    }
  }

  function drive(c: CarCommand) {
    setCommand(c);
    if (linked && bt.state === 'connected') {
      bt.send(c);
    }
  }

  return (
    <div className="container-page py-10">
      <Chip className="w-fit bg-brand-100 text-brand-700">在线编程与模拟仿真</Chip>
      <h1 className="mt-2 section-title">写代码 · 跑仿真 · 连真车</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        左侧用 JavaScript / Python 做课堂小实验；右侧 Canvas 演示小车运动。打开「同步真车」并连接蓝牙后，方向指令走与教学页相同的全局 BLE 流控（串行写 / 硬换向隔离 / 约 90ms 间隔）。
        积木编程请用导航栏「在线编程」打开 MicroBlocks。
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-800">代码编辑器</h2>
              <div className="flex rounded-lg border border-slate-200 p-0.5">
                {(['js', 'python'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => switchLang(l)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-xs font-medium transition',
                      lang === l ? 'bg-brand-500 text-white' : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    {l === 'js' ? 'JavaScript' : 'Python'}
                  </button>
                ))}
              </div>
            </div>
            <select
              value={example}
              onChange={(e) => {
                const k = e.target.value;
                setExample(k);
                setCode(lang === 'js' ? EXAMPLES_JS[k] : EXAMPLES_PY[k]);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
            >
              {Object.keys(lang === 'js' ? EXAMPLES_JS : EXAMPLES_PY).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <Editor
              height="240px"
              language={lang === 'js' ? 'javascript' : 'python'}
              theme="light"
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
          <Button className="mt-3 w-full" onClick={run} disabled={running}>
            <Play className="h-4 w-4" /> {running ? '运行中…' : '运行代码'}
          </Button>
          <pre className="mt-3 h-28 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-emerald-300">
            {logs.join('\n') || '输出将显示在这里（Python 首次运行会加载本地 Pyodide）'}
          </pre>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800">小车行为仿真（Canvas）</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={params.laneFollow}
                  onChange={(e) => setParams((p) => ({ ...p, laneFollow: e.target.checked }))}
                  className="accent-brand-500"
                />
                <Route className="h-3.5 w-3.5" /> 自动循迹
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={linked}
                  onChange={(e) => setLinked(e.target.checked)}
                  className="accent-brand-500"
                />
                <Link2 className="h-3.5 w-3.5" /> 同步真车
              </label>
            </div>
          </div>
          <canvas ref={canvasRef} width={480} height={280} className="mt-3 w-full rounded-xl border border-slate-200" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {PAD.map(({ c, label }) => (
              <button
                key={c}
                type="button"
                onClick={() => drive(c)}
                className="rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 active:scale-95"
                title={COMMAND_LABELS[c]}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-600">
              速度 {params.speed}
              <input
                type="range"
                min={1}
                max={5}
                step={0.5}
                value={params.speed}
                onChange={(e) => setParams((p) => ({ ...p, speed: Number(e.target.value) }))}
                className="w-full accent-brand-500"
              />
            </label>
            <label className="text-xs text-slate-600">
              转向灵敏度 {params.steer}
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.1}
                value={params.steer}
                onChange={(e) => setParams((p) => ({ ...p, steer: Number(e.target.value) }))}
                className="w-full accent-brand-500"
              />
            </label>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BluetoothPanel />
        <Card className={cn('flex items-center gap-3', linked && bt.state === 'connected' && 'border-emerald-300')}>
          <Bot className="h-6 w-6 shrink-0 text-brand-500" />
          <div className="text-sm text-slate-600">
            {linked
              ? bt.state === 'connected'
                ? '同步真车已开启：仿真方向指令会经蓝牙下发给实物小车。'
                : '已勾选「同步真车」：请先在左侧面板连接小车，再点方向键。'
              : '未开启同步真车：指令只驱动右侧 Canvas。自动循迹可单独开关。'}
          </div>
        </Card>
      </div>
    </div>
  );
}
