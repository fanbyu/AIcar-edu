// SPDX-License-Identifier: AGPL-3.0-or-later
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import { COMMAND_LABELS, type CarCommand } from '@/features/bluetooth/esp32Protocol';
import { describeBoardMessage } from '@/features/bluetooth/microblocksProtocol';
import { Button } from '@/components/ui/Button';
import { Wifi, WifiOff, Bluetooth, RotateCw, BatteryCharging, Square, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

// 九宫格方向键（3×3）：8 个方向 + 中央停止；下方另有两个原地转向按钮 TL/TR。
// 固件为 MicroBlocks 广播协议，接收广播 F/B/L/R/RF/RB/LF/LB + S + TL + TR。
const PAD_LAYOUT: CarCommand[] = [
  'LF', 'F', 'RF',
  'L', 'S', 'R',
  'LB', 'B', 'RB',
];

const stateMeta: Record<string, { label: string; dot: string; text: string }> = {
  idle: { label: '未连接', dot: 'bg-slate-300', text: 'text-slate-500' },
  scanning: { label: '扫描中…', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-600' },
  connecting: { label: '连接中…', dot: 'bg-cyan-400 animate-pulse', text: 'text-cyan-600' },
  connected: { label: '已连接', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  disconnected: { label: '已断开', dot: 'bg-rose-400', text: 'text-rose-600' },
  error: { label: '不可用', dot: 'bg-rose-500', text: 'text-rose-600' },
};

/**
 * BluetoothPanel：扫描 / 连接 / 指令 / 遥测 UI。
 * 集成进教学实操区与仿真页「连接真实小车」开关。
 */
export function BluetoothPanel({ compact = false }: { compact?: boolean }) {
  const bt = useBluetooth();
  const meta = stateMeta[bt.state] ?? stateMeta.idle;

  if (bt.simulationMode && bt.state === 'error') {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        <div className="flex items-center gap-2 font-semibold text-slate-700">
          <WifiOff className="h-4 w-4" /> 仿真模式（无 Web Bluetooth）
        </div>
        <p className="mt-2">
          当前浏览器不支持 Web Bluetooth（需 Chrome / Edge 且 HTTPS）。
          已自动切换为 Canvas 仿真，教学流程不受影响。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <Bluetooth className="h-4 w-4 text-brand-500" /> 真实小车连接
        </div>
        <div className={cn('flex items-center gap-1.5 text-xs', meta.text)}>
          <span className={cn('h-2.5 w-2.5 rounded-full', meta.dot)} />
          {meta.label}
          {bt.reconnectingIn != null && (
            <span className="text-amber-600">· {Math.round(bt.reconnectingIn / 1000)}s 后重连</span>
          )}
        </div>
      </div>

      {bt.info && <p className="mt-1 text-xs text-slate-500">{bt.info}</p>}

      {bt.needsRescan && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          自动重连多次失败，请点击「扫描并连接」重新选择设备。
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {bt.state === 'connected' ? (
          <Button variant="ghost" size="sm" onClick={bt.disconnect}>
            <WifiOff className="h-3.5 w-3.5" /> 断开
          </Button>
        ) : (
          <Button size="sm" onClick={bt.scanAndConnect} disabled={bt.state === 'scanning'}>
            <Bluetooth className="h-3.5 w-3.5" /> 扫描并连接
          </Button>
        )}
        {(bt.state === 'disconnected' || bt.state === 'error') && (
          <Button variant="ghost" size="sm" onClick={bt.reconnect}>
            <RotateCw className="h-3.5 w-3.5" /> 一键重连
          </Button>
        )}
      </div>

      {bt.state === 'connected' && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {PAD_LAYOUT.map((c) => (
              <button
                key={c}
                onClick={() => bt.send(c)}
                className={cn(
                  'rounded-xl border py-2 text-sm font-semibold transition hover:-translate-y-0.5 active:scale-95',
                  c === 'S'
                    ? 'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50',
                )}
              >
                {COMMAND_LABELS[c]}
              </button>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['TL', 'TR'] as CarCommand[]).map((c) => (
              <button
                key={c}
                onClick={() => bt.send(c)}
                className="rounded-xl border border-indigo-200 bg-indigo-50 py-2 text-sm font-semibold text-indigo-700 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-100 active:scale-95"
              >
                {COMMAND_LABELS[c]}
              </button>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={bt.stopAll} className="text-rose-600">
              <Square className="h-3.5 w-3.5" /> 全部停止
            </Button>
            <Button variant="ghost" size="sm" onClick={bt.ping}>
              <Activity className="h-3.5 w-3.5" /> 心跳
            </Button>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <BatteryCharging className="h-3.5 w-3.5 text-emerald-500" />
              电量 {bt.telemetry.bat}%
            </span>
            <span>速度 {bt.telemetry.spd}</span>
            <span>模式 {bt.telemetry.mode === 'auto' ? '自动' : '手动'}</span>
            <span className={cn(bt.telemetry.err ? 'text-rose-500' : 'text-slate-400')}>
              错误码 {bt.telemetry.err}
            </span>
          </div>

          {/* 流控调试面板：逐项开关 + 间隔滑杆 + 待发队列，用于定位断连根因 */}
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700">流控调试</span>
              {bt.txQueueLen > 0 && (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  待发队列 {bt.txQueueLen}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <DebugToggle label="回显 ACK" checked={bt.echoEnabled} onChange={bt.setEchoEnabled} />
              <DebugToggle label="切换隔离拍" checked={bt.isolationEnabled} onChange={bt.setIsolationEnabled} />
              <DebugToggle label="心跳保活" checked={bt.keepAliveEnabled} onChange={bt.setKeepAliveEnabled} />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-700">
              <span className="shrink-0">发送间隔</span>
              <input
                type="range"
                min={20}
                max={500}
                step={10}
                value={bt.txGapMs}
                onChange={(e) => bt.setTxGapMs(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              <span className="w-12 shrink-0 text-right tabular-nums">{bt.txGapMs}ms</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-amber-600">
              排查断连：先把「回显 / 隔离拍 / 心跳」全关，间隔调到 200ms 试。若稳定，再逐项打开定位元凶。
            </p>
          </div>

          <FeedbackBox />
        </>
      )}

      {compact && bt.deviceName && (
        <p className="mt-2 text-xs text-slate-400">设备：{bt.deviceName}</p>
      )}
    </div>
  );
}

const statusStyle: Record<string, { dot: string; text: string; label: string }> = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: '成功' },
  error: { dot: 'bg-rose-500', text: 'text-rose-600', label: '失败' },
  info: { dot: 'bg-slate-300', text: 'text-slate-500', label: '信息' },
};

function fmtTime(t: number): string {
  const d = new Date(t);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

/** 调试用开关：标签 + 小开关，点击切换。 */
function DebugToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition',
        checked
          ? 'border-amber-300 bg-amber-100 text-amber-800'
          : 'border-slate-200 bg-white text-slate-500',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'relative h-3.5 w-6 rounded-full transition',
          checked ? 'bg-amber-500' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition',
            checked ? 'left-3' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

/** 执行反馈面板：展示板子上行消息（任务启动/完成/输出/错误等）。 */
function FeedbackBox() {
  const { feedback, feedbackLog, clearFeedback } = useBluetooth();
  const st = statusStyle[feedback?.status ?? 'info'];

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">执行反馈（小车 → IDE）</span>
        <button
          onClick={clearFeedback}
          className="text-[11px] text-slate-400 hover:text-slate-600"
        >
          清空
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className={cn('h-2.5 w-2.5 rounded-full', st.dot)} />
        <span className={cn('font-semibold', st.text)}>
          {feedback ? st.label : '暂无'}
        </span>
        {feedback && (
          <span className="truncate text-slate-500">
            {describeBoardMessage(feedback)}
          </span>
        )}
      </div>

      <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg bg-white/70 p-2 font-mono text-[11px] text-slate-500">
        {feedbackLog.length === 0 && <p className="text-slate-400">尚未收到小车反馈…</p>}
        {[...feedbackLog].reverse().map((m, i) => {
          const s = statusStyle[m.status];
          return (
            <div key={feedbackLog.length - i} className="flex items-start gap-2">
              <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
              <span className="shrink-0 text-slate-300">{fmtTime(m.time)}</span>
              <span className="truncate">
                [{m.opName}] {describeBoardMessage(m)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
