// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  NUS_SERVICE,
  NUS_TX_CHAR,
  NUS_RX_CHAR,
  MICROBLOCKS_SERVICE,
  decodeTelemetry,
  type CarCommand,
  type CarTelemetry,
} from './esp32Protocol';
import {
  encodeShort,
  encodeBroadcast,
  encodePing,
  OP,
  FrameParser,
  type BoardMessage,
} from './microblocksProtocol';

const TEXT_DECODER = new TextDecoder();

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
  /** 自动重连达到上限仍失败：需用户手动重新扫描设备 */
  onReconnectFailed?: () => void;
  /** 板子上行反馈（任务启动/完成/返回值/错误/输出等 MicroBlocks 消息）。 */
  onFeedback?: (msg: BoardMessage) => void;
}

const MAX_RECONNECT_DELAY = 10000;
const RECONNECT_BASE = 1000;
/** 自动重连上限：超过则放弃并提示用户重新扫描（参考页 failover 思路，避免无限重连拖垮链路）。 */
const MAX_RECONNECT_ATTEMPTS = 8;

/** 两条下行广播（长消息 0x1B）之间的最小间隔（ms）。MicroBlocks 板子接收缓冲有限，
 *  相邻广播必须留出充分时间让其取走/分发，否则缓冲溢出直接断链。
 *  60ms ≈ 16 条/秒，远超手动点击与常规视觉识别标签速率，且远低于板子消费能力。 */
const MIN_TX_GAP_MS = 60;
/** 等待板子广播回显（ACK）的超时（ms）。板子收到广播后会原样回显作为 ACK；
 *  超时仍未收到（固件未启用回显 / 板子正忙）则保守放行，下一条仍受 MIN_TX_GAP_MS 节流，
 *  绝不因「不等回显就猛发」堆满板子缓冲——这是「点快了 / 视觉识别高频广播不断连」的关键。 */
