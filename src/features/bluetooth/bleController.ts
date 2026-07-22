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
  /**
   * GATT 写入串行链：所有下行写入都排到这条 Promise 链上，
   * 保证同一时刻「至多一个」writeValueWithoutResponse 在飞。
   * 参考页（sjaiedu）用 sendInProgress 锁实现同样的互斥——
   * 并发写同一特征是 Chrome Web Bluetooth 断连（NetworkError）的经典诱因。
   */
  private writeChain: Promise<void> = Promise.resolve();
  /** MicroBlocks 上行二进制帧流式解析器。 */
  private feedbackParser = new FrameParser();
  /** 心跳保活定时器：连接期间周期性 ping，防止空闲/推理间隙 supervision timeout 断连。 */
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

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
    // 连接握手：下发一次 stop 广播确认链路畅通（参考页做法），失败静默不阻塞连接
    this.enqueueWrite(encodeBroadcast(driveBroadcast('S')), '握手', true).catch(() => {});
    this.callbacks.onState('connected', device.name ?? 'ESP32 小车');
    this.startKeepAlive();
  }

  /** 启动心跳保活：连接空闲时持续发送 ping，使链路 supervision 计时器不会超时。 */
  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.userDisconnected || !this.txChar) return;
      this.ping().catch(() => {});
    }, 1500);
  }

  /** 停止心跳保活。 */
  private stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
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
    this.stopKeepAlive();
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

  /**
   * 把一次写入排入串行链（参考页的 sendInProgress 锁等价于此）：
   * 后续写入会等前一个写入完成后再执行，绝不并发。
   * silent=true 时不弹错误状态（用于连接握手等可失败的探测）。
   */
  private enqueueWrite(data: Uint8Array, errLabel: string, silent = false): Promise<void> {
    const run = this.writeChain.then(() => this.performWrite(data, errLabel, silent));
    // 吸收异常，避免链断裂导致后续写入永久卡住
    this.writeChain = run.catch(() => {});
    return run;
  }

  /** 串行链上的真正写入：失败最多重试 3 次（间隔 100ms），对标参考页 write_loop。 */
  private async performWrite(data: Uint8Array, errLabel: string, silent = false): Promise<void> {
    if (!this.txChar) {
      // 仅打印，不把全局 store 改成 error：连接并未断开，只是此条指令来不及发。
      // 否则会污染 useBluetoothStore 的 state，使 UI 误报「断开」（历史 bug 根因之一）。
      if (!silent) console.warn('[BLE] 未连接，丢弃指令：', errLabel);
      return;
    }
    if (this.userDisconnected) return;
    // 写值期望 BufferSource；Uint8Array<ArrayBufferLike> 与 ArrayBuffer 在 TS 5.7+ 下
    // 不完全兼容，这里做一次断言以通过类型检查（运行时即为普通 ArrayBuffer）。
    const buf = data as unknown as BufferSource;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (this.txChar.properties.writeWithoutResponse) {
          await this.txChar.writeValueWithoutResponse(buf);
        } else {
          await this.txChar.writeValue(buf);
        }
        return;
      } catch (e) {
        if (this.userDisconnected) return;
        console.warn('[BLE] 写入失败，重试', attempt + 1, e);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!silent) console.warn('[BLE] 指令发送失败（已重试）：', errLabel);
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
    await this.enqueueWrite(encodeBroadcast(driveBroadcast(cmd)), '指令发送');
  }

  /**
   * 发送任意文本广播（如图像识别类别标签 person/car…）。
   * 通过 0x1B 广播帧下发给板子，板子用 `when I receive <标签>` 响应。
   */
  async sendText(text: string): Promise<void> {
    await this.enqueueWrite(encodeBroadcast(text), '标签发送');
  }

  /** 停止全部任务（0x06 短消息）。紧急停车用。 */
  async stopAll(): Promise<void> {
    await this.enqueueWrite(encodeShort(OP.STOP_ALL, 0), '停止全部');
  }

  /** 启动全部任务（0x05 短消息）。 */
  async startAll(): Promise<void> {
    await this.enqueueWrite(encodeShort(OP.START_ALL, 0), '启动全部');
  }

  /** 心跳探测（0x1A 短消息），板子应回 Ping。 */
  async ping(): Promise<void> {
    await this.enqueueWrite(encodePing(0), '心跳');
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
    this.stopKeepAlive();
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
