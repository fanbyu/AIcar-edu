// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CarCommand } from './esp32Protocol';

/**
 * 各教学页「实时推理 → 控车」统一节拍。
 * 底层 bleController 已做串行写 / 硬换向隔离 / 队列合并；页面只需统一推理周期 + 指令变化才发。
 */
export const LIVE_INFER_MS = 250;

/** 循迹等 rAF 高频环的页面侧最短下发间隔 */
export const PAGE_CMD_MIN_MS = 120;

/**
 * 指令变化门闩：相同指令不重复发，换令立即发。
 * KNN / MLP / CNN / YOLO / 循迹 / 仿真联动共用，避免每页各自一套节奏。
 */
export class DriveCommandGate {
  private last: CarCommand | null = null;
  private lastAt = 0;

  get lastCommand(): CarCommand | null {
    return this.last;
  }

  reset() {
    this.last = null;
    this.lastAt = 0;
  }

  /**
   * @param minIntervalMs 最短下发间隔（默认 0=不限制）。同指令或换令都受此间隔保护，
   *   防止过快刷屏（实时推理可传一个小值如 80ms，配合固件串行写）。
   * @param replayMs 同指令重发间隔（默认 0=不重发）。仅当 !alwaysResend 时生效。
   *   小车固件需要【持续】的运动广播才保持运动；稳定状态（如无障碍持续前进）每帧发
   *   相同指令，若完全不重发，固件收不到后续指令即停。
   * @param alwaysResend 实时推理场景建议传 true：相同指令也每帧重发（仅受 minIntervalMs
   *   保护）。这是因为实时推理帧节奏本身就是下发节奏（受 MLP 推理耗时自然限流），
   *   不应再被「同指令跳过」逻辑掐断，否则会出现间歇性断流、小车一顿一顿。
   * @returns 是否已调用 send
   */
  trySend(
    cmd: CarCommand,
    send: (c: CarCommand) => void | Promise<void>,
    minIntervalMs = 0,
    replayMs = 0,
    alwaysResend = false
  ): boolean {
    const now = Date.now();
    if (cmd === this.last && !alwaysResend) {
      // 同指令：超过 replayMs 则重发（维持运动），否则跳过
      if (replayMs > 0 && now - this.lastAt >= replayMs) {
        this.lastAt = now;
        void send(cmd);
        return true;
      }
      return false;
    }
    if (minIntervalMs > 0 && now - this.lastAt < minIntervalMs) return false;
    this.last = cmd;
    this.lastAt = now;
    void send(cmd);
    return true;
  }
}
