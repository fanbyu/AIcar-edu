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
  telemetry: CarTelemetry;
  setState: (s: BleState, info?: string) => void;
  setReconnecting: (ms: number | null) => void;
  setTelemetry: (t: CarTelemetry) => void;
  /** 板子上行反馈：最新一条与滚动日志（最多保留 50 条） */
  feedback: BoardMessage | null;
  feedbackLog: BoardMessage[];
  pushFeedback: (msg: BoardMessage) => void;
  clearFeedback: () => void;
  /** 仿真降级模式（不支持 Web Bluetooth 时启用） */
  simulationMode: boolean;
  setSimulationMode: (v: boolean) => void;
}

const MAX_FEEDBACK_LOG = 50;

export const useBluetoothStore = create<BluetoothStore>((set) => ({
  state: 'idle',
  deviceName: null,
  info: null,
  reconnectingIn: null,
  telemetry: { bat: 0, spd: 0, mode: 'manual', err: 0 },
  setState: (state, info) =>
    set({ state, info: info ?? null, reconnectingIn: state === 'connected' ? null : undefined }),
  setReconnecting: (reconnectingIn) => set({ reconnectingIn }),
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
}));
