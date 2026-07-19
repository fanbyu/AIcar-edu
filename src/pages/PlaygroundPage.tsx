// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Square, Link2, Bot } from 'lucide-react';
import '@/features/code/monacoSetup';
import { runJs } from '@/features/code/jsSandbox';
import { runPython } from '@/features/code/pythonSandbox';
import { useCarSim } from '@/features/sim/useCarSim';
import { BluetoothPanel } from '@/components/shared/BluetoothPanel';
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import { Card, Chip } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const EXAMPLES_JS: Record<string, string> = {
  '数组求和': `// 计算 1..10 的和\nconst sum = Array.from({length:10},(_,i)=>i+1).reduce((a,b)=>a+b,0);\nconsole.log('结果 =', sum);\nreturn sum;`,
  'KNN 思路': `// 最近邻分类示意（欧氏距离）\nconst a=[1,2,3], b=[1,2,4], c=[5,5,5];\nfunction dist(x,y){return Math.sqrt(x.reduce((s,v,i)=>s+(v-y[i])**2,0));}\nconsole.log('a-b', dist(a,b).toFixed(2));\nconsole.log('a-c', dist(a,c).toFixed(2));\nreturn 'a 更接近 b';`,
  '激活函数': `function relu(x){return Math.max(0,x);}\nconsole.log(relu(-2), relu(3));\nreturn relu(3);`,
};

const EXAMPLES_PY: Record<string, string> = {
  '列表求和': `# 计算 1..10 的和\ns = sum(range(1, 11))\nprint("结果 =", s)\ns`,
  'KNN 思路': `# 最近邻分类示意（欧氏距离）\nimport math\na=[1,2,3]; b=[1,2,4]; c=[5,5,5]\ndef dist(x, y): return math.sqrt(sum((v-u)**2 for v,u in zip(x,y)))\nprint("a-b", round(dist(a,b), 2))\nprint("a-c", round(dist(a,c), 2))`,
  '激活函数': `def relu(x):\n    return max(0, x)\nprint(relu(-2), relu(3))`,
};

const COMMANDS = [
  { c: 'F', label: '前进' },
  { c: 'L', label: '左转' },
  { c: 'R', label: '右转' },
  { c: 'S', label: '停止' },
] as const;

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
    setLogs([
      ...(r.logs.length ? r.logs : []),
      r.error ? '✖ ' + r.error : '✔ 完成' + (r.result ? ' → ' + r.result : ''),
    ]);
  }

  function drive(c: 'F' | 'L' | 'R' | 'S') {
    setCommand(c);
    if (linked && bt.state === 'connected') bt.send(c, 120);
  }

  return (
    <div className="container-page py-10">
      <Chip className="w-fit bg-brand-100 text-brand-700">在线编程与模拟仿真</Chip>
      <h1 className="mt-2 section-title">写代码 · 跑仿真 · 连真车</h1>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* 代码区 */}
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-slate-800">代码编辑器</h2>
              <div className="flex rounded-lg border border-slate-200 p-0.5">
                {(['js', 'python'] as const).map((l) => (
                  <button
                    key={l}
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
              height="220px"
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
            {logs.join('\n') || '输出将显示在这里'}
          </pre>
        </Card>

        {/* 仿真区 */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">小车行为仿真（Canvas）</h2>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={linked}
                onChange={(e) => setLinked(e.target.checked)}
                className="accent-brand-500"
              />
              <Link2 className="h-3.5 w-3.5" /> 模型联动
            </label>
          </div>
          <canvas ref={canvasRef} width={320} height={200} className="mt-3 w-full rounded-xl" />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {COMMANDS.map(({ c, label }) => (
              <button
                key={c}
                onClick={() => drive(c)}
                className="rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 active:scale-95"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-600">
              速度 {params.speed}
              <input type="range" min={1} max={5} step={0.5} value={params.speed}
                onChange={(e) => setParams((p) => ({ ...p, speed: Number(e.target.value) }))}
                className="w-full accent-brand-500" />
            </label>
            <label className="text-xs text-slate-600">
              转向灵敏度 {params.steer}
              <input type="range" min={0.1} max={1} step={0.1} value={params.steer}
                onChange={(e) => setParams((p) => ({ ...p, steer: Number(e.target.value) }))}
                className="w-full accent-brand-500" />
            </label>
          </div>
        </Card>
      </div>

      {/* 蓝牙 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BluetoothPanel />
        <Card className={cn('flex items-center gap-3', linked && bt.state === 'connected' && 'border-emerald-300')}>
          <Bot className="h-6 w-6 text-brand-500" />
          <div className="text-sm text-slate-600">
            {linked
              ? bt.state === 'connected'
                ? '模型联动已开启：仿真指令会同步下发给真实小车。'
                : '开启「模型联动」并连接小车后，指令将同步下发。'
              : '未开启模型联动：仿真仅在 Canvas 中演示。'}
          </div>
        </Card>
      </div>
    </div>
  );
}
