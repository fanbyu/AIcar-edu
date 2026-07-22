// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useCallback } from 'react';
import { BleController, type BleState } from './bleController';
import { useBluetoothStore } from './bluetoothStore';
import type { CarCommand } from './esp32Protocol';
import type { BoardMessage } from './microblocksProtocol';

/**
 * 模块级单例：整个应用共享【同一个】BLE 连接。
 *
 * 历史坑：之前每个调用 useBluetooth() 的组件都 `new BleController()`，
 * 于是 BluetoothPanel 与 KnnTrainer 各持一个 controller 实例，却共享同一个全局 store。
 * 连接建立在 Panel 的实例上，而推理发送走 KnnTrainer 的实例（txChar 为空），
 * 一发指令就 onState('error') 污染全局 store，使 UI 误报「断开」，逼用户重连。
 * 单例化后，所有组件连/发都走同一个连接，与参考页（单一连接 + 串行写）一致。
 */
let controllerSingleton: BleController | null = null;
let initialized = false;

function getController(): BleController {
  if (!controllerSingleton) {
    controllerSingleton = new BleController({
      onState: (s: BleState, info?: string) => useBluetoothStore.getState().setState(s, info),
      onTelemetry: (t) => useBluetoothStore.getState().setTelemetry(t),
      onReconnecting: (ms) => useBluetoothStore.getState().setReconnecting(ms),
      onFeedback: (msg: BoardMessage) => useBluetoothStore.getState().pushFeedback(msg),
    });
  }
  return controllerSingleton;
}

export function useBluetooth() {
  const store = useBluetoothStore();

  useEffect(() => {
    const c = getController();
    if (!initialized) {
      initialized = true;
      if (!c.isSupported) {
        useBluetoothStore.getState().setSimulationMode(true);
        useBluetoothStore.getState().setState('error', '当前浏览器不支持 Web Bluetooth，已切换仿真模式');
      }
    }
    // 单例不随组件卸载而断开：否则任一组件卸载都会把全局连接断掉。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanAndConnect = useCallback(() => getController().scanAndConnect(), []);
  const reconnect = useCallback(() => getController().reconnectLast(), []);
  const disconnect = useCallback(() => {
    getController().disconnect();
    useBluetoothStore.getState().setReconnecting(null);
  }, []);
  const send = useCallback(
    (cmd: CarCommand, speed?: number) => getController().send(cmd, speed),
    []
  );
  /** 发送任意文本（如检测标签广播） */
  const sendText = useCallback((text: string) => getController().sendText(text), []);
  /** 停止板子全部任务（紧急停车） */
  const stopAll = useCallback(() => getController().stopAll(), []);
  /** 启动板子全部任务 */
  const startAll = useCallback(() => getController().startAll(), []);
  /** 心跳探测 */
  const ping = useCallback(() => getController().ping(), []);

  return {
    ...store,
    isSupported: getController().isSupported,
    scanAndConnect,
    reconnect,
    disconnect,
    send,
    sendText,
    stopAll,
    startAll,
    ping,
  };
}
