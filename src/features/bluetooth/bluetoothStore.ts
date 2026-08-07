// SPDX-License-Identifier: AGPL-3.0-or-later
import { create } from 'zustand';
import type { CarTelemetry } from './esp32Protocol';
import type { BleState } from './bleController';
import type { BoardMessage } from './microblocksProtocol';

export interface BluetoothStore {
  state: BleState;
  deviceName: string | null;
  info: string | null;
  reconnectingIn: number | null;
  /** 自动重连已达上限仍失败：提示用户手动重新扫描设备 */
  needsRescan: boolean;
  telemetry: CarTelemetry;
  setState: (s: BleState, info?: string) => void;
  setReconnecting: (ms: number | null) => void;
  setNeedsRescan: (v: boolean) => void;
  setTelemetry: (t: CarTelemetry) => void;
  /** 板子上行反馈：最新一条与滚动日志（最多保留 50 条） */
  feedback: BoardMessage | null;
  feedbackLog: BoardMessage[];
  pushFeedback: (msg: BoardMessage) => void;
  clearFeedback: () => void;
  /** 仿真降级模式（不支持 Web Bluetooth 时启用） */
  simulationMode: boolean;
  setSimulationMode: (v: boolean) => void;
  /** ===== BLE 流控调试开关（持久化到 localStorage，用于定位断连根因） ===== */
  /** 是否等待板子广播回显(ACK)才发下一条。关掉→只按 txGapMs 间隔发送。 */
  echoEnabled: boolean;
  /** 发送新运动指令前是否自动插入 S(停止) 隔离拍（复刻 F→S→B）。 */
  isolationEnabled: boolean;
  /** 是否周期性 ping 保活。 */
  keepAliveEnabled: boolean;
  /** 两条下行广播之间的最小间隔(ms)，UI 可调。 */
  txGapMs: number;
  /** 浏览器侧待发按键队列长度（运行时，不持久化）。 */
  txQueueLen: number;
  setEchoEnabled: (v: boolean) => void;
  setIsolationEnabled: (v: boolean) => void;
  setKeepAliveEnabled: (v: boolean) => void;
  setTxGapMs: (ms: number) => void;
  setTxQueueLen: (n: number) => void;
}

const MAX_FEEDBACK_LOG = 50;

/** 从 localStorage 读取布尔开关，缺省用 def。 */
function loadBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === '1';
  } catch {
    return def;
  }
}
/** 从 localStorage 读取数值，缺省用 def。 */
function loadNum(key: string, def: number): number {
  try {
    const v = localStorage.getItem(key);
    const n = v == null ? def : Number(v);
    return Number.isFinite(n) ? n : def;
  } catch {
    return def;
  }
}

export const useBluetoothStore = create<BluetoothStore>((set) => ({
  state: 'idle',
  deviceName: null,
  info: null,
  reconnectingIn: null,
  needsRescan: false,
  telemetry: { bat: 0, spd: 0, mode: 'manual', err: 0 },
  setState: (state, info) =>
    set({
      state,
      info: info ?? null,
      reconnectingIn: state === 'connected' ? null : undefined,
      needsRescan: state === 'connected' ? false : undefined,
    }),
  setReconnecting: (reconnectingIn) => set({ reconnectingIn }),
  setNeedsRescan: (needsRescan) => set({ needsRescan }),
  setTelemetry: (telemetry) => set({ telemetry }),
  feedback: null,
  feedbackLog: [],
  pushFeedback: (msg) =>
    set((s) => ({
      feedback: msg,
      feedbackLog: [...s.feedbackLog, msg].slice(-MAX_FEEDBACK_LOG),
    })),
  clearFeedback: () => set({ feedback: null, feedbackLog: [] }),
  simulationMode: false,
  setSimulationMode: (simulationMode) => set({ simulationMode }),
  echoEnabled: loadBool('aicar.echo', true),
  isolationEnabled: loadBool('aicar.iso', true),
  keepAliveEnabled: loadBool('aicar.ka', true),
  txGapMs: loadNum('aicar.gap', 60),
  txQueueLen: 0,
  setEchoEnabled: (v) => {
    try {
      localStorage.setItem('aicar.echo', v ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ echoEnabled: v });
  },
  setIsolationEnabled: (v) => {
    try {
      localStorage.setItem('aicar.iso', v ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ isolationEnabled: v });
  },
  setKeepAliveEnabled: (v) => {
    try {
      localStorage.setItem('aicar.ka', v ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ keepAliveEnabled: v });
  },
  setTxGapMs: (ms) => {
    try {
      localStorage.setItem('aicar.gap', String(ms));
    } catch {
      /* ignore */
    }
    set({ txGapMs: ms });
  },
  setTxQueueLen: (n) => set({ txQueueLen: n }),
}));
