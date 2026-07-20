// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  NUS_SERVICE,
  NUS_TX_CHAR,
  NUS_RX_CHAR,
  encodeCommand,
  encodeLabel,
  decodeTelemetry,
  type CarCommand,
  type CarTelemetry,
} from './esp32Protocol';

export type BleState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface BleControllerCallbacks {
  onState: (s: BleState, info?: string) => void;
  onTelemetry: (t: CarTelemetry) => void;
  /** 自动重连尝试（指数退避）时回调，传下一次等待毫秒 */
  onReconnecting?: (nextDelayMs: number) => void;
}

const MAX_RECONNECT_DELAY = 10000;
const RECONNECT_BASE = 1000;

/**
 * GATT 控制器：封装 Web Bluetooth 扫描 / 连接 / 写指令 / notify / 断开 / 指数退避重连。
 * 约束：requestDevice 必须由用户手势触发；仅在 HTTPS/localhost 安全上下文可用。
 */
export class BleController {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private txChar: BluetoothRemoteGATTCharacteristic | null = null;
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private callbacks: BleControllerCallbacks;
  private lastDevice: BluetoothDevice | null = null;
  private userDisconnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private writeThrottleUntil = 0;

  constructor(callbacks: BleControllerCallbacks) {
    this.callbacks = callbacks;
  }

  get isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      // 安全上下文：HTTPS 或 localhost
      (location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1')
    );
  }

  /** 用户手势触发：扫描并选择设备 */
  async scanAndConnect(): Promise<void> {
    if (!this.isSupported) {
      this.callbacks.onState('error', '当前浏览器或环境不支持 Web Bluetooth');
      return;
    }
    this.userDisconnected = false;
    this.callbacks.onState('scanning');
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [NUS_SERVICE] }, { namePrefix: 'ESP32' }],
        optionalServices: [NUS_SERVICE],
      });
      this.lastDevice = device;
      device.addEventListener('gattserverdisconnected', this.handleDisconnect);
      await this.connectTo(device);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('User cancelled') || msg.includes('cancelled')) {
        this.callbacks.onState('idle', '已取消扫描');
      } else {
        this.callbacks.onState('error', msg);
      }
    }
  }

  /** 使用最近一次设备一键重连 */
  async reconnectLast(): Promise<void> {
    if (!this.lastDevice) {
      this.callbacks.onState('error', '没有可重连的设备，请先扫描');
      return;
    }
    this.userDisconnected = false;
    await this.connectTo(this.lastDevice);
  }

  private async connectTo(device: BluetoothDevice): Promise<void> {
    this.callbacks.onState('connecting');
    this.device = device;
    this.server = await device.gatt!.connect();
    const service = await this.server.getPrimaryService(NUS_SERVICE);
    this.txChar = await service.getCharacteristic(NUS_TX_CHAR);
    this.rxChar = await service.getCharacteristic(NUS_RX_CHAR);
    await this.rxChar.startNotifications();
    this.rxChar.addEventListener('characteristicvaluechanged', this.handleData);
    this.reconnectAttempts = 0;
    this.callbacks.onState('connected', device.name ?? 'ESP32 小车');
  }

  private handleData = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const text = new TextDecoder().decode(value);
    for (const line of text.split('\n')) {
      const t = decodeTelemetry(line);
      if (t) this.callbacks.onTelemetry(t);
    }
  };

  private handleDisconnect = () => {
    this.cleanupChars();
    if (this.userDisconnected) {
      this.callbacks.onState('disconnected', '已主动断开');
      return;
    }
    // 意外断开：指数退避自动重连
    this.callbacks.onState('disconnected', '连接断开，正在尝试重连…');
    this.scheduleReconnect();
  };

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts += 1;
    this.callbacks.onReconnecting?.(delay);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.userDisconnected || !this.lastDevice) return;
      try {
        await this.connectTo(this.lastDevice);
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  /** 下发指令（带节流，失败回退 writeWithoutResponse） */
  async send(cmd: CarCommand, speed?: number): Promise<void> {
    if (!this.txChar) {
      this.callbacks.onState('error', '未连接，无法下发指令');
      return;
    }
    const payload = encodeCommand(cmd, speed);
    const data = new TextEncoder().encode(payload);
    const now = Date.now();
    if (now < this.writeThrottleUntil) return; // 简单节流避免刷屏
    this.writeThrottleUntil = now + 60;
    try {
      if (this.txChar.properties.writeWithoutResponse) {
        await this.txChar.writeValueWithoutResponse(data);
      } else {
        await this.txChar.writeValue(data);
      }
    } catch {
      try {
        await this.txChar.writeValueWithoutResponse(data);
      } catch (e) {
        this.callbacks.onState('error', '指令发送失败');
        void e;
      }
    }
  }

  /**
   * 发送任意文本（如检测标签广播）。通过 TX 特征原样下发，
   * 用于把当前检测的最高优先级分类标签持续抛给小车。
   */
  async sendText(text: string): Promise<void> {
    if (!this.txChar) {
      this.callbacks.onState('error', '未连接，无法发送');
      return;
    }
    const data = new TextEncoder().encode(text);
    try {
      if (this.txChar.properties.writeWithoutResponse) {
        await this.txChar.writeValueWithoutResponse(data);
      } else {
        await this.txChar.writeValue(data);
      }
    } catch {
      try {
        await this.txChar.writeValueWithoutResponse(data);
      } catch {
        this.callbacks.onState('error', '标签发送失败');
      }
    }
  }

  /** 主动断开 */
  disconnect(): void {
    this.userDisconnected = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.device?.gatt?.disconnect();
    } catch {
      /* ignore */
    }
    this.cleanupChars();
    this.callbacks.onState('disconnected', '已主动断开');
  }

  private cleanupChars() {
    if (this.rxChar) {
      this.rxChar.removeEventListener('characteristicvaluechanged', this.handleData);
    }
  }
}