const ACK_TIMEOUT_MS = 1000;
/** 相同识别标签的去重窗口（ms），见 sendText。 */
const LABEL_DEDUP_MS = 400;
/** 相同运动指令的去重窗口（ms），见 send()：视觉识别逐帧触发同一指令时压缩下发节奏。 */
const CMD_DEDUP_MS = 120;

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
  /** 重连/连接流程进行中：用于去重，避免写失败与断连事件并发触发多次重连。 */
  private linkBusy = false;
  /** 断连事件去抖：gattserverdisconnected 可能重复触发，同一轮只处理一次。 */
  private disconnecting = false;
  /**
   * GATT 写入串行链：所有下行写入都排到这条 Promise 链上，
   * 保证同一时刻「至多一个」writeValueWithoutResponse 在飞。
   * 并发写同一特征是 Chrome Web Bluetooth 断连（NetworkError）的经典诱因。
   */
  private writeChain: Promise<void> = Promise.resolve();
  /**
   * MicroBlocks 长消息流控：广播(0x1B)发出后，必须等到板子把该广播「回显」回来
   * （板子收到广播后会原样广播出去，主机收到自己的回显作为 ACK），才能发下一条。
   * 否则板子接收缓冲溢出会直接断链——典型表现：按 F 后直接按 B 断连，
   * 而 F→S→B 正常（S 之间给了板子处理/回显的间隙）。
   */
  private ackResolve: (() => void) | null = null;
  private ackExpect: string | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  /** MicroBlocks 上行二进制帧流式解析器。 */
  private feedbackParser = new FrameParser();
  /** 心跳保活定时器：连接期间周期性 ping，防止空闲/推理间隙 supervision timeout 断连。 */
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * 流控相关运行时开关（由 UI 调试面板控制，持久化到 localStorage）。
   * 目的：让用户能逐项开关，定位到底是哪个机制在与板子固件打架导致断连。
   *   - echoEnabled：是否等待板子广播回显(ACK)才发下一条。关掉后只按 txGapMs 间隔发送。
   *   - isolationEnabled：发送新运动指令前是否自动插入 S(停止) 隔离拍（复刻 F→S→B）。
   *   - keepAliveEnabled：是否周期性 ping 保活。
   *   - txGapMs：两条下行广播之间的最小间隔（ms）。
   */
  private echoEnabled = true;
  private isolationEnabled = true;
  private keepAliveEnabled = true;
  private txGapMs = MIN_TX_GAP_MS;

  /**
   * 浏览器侧按键队列：所有 send() 进入此队列，由 drainLoop 严格串行、按间隔下发。
   * 把「手动狂点 / 视觉识别高频广播」转化为一条有序、限速的下行流，并让 UI 看到待发长度。
   */
  private cmdQueue: CarCommand[] = [];
  private draining = false;
  private queueListeners: ((n: number) => void)[] = [];

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

  /** ===== 流控开关（UI 调试面板用，持久化在 store/localStorage） ===== */
  setEchoEnabled(v: boolean): void {
    this.echoEnabled = v;
  }
  setIsolationEnabled(v: boolean): void {
    this.isolationEnabled = v;
  }
  setKeepAliveEnabled(v: boolean): void {
    this.keepAliveEnabled = v;
    if (v) this.startKeepAlive();
    else this.stopKeepAlive();
  }
  setTxGapMs(ms: number): void {
    this.txGapMs = Math.max(0, Math.min(2000, ms | 0));
  }
  /** 订阅待发队列长度变化（用于 UI 显示）。 */
  onQueueChange(fn: (n: number) => void): void {
    this.queueListeners.push(fn);
  }
  private emitQueue(): void {
    const n = this.cmdQueue.length;
    for (const f of this.queueListeners) f(n);
  }

  /** 用户手势触发：扫描并选择设备 */
  async scanAndConnect(): Promise<void> {
    if (!this.isSupported) {
      this.callbacks.onState('error', '当前浏览器或环境不支持 Web Bluetooth');
      return;
    }
    this.userDisconnected = false;
    this.reconnectAttempts = 0;
    this.disconnecting = false;
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
    this.linkBusy = true;
    try {
      this.device = device;
      this.server = await device.gatt!.connect();
      const service = await this.server.getPrimaryService(NUS_SERVICE);
      this.txChar = await service.getCharacteristic(NUS_TX_CHAR);
      this.rxChar = await service.getCharacteristic(NUS_RX_CHAR);
      await this.rxChar.startNotifications();
      this.rxChar.addEventListener('characteristicvaluechanged', this.handleData);
      this.reconnectAttempts = 0;
      this.disconnecting = false;
      // 连接握手：下发一次 stop 广播确认链路畅通（参考页做法），失败静默不阻塞连接
      this.enqueueWrite(encodeBroadcast('S'), '握手', true).catch(() => {});
      this.callbacks.onState('connected', device.name ?? 'ESP32 小车');
      this.lastCommand = null; // 新连接：重置「上一条指令」状态，隔离拍判定从干净起点开始
      this.startKeepAlive();
      // 协商高优先级连接参数（最短连接间隔），对标参考页「实时控制 15–40ms」，
      // 显著降低 supervision timeout 造成的空闲断连。桌面 Chrome 可能不支持，静默忽略。
      this.requestHighPriority().catch(() => {});
    } finally {
      this.linkBusy = false;
    }
  }

  /**
   * 请求高优先级（'high'）连接参数：把连接间隔压到最短，减少丢包与超时断连。
   * 仅 Android 版 Chrome/Edge 支持 requestConnectionPriority；不支持时静默跳过。
   */
  private async requestHighPriority(): Promise<void> {
    const srv = this.server;
    if (!srv) return;
    const fn = (srv as unknown as { requestConnectionPriority?: (p: string) => Promise<unknown> })
      .requestConnectionPriority;
    if (typeof fn !== 'function') return;
    try {
      await fn.call(srv, 'high');
    } catch (e) {
      console.warn('[BLE] 请求高优先级连接参数失败（不影响连接）', e);
    }
  }

  /** 启动心跳保活：连接空闲时持续发送 ping，使链路 supervision 计时器不会超时；
   *  同时轮询 server.connected，若链路已静默失效（gattserverdisconnected 未及时触发）则主动重连。
   *  受 keepAliveEnabled 开关控制：关掉后完全不发 ping（用于排查 ping 是否引起断连）。 */
  private startKeepAlive() {
    this.stopKeepAlive();
    if (!this.keepAliveEnabled) return;
    this.keepAliveTimer = setInterval(() => {
      if (this.userDisconnected || !this.txChar) return;
      if (this.server?.connected === false) {
        this.triggerReconnect('链路疑似中断，正在重连…');
        return;
      }
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
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    // 文本指令协议兼容：固件可能直接以文本行（BAT:/SPD:/LBL: 等）回传，先按文本解析
    const text = TEXT_DECODER.decode(bytes);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const t = decodeTelemetry(line);
      if (t) this.callbacks.onTelemetry(t);
    }
    // 兼容 MicroBlocks 二进制帧
    const msgs = this.feedbackParser.push(bytes);
    for (const msg of msgs) {
      // 长消息流控：板子收到广播后会原样回显，作为下一条广播可发送的 ACK
      if (msg.kind === 'broadcast' && this.ackResolve) {
        const body = msg.valueText ?? '';
        if (this.ackExpect === null || this.ackExpect === body) this.ackResolve();
      }
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
    // 去抖：同一轮断连只处理一次（gattserverdisconnected 可能重复触发）
    if (this.disconnecting) return;
    this.disconnecting = true;
    // 意外断开：指数退避自动重连
    this.triggerReconnect('连接断开，正在尝试重连…');
  };

  /** 主动触发一次指数退避重连（去重 + 链路忙判定），供断连事件与写失败/保活探测复用。 */
  private triggerReconnect(reason = '连接异常，正在尝试重连…'): void {
    if (this.userDisconnected || this.reconnectTimer || this.linkBusy) return;
    this.callbacks.onState('disconnected', reason);
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    // 达到上限仍失败：放弃自动重连，提示用户手动重新扫描（参考页 failover）。
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.callbacks.onState('disconnected', '自动重连失败，请重新扫描设备');
      this.callbacks.onReconnectFailed?.();
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts += 1;
    this.callbacks.onReconnecting?.(delay);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.userDisconnected || !this.lastDevice) return;
      if (this.linkBusy) {
        // 正在连接/重连中，稍后再试，避免并发 connect 互相踩踏
        this.scheduleReconnect();
        return;
      }
      try {
        await this.connectTo(this.lastDevice);
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * 把一次写入排入串行链（参考页 sendInProgress 锁等价于此）：后续写入等前一个完成后再执行，绝不并发。
   * 长消息（广播 0x1B）需传 expectEcho=广播名：发完后等待板子把该广播「回显」回来（ACK）才允许下一条，
   * 否则板子接收缓冲溢出会直接断链。等待期间叠加 MIN_TX_GAP_MS 最小间隔作为兜底流控，
   * 即使固件不回显也不会因放行过快而溢出。
   * silent=true 时不弹错误状态（用于连接握手等可失败的探测）。
   */
  private enqueueWrite(
    data: Uint8Array,
    errLabel: string,
    silent = false,
    expectEcho: string | null = null
  ): Promise<void> {
    const run = this.writeChain.then(async () => {
      const t0 = Date.now();
      const waitEcho = expectEcho !== null && this.echoEnabled;
      const ack = waitEcho ? this.installAck(expectEcho) : null;
      await this.performWrite(data, errLabel, silent);
      if (ack) {
        // 等板子回显；超时（ACK_TIMEOUT_MS）兜底放行，避免依赖具体固件是否回显而死锁。
        const outcome = await Promise.race([
          ack.then(() => 'ack' as const),
          this.delay(ACK_TIMEOUT_MS).then(() => 'timeout' as const),
        ]);
        // 超时兜底时清理等待器，避免 ackResolve/ackExpect 残留为脏状态。
        if (outcome === 'timeout') this.clearAck();
      }
      // 保证最小发送间隔：即便回显瞬间到达，也要等满间隔，
      // 防止两条下行广播间隔过密导致 BLE 写队列瞬时拥塞 / 板子缓冲溢出。
      // 间隔由 txGapMs 控制（UI 可调）；回显关闭时仅依赖此间隔限速。
      const elapsed = Date.now() - t0;
      if (elapsed < this.txGapMs) {
        await this.delay(this.txGapMs - elapsed);
      }
    });
    // 吸收异常，避免链断裂导致后续写入永久卡住
    this.writeChain = run.catch(() => {});
    return run;
  }

  /** 工具：延时 ms。 */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 安装一个广播回显等待器：板子收到广播后会原样回显（作为长消息 ACK）。
   * 返回在其回显到达（或外部超时）时 resolve 的 Promise。若此前仍有未清的等待器，先放行旧的，
   * 避免串行链上残留的 ack 导致新一条永远等不到回显而卡住。
   */
  private installAck(expectBody: string): Promise<void> {
    if (this.ackResolve) {
      try {
        this.ackResolve();
      } catch {
        /* noop */
      }
      this.clearAck();
    }
    return new Promise<void>((resolve) => {
      this.ackExpect = expectBody;
      this.ackResolve = () => {
        this.clearAck();
        resolve();
      };
    });
  }

  private clearAck() {
    this.ackExpect = null;
    this.ackResolve = null;
    if (this.ackTimer) {
      clearTimeout(this.ackTimer);
      this.ackTimer = null;
    }
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
    // writeValueWithoutResponse 连续失败通常意味着链路实际已失效
    //（该写操作不靠 ACK，失败即说明连接已断，但 server.connected 可能为 true 未及时更新），
    // 因此不再以 server.connected 为假才重连，而是无条件主动重连（triggerReconnect 自带去重）。
    if (!this.userDisconnected) {
      this.triggerReconnect('指令写入失败，链路异常，正在重连…');
    }
  }

  /**
   * 下发运动指令（浏览器侧队列入口）：固件为 MicroBlocks 广播协议，广播名 F/B/L/R/RF/RB/LF/LB + S + TL + TR。
   * 指令先进入 cmdQueue，由 drainLoop 严格串行、按 txGapMs 间隔下发，避免并发写与瞬时拥塞；
   * UI 可通过 onQueueChange 看到待发队列长度。speed 保留为兼容参数。
   */
  private lastCommand: CarCommand | null = null;
  private lastCommandAt = 0;
  async send(cmd: CarCommand, speed?: number): Promise<void> {
    void speed;
    this.cmdQueue.push(cmd);
    this.emitQueue();
    if (!this.draining) void this.drainLoop();
  }

  /** 队列消费循环：逐条取出指令并下发，确保全程串行 + 限速。 */
  private async drainLoop(): Promise<void> {
    this.draining = true;
    try {
      while (this.cmdQueue.length > 0) {
        const cmd = this.cmdQueue.shift()!;
        this.emitQueue();
        await this.dispatchOne(cmd);
      }
    } finally {
      this.draining = false;
      this.emitQueue();
    }
  }

  /** 下发单条指令：先按开关插入隔离拍(可选)，再做短窗口去重，最后 enqueueWrite。 */
  private async dispatchOne(cmd: CarCommand): Promise<void> {
    const now = Date.now();
    // 方向切换隔离拍（受 isolationEnabled 开关控制）：用户实测「F 后直接 B」会断连，但「F→S→B」稳定。
    // 根因是 MicroBlocks 板子收到持续运动广播后处于占用态，未复位就直接接下一个运动指令会冲突/异常断链；
    // 因此在发送任一「非停止的新运动指令」前，若上一条不是停止，先下发 S(停止) 隔离拍，复刻 F→S→B 稳定模式。
    // 隔离拍不等待回显（silent），仅靠串行写链顺序保证 S 先于当前指令到达板子。
    const needIsolation =
      this.isolationEnabled &&
      cmd !== 'S' &&
      this.lastCommand !== null &&
      this.lastCommand !== 'S' &&
      cmd !== this.lastCommand;
    if (needIsolation) {
      await this.enqueueWrite(encodeBroadcast('S'), '切换隔离-停止', true);
    }
    // 短窗口去重：相同指令短时间重复（识别抖动/逐帧触发）丢弃，降低下行压力，避免队列积压。
    if (cmd === this.lastCommand && now - this.lastCommandAt < CMD_DEDUP_MS) {
      return;
    }
    this.lastCommand = cmd;
    this.lastCommandAt = now;
    // 广播是长消息(0x1B)：回显(ACK)等待受 echoEnabled 开关控制，关闭时仅按 txGapMs 间隔发送。
    await this.enqueueWrite(encodeBroadcast(cmd), '指令发送', false, cmd);
  }

  /**
   * 发送图像识别类别标签（如 person/car…）：以 MicroBlocks 广播帧下发，
   * 板子用 `when I receive <label>` 响应。同样走长消息回显流控。
   */
  /**
   * 发送图像识别类别标签（如 person/car…）：以 MicroBlocks 广播帧下发，板子用 `when I receive <label>` 响应。
   * 视觉识别会产生高频、不可控的标签广播，这里做两层防护防止断连：
   *   1) 去重：同一标签在 LABEL_DEDUP_MS 内重复出现直接丢弃（识别抖动必然产生大量重复标签）。
   *   2) 串行 + 最小间隔 + 回显流控（enqueueWrite 内部）：即使标签突发密集，下行节奏也被锁在板子可承受范围，绝不溢出。
   */
  private lastLabel: string | null = null;
  private lastLabelAt = 0;
  async sendText(text: string): Promise<void> {
    const now = Date.now();
    if (text === this.lastLabel && now - this.lastLabelAt < LABEL_DEDUP_MS) {
      // 识别抖动：相同标签短时间内重复，丢弃冗余，降低下行压力
      return;
    }
    this.lastLabel = text;
    this.lastLabelAt = now;
    await this.enqueueWrite(encodeBroadcast(text), '标签发送', false, text);
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
    this.disconnecting = false;
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
    this.cmdQueue = [];
    this.emitQueue();
    this.callbacks.onState('disconnected', '已主动断开');
  }

  private cleanupChars() {
    if (this.rxChar) {
      this.rxChar.removeEventListener('characteristicvaluechanged', this.handleData);
    }
    // 断开时释放可能正在等待回显的命令，避免写链卡住
    this.clearAck();
  }
}
