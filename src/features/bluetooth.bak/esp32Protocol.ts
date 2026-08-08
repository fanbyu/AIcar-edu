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

/**
 * 真实小车运行 MicroBlocks BLE 固件（串口透传）。GATT 拓扑（与官方参考页一致）：
 *   - 服务:   bb37a001-b922-4018-8e74-e14824b3a638          (MicroBlocks BLE service)
 *   - 写特征: bb37a002-b922-4018-8e74-e14824b3a638          (板子接收，主机写)
 *   - 读特征: bb37a003-b922-4018-8e74-e14824b3a638          (板子上送，主机 notify)
 * 下行指令统一封装为 MicroBlocks 广播帧（0x1B 长消息），广播名为单词：
 *   go / left / right / stop / back / kick
 */
export const MICROBLOCKS_SERVICE =
  (local.MICROBLOCKS_SERVICE as string) ?? 'bb37a001-b922-4018-8e74-e14824b3a638';
export const MICROBLOCKS_RX_CHAR =
  (local.MICROBLOCKS_RX_CHAR as string) ?? 'bb37a002-b922-4018-8e74-e14824b3a638';
export const MICROBLOCKS_TX_CHAR =
  (local.MICROBLOCKS_TX_CHAR as string) ?? 'bb37a003-b922-4018-8e74-e14824b3a638';

// 向后兼容别名：NUS_TX_CHAR 为主机写目标（=板子 RX），NUS_RX_CHAR 为主机读源（=板子 TX）
export const NUS_SERVICE = MICROBLOCKS_SERVICE;
export const NUS_TX_CHAR = MICROBLOCKS_RX_CHAR;
export const NUS_RX_CHAR = MICROBLOCKS_TX_CHAR;

/** 指令：8 方向 + 停止 + 原地左转/右转（内部枚举；实际下发的字符即广播名）。 */
export type CarCommand = 'F' | 'B' | 'L' | 'R' | 'RF' | 'RB' | 'LF' | 'LB' | 'S' | 'TL' | 'TR';

/**
 * 把内部指令映射为下发给板子的广播名（MicroBlocks `when I receive` 监听的单词）。
 * 占位：MicroBlocks 原生仅 go/left/right/stop/back/kick，对角线方向用组合单词；
 * 真实广播名请在 esp32Protocol.local.ts 覆写。
 */
export function driveBroadcast(cmd: CarCommand): string {
  if (local.driveBroadcast) return local.driveBroadcast(cmd);
  switch (cmd) {
    case 'F': return 'go';
    case 'B': return 'back';
    case 'L': return 'left';
    case 'R': return 'right';
    case 'LF': return 'forwardleft';
    case 'RF': return 'forwardright';
    case 'LB': return 'backleft';
    case 'RB': return 'backright';
    default: return 'stop';
  }
}

export interface CarTelemetry {
  bat: number;
  spd: number;
  mode: 'manual' | 'auto';
  err: number;
}

export function encodeCommand(cmd: CarCommand, speed?: number): string {
  if (local.encodeCommand) return local.encodeCommand(cmd, speed);
  // 占位：仅示意，不含真实帧格式（下发字符 + 换行）
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

export function driveCommandToLabel(cmd: CarCommand): string {
  if (local.driveCommandToLabel) return local.driveCommandToLabel(cmd);
  const map: Record<CarCommand, string> = {
    F: 'Forward', B: 'Backward', L: 'Left', R: 'Right',
    LF: 'Forward-Left', RF: 'Forward-Right', LB: 'Back-Left', RB: 'Back-Right', S: 'Stop',
    TL: 'Turn-Left', TR: 'Turn-Right',
  };
  return map[cmd];
}

export function carClassToEn(zh: string): string {
  if (local.carClassToEn) return local.carClassToEn(zh);
  const map: Record<string, string> = {
    '前进': 'Forward', '后退': 'Backward', '左': 'Left', '右': 'Right',
    '左前': 'Forward-Left', '右前': 'Forward-Right', '左后': 'Back-Left', '右后': 'Back-Right',
    '停': 'Stop',
  };
  return map[zh] ?? zh;
}

export function decodeTelemetry(raw: string): CarTelemetry | null {
  if (local.decodeTelemetry) return local.decodeTelemetry(raw);
  // 占位：真实解析逻辑见私有协议
  return null;
}

export const COMMAND_LABELS: Record<CarCommand, string> = local.COMMAND_LABELS ?? {
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
