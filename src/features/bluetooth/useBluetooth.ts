// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useCallback } from 'react';
import { BleController, type BleState } from './bleController';
import { useBluetoothStore } from './bluetoothStore';
import type { CarCommand } from './esp32Protocol';

/**
 * 连接状态机 Hook：封装 BleController 生命周期，与 bluetoothStore 联动。
 * 状态机：idle -> scanning -> connecting -> connected（失败 error / 断开 disconnected）。
 */
export function useBluetooth() {
  const controllerRef = useRef<BleController | null>(null);
  const store = useBluetoothStore();

  useEffect(() => {
    const controller = new BleController({
      onState: (s: BleState, info?: string) => store.setState(s, info),
      onTelemetry: (t) => store.setTelemetry(t),
      onReconnecting: (ms) => store.setReconnecting(ms),
    });
    controllerRef.current = controller;

    if (!controller.isSupported) {
      store.setSimulationMode(true);
      store.setState('error', '当前浏览器不支持 Web Bluetooth，已切换仿真模式');
    }
    return () => {
      controller.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanAndConnect = useCallback(() => {
    controllerRef.current?.scanAndConnect();
  }, []);

  const reconnect = useCallback(() => {
    controllerRef.current?.reconnectLast();
  }, []);

  const disconnect = useCallback(() => {
    controllerRef.current?.disconnect();
    store.setReconnecting(null);
  }, [store]);

  const send = useCallback(
    (cmd: CarCommand, speed?: number) => {
      controllerRef.current?.send(cmd, speed);
    },
    []
  );

  /** 发送任意文本（如检测标签广播） */
  const sendText = useCallback((text: string) => {
    controllerRef.current?.sendText(text);
  }, []);

  return {
    ...store,
    isSupported: controllerRef.current?.isSupported ?? false,
    scanAndConnect,
    reconnect,
    disconnect,
    send,
    sendText,
  };
}
