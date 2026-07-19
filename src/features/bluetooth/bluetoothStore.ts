// SPDX-License-Identifier: AGPL-3.0-or-later
import { create } from 'zustand';
import type { CarTelemetry } from './esp32Protocol';
import type { BleState } from './bleController';

export interface BluetoothStore {
  state: BleState;
  deviceName: string | null;
  info: string | null;
  reconnectingIn: number | null;
  telemetry: CarTelemetry;
  setState: (s: BleState, info?: string) => void;
  setReconnecting: (ms: number | null) => void;
  setTelemetry: (t: CarTelemetry) => void;
  /** 仿真降级模式（不支持 Web Bluetooth 时启用） */
  simulationMode: boolean;
  setSimulationMode: (v: boolean) => void;
}

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
  simulationMode: false,
  setSimulationMode: (simulationMode) => set({ simulationMode }),
}));
