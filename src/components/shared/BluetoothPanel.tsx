// SPDX-License-Identifier: AGPL-3.0-or-later
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import { COMMAND_LABELS, type CarCommand } from '@/features/bluetooth/esp32Protocol';
import { Button } from '@/components/ui/Button';
import { Wifi, WifiOff, Bluetooth, RotateCw, BatteryCharging } from 'lucide-react';
import { cn } from '@/lib/utils';

const COMMANDS: CarCommand[] = ['F', 'L', 'R', 'S'];

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
          <div className="mt-3 grid grid-cols-4 gap-2">
            {COMMANDS.map((c) => (
              <button
                key={c}
                onClick={() => bt.send(c, 120)}
                className="rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 active:scale-95"
              >
                {COMMAND_LABELS[c]}
              </button>
            ))}
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
        </>
      )}

      {compact && bt.deviceName && (
        <p className="mt-2 text-xs text-slate-400">设备：{bt.deviceName}</p>
      )}
    </div>
  );
}
