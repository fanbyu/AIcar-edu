// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * ESP32 BLE UART 协议契约（私有 / 本地）—— 不在公开仓库中。
 * 与 src/features/bluetooth/esp32Protocol.ts 的公开占位版导出签名保持一致，
 * 运行时由公开版通过 import.meta.glob 优先采用。
 *
 * 匹配 Nordic UART Service / NUS 固件。
 */
export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_TX_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Web -> ESP32 (write)
export const NUS_RX_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // ESP32 -> Web (notify)

/** 指令：前进/左转/右转/停止 + 原地左转/右转 */
export type CarCommand = 'F' | 'B' | 'L' | 'R' | 'RF' | 'RB' | 'LF' | 'LB' | 'S' | 'TL' | 'TR';

export interface CarTelemetry {
  bat: number; // 电量百分比 0-100
  spd: number; // 速度（任意单位）
  mode: 'manual' | 'auto';
  err: number; // 错误码，0 表示正常
}

/** 编码指令为文本行协议（以 \n 结尾），支持带速度 */
export function encodeCommand(cmd: CarCommand, speed?: number): string {
  if (typeof speed === 'number') return `${cmd},${Math.round(speed)}\n`;
  return `${cmd}\n`;
}

/** 编码为 JSON（扩展格式，固件可二选一支持） */
export function encodeCommandJson(cmd: CarCommand, speed?: number): string {
  return JSON.stringify({ cmd, spd: speed ?? 0 }) + '\n';
}

/**
 * 编码「检测标签广播」：当前帧优先级最高的分类标签（供 ESP32 实时读取场景类别）。
 * 格式：LBL:<中文标签>|<置信度百分比>\n
 * 例：LBL:人|88\n  ；无目标时 LBL:none\n
 */
export function encodeLabel(label: string, score?: number): string {
  const body = typeof score === 'number' ? `${label}|${Math.round(score * 100)}` : label;
  return `LBL:${body}\n`;
}

/** 驾驶指令 → 英文四分类标签（用于 BLE 广播：Forward/Left/Right/Stop） */
export function driveCommandToLabel(cmd: CarCommand): 'Forward' | 'Left' | 'Right' | 'Stop' {
  return cmd === 'F' ? 'Forward' : cmd === 'L' ? 'Left' : cmd === 'R' ? 'Right' : 'Stop';
}

/** 中文四分类（前进/左/右/停）→ 英文标签（用于 BLE 广播） */
export function carClassToEn(zh: string): string {
  return zh === '前进' ? 'Forward' : zh === '左' ? 'Left' : zh === '右' ? 'Right' : zh === '停' ? 'Stop' : zh;
}

function parseTextTelemetry(raw: string): CarTelemetry | null {
  const out: Partial<CarTelemetry> = {};
  for (const part of raw.split('|')) {
    const [k, v] = part.split(':');
    if (k === 'BAT') out.bat = Number(v);
    else if (k === 'SPEED') out.spd = Number(v);
    else if (k === 'MODE') out.mode = v === 'AUTO' ? 'auto' : 'manual';
    else if (k === 'ERR') out.err = Number(v);
  }
  if (out.bat === undefined) return null;
  return {
    bat: out.bat ?? 0,
    spd: out.spd ?? 0,
    mode: out.mode ?? 'manual',
    err: out.err ?? 0,
  };
}

function parseJsonTelemetry(raw: string): CarTelemetry | null {
  try {
    const o = JSON.parse(raw);
    return {
      bat: Number(o.bat) || 0,
      spd: Number(o.spd) || 0,
      mode: o.mode === 'auto' ? 'auto' : 'manual',
      err: Number(o.err) || 0,
    };
  } catch {
    return null;
  }
}

/** 解码 ESP32 上行遥测（自动兼容文本 / JSON 两种格式） */
export function decodeTelemetry(raw: string): CarTelemetry | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return parseJsonTelemetry(trimmed);
  return parseTextTelemetry(trimmed);
}

export const COMMAND_LABELS: Record<CarCommand, string> = {
  F: '前进',
  B: '后退',
  L: '左移',
  R: '右移',
  RF: '右前',
  RB: '右后',
  LF: '左前',
  LB: '左后',
  S: '停止',
  TL: '左转',
  TR: '右转',
};
