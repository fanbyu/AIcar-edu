// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  NUS_SERVICE,
  NUS_TX_CHAR,
  NUS_RX_CHAR,
  MICROBLOCKS_SERVICE,
  driveBroadcast,
  decodeTelemetry,
  type CarCommand,
  type CarTelemetry,
} from './esp32Protocol';
import {
  encodeBroadcast,
  encodeShort,
  encodePing,
  OP,
  FrameParser,
  type BoardMessage,
} from './microblocksProtocol';

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
  /** 板子上行反馈（任务启动/完成/返回值/错误/输出等 MicroBlocks 消息）。 */
  onFeedback?: (msg: BoardMessage) => void;
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
  /** MicroBlocks 上行二进制帧流式解析器。 */
  private feedbackParser = new FrameParser();

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
      // Web Bluetooth 只支持低功耗蓝牙（BLE），不支持经典蓝牙。
      // 小车运行 MicroBlocks BLE 固件，广播 MicroBlocks 服务并默认带 "MicroBlocks" 设备名。
      // 优先用【MicroBlocks 服务 UUID】过滤（最稳，不依赖设备名），同时保留 "MicroBlocks" 名称前缀兜底。
      // 多个 filter 之间是"或"关系，满足任一即显示。
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'MicroBlocks' },
          { services: [MICROBLOCKS_SERVICE] },
        ],
        optionalServices: [MICROBLOCKS_SERVICE],
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
    // 板子上行的是 MicroBlocks 二进制帧，用帧解析器解码
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const msgs = this.feedbackParser.push(bytes);
    for (const msg of msgs) {
      // 桥接：若输出值文本是遥测（BAT:/SPD: 或 JSON），顺带更新遥测面板
      if (msg.kind === 'output' && typeof msg.valueText === 'string') {
        const t = decodeTelemetry(msg.valueText);
        if (t) this.callbacks.onTelemetry(t);
      }
      this.callbacks.onFeedback?.(msg);
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

  /** 把完整帧写入 TX 特征（优先 writeWithoutResponse，失败回退 write）。 */
  private async writeFrame(data: Uint8Array, errLabel: string): Promise<void> {
    if (!this.txChar) {
      this.callbacks.onState('error', '未连接，无法下发指令');
      return;
    }
    // 写值期望 BufferSource；Uint8Array<ArrayBufferLike> 与 ArrayBuffer 在 TS 5.7+ 下
    // 不完全兼容，这里做一次断言以通过类型检查（运行时即为普通 ArrayBuffer）。
    const buf = data as unknown as BufferSource;
    try {
      if (this.txChar.properties.writeWithoutResponse) {
        await this.txChar.writeValueWithoutResponse(buf);
      } else {
        await this.txChar.writeValue(buf);
      }
    } catch {
      try {
        await this.txChar.writeValueWithoutResponse(buf);
      } catch (e) {
        this.callbacks.onState('error', errLabel + '失败');
        void e;
      }
    }
  }

  /**
   * 下发运动指令：封装为 MicroBlocks 广播帧（0x1B，长消息）下发给板子。
   * 广播名取板子实际监听的单词 go/left/right/stop（经 driveBroadcast 映射，
   * 与官方参考页一致），而非单字符 F/L/R/S。
   * speed 保留为兼容参数；若板子需要调速，应改为先 Set Variable(0x08) 再广播。
   */
  async send(cmd: CarCommand, speed?: number): Promise<void> {
    const now = Date.now();
    if (now < this.writeThrottleUntil) return; // 简单节流避免刷屏
    this.writeThrottleUntil = now + 60;
    void speed;
    await this.writeFrame(encodeBroadcast(driveBroadcast(cmd)), '指令发送');
  }

  /**
   * 发送任意文本广播（如图像识别类别标签 person/car…）。
   * 通过 0x1B 广播帧下发给板子，板子用 `when I receive <标签>` 响应。
   */
  async sendText(text: string): Promise<void> {
    await this.writeFrame(encodeBroadcast(text), '标签发送');
  }

  /** 停止全部任务（0x06 短消息）。紧急停车用。 */
  async stopAll(): Promise<void> {
    await this.writeFrame(encodeShort(OP.STOP_ALL, 0), '停止全部');
  }

  /** 启动全部任务（0x05 短消息）。 */
  async startAll(): Promise<void> {
    await this.writeFrame(encodeShort(OP.START_ALL, 0), '启动全部');
  }

  /** 心跳探测（0x1A 短消息），板子应回 Ping。 */
  async ping(): Promise<void> {
    await this.writeFrame(encodePing(0), '心跳');
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
    this.feedbackParser.reset();
    this.callbacks.onState('disconnected', '已主动断开');
  }

  private cleanupChars() {
    if (this.rxChar) {
      this.rxChar.removeEventListener('characteristicvaluechanged', this.handleData);
    }
  }
}
