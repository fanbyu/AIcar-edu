// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 蓝牙通信协议（公开骨架 / 占位）
 *
 * 说明：真实的 ESP32 固件通信契约（Nordic UART Service 的自定义 UUID 覆写、
 * 命令字符、文本/JSON 帧格式、标签广播与遥测字段语义等）属于未公开内容，
 * 不在本公开仓库中。
 *
 * 本地开发如需连接真实小车：在同目录放置 `esp32Protocol.local.ts`
 * （该文件已被 .gitignore 忽略，不会进入公开仓库）。其导出需与本文件签名一致，
 * 运行时将通过 Vite 的 import.meta.glob 被优先采用。
 *
 * 发布到公开环境时：构建前临时将该私有文件移出（如改名 .bak），
 * 产物中将仅含下方占位骨架、不含真实协议；构建完成后再还原。
 */

const localMods = import.meta.glob('./esp32Protocol.local.ts', { eager: true });
const local: Record<string, any> =
  (localMods as Record<string, any>)['./esp32Protocol.local.ts'] ?? {};

// 若本地私有协议未提供某导出，则使用以下占位（不含真实固件契约）。
const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';

export const NUS_SERVICE = (local.NUS_SERVICE as string) ?? PLACEHOLDER_UUID;
export const NUS_TX_CHAR = (local.NUS_TX_CHAR as string) ?? PLACEHOLDER_UUID;
export const NUS_RX_CHAR = (local.NUS_RX_CHAR as string) ?? PLACEHOLDER_UUID;

/** 指令：前进/左转/右转/停止（占位骨架，真实字符见私有协议） */
export type CarCommand = 'F' | 'L' | 'R' | 'S';

export interface CarTelemetry {
  bat: number;
  spd: number;
  mode: 'manual' | 'auto';
  err: number;
}

export function encodeCommand(cmd: CarCommand, speed?: number): string {
  if (local.encodeCommand) return local.encodeCommand(cmd, speed);
  // 占位：仅示意，不含真实帧格式
  return `${cmd}\n`;
}

export function encodeCommandJson(cmd: CarCommand, speed?: number): string {
  if (local.encodeCommandJson) return local.encodeCommandJson(cmd, speed);
  return JSON.stringify({ cmd, spd: speed ?? 0 }) + '\n';
}

export function encodeLabel(label: string, score?: number): string {
  if (local.encodeLabel) return local.encodeLabel(label, score);
  // 占位：不含真实广播前缀
  return `${label}\n`;
}

export function driveCommandToLabel(cmd: CarCommand): 'Forward' | 'Left' | 'Right' | 'Stop' {
  if (local.driveCommandToLabel) return local.driveCommandToLabel(cmd);
  return cmd === 'F' ? 'Forward' : cmd === 'L' ? 'Left' : cmd === 'R' ? 'Right' : 'Stop';
}

export function carClassToEn(zh: string): string {
  if (local.carClassToEn) return local.carClassToEn(zh);
  return zh === '前进' ? 'Forward' : zh === '左' ? 'Left' : zh === '右' ? 'Right' : zh === '停' ? 'Stop' : zh;
}

export function decodeTelemetry(raw: string): CarTelemetry | null {
  if (local.decodeTelemetry) return local.decodeTelemetry(raw);
  // 占位：真实解析逻辑见私有协议
  return null;
}

export const COMMAND_LABELS: Record<CarCommand, string> = local.COMMAND_LABELS ?? {
  F: '前进',
  L: '左转',
  R: '右转',
  S: '停止',
};
