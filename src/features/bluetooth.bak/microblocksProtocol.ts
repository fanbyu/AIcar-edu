// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * MicroBlocks 串行协议 v2.09 —— 二进制帧编解码（公开标准协议）。
 *
 * 所有消息以一个 flag 字节开头：
 *   短消息（3 字节）  : [0xFA, OpCode, ChunkOrVariableID]
 *   长消息（变长）    : [0xFB, OpCode, ChunkOrVariableID, DataSize-LSB, DataSize-MSB, ...data..., 0xFE]
 *   - DataSize 含结尾的终止符 0xFE，因此实际负载为 DataSize-1 字节。
 *
 * 通过 BLE Nordic UART Service (NUS) 透传，浏览器 IDE ↔ 板子（ESP32 / MicroBlocks VM）。
 * 浏览器用 0x1B (Broadcast) 下行“手动指令 / 图像识别指令”，板子用 0x10~0x1F 上行执行反馈。
 */

export const FLAG_SHORT = 0xfa;
export const FLAG_LONG = 0xfb;
export const TERM = 0xfe;

/** 协议 OpCode（双向通用，IDE→板子 / 板子→IDE / 双向）。 */
export const OP = {
  // IDE -> Board
  CHUNK_CODE: 0x01,
  DELETE_CHUNK: 0x02,
  START_CHUNK: 0x03,
  STOP_CHUNK: 0x04,
  START_ALL: 0x05,
  STOP_ALL: 0x06,
  GET_VAR: 0x07,
  SET_VAR: 0x08,
  GET_VAR_NAMES: 0x09,
  CLEAR_VARS: 0x0a,
  GET_CRC: 0x0b,
  GET_VM_VERSION: 0x0c,
  GET_ALL_CODE: 0x0d,
  DELETE_ALL_CODE: 0x0e,
  SYSTEM_RESET: 0x0f,
  // Board -> IDE
  TASK_STARTED: 0x10,
  TASK_DONE: 0x11,
  TASK_RETURNED: 0x12,
  TASK_ERROR: 0x13,
  OUTPUT_VALUE: 0x14,
  VAR_VALUE: 0x15,
  VM_VERSION: 0x16,
  CHUNK_CRC: 0x17,
  CLEAR_GRAPH: 0x18,
  CODE_STORE_FULL: 0x19,
  // 双向
  PING: 0x1a,
  BROADCAST: 0x1b,
  CHUNK_ATTR: 0x1c,
  VAR_NAME: 0x1d,
  EXTENDED: 0x1e,
  ENABLE_BLE: 0x1f,
  CHUNK_CODE16: 0x20,
  CODE_SPACE_USED: 0x21,
  SNAPSHOT_CODE: 0x22,
  GET_ALL_CRCS: 0x26,
  ALL_CRCS: 0x27,
  // 文件传输（IDE <-> Board）
  DELETE_FILE: 200,
  LIST_FILES: 201,
  FILE_INFO: 202,
  START_READING: 203,
  START_WRITING: 204,
  FILE_CHUNK: 205,
} as const;

export type OpCode = (typeof OP)[keyof typeof OP];

/** 值类型标记（Set/Get Variable、Output、Returned Value 的负载首字节）。 */
export const VAL_INT = 1;
export const VAL_STRING = 2;
export const VAL_BOOL = 3;

/** 板子 -> IDE 反馈消息的语义分类。 */
export type FeedbackKind =
  | 'taskStarted'
  | 'taskDone'
  | 'taskReturned'
  | 'taskError'
  | 'output'
  | 'variableValue'
  | 'vmVersion'
  | 'chunkCrc'
  | 'clearGraph'
  | 'codeStoreFull'
  | 'ping'
  | 'broadcast'
  | 'chunkAttr'
  | 'variableName'
  | 'codeSpaceUsed'
  | 'allCrcs'
  | 'other';

export type FeedbackStatus = 'ok' | 'error' | 'info';

/** 一条完整解析出的板子消息（含下行/上行）。 */
export interface BoardMessage {
  flag: number;
  opcode: number;
  opName: string;
  chunkId: number;
  kind: FeedbackKind;
  status: FeedbackStatus;
  /** 可解码为人类可读文本的值（output / returned / variable / version 等）。 */
  valueText?: string;
  /** 解码后的裸值（数字 / 字符串 / 布尔），未解码则为 undefined。 */
  value?: number | string | boolean;
  errorCode?: number;
  errorChunkId?: number;
  raw: Uint8Array;
  hex: string;
  time: number;
}

const OP_NAMES: Record<number, string> = {
  [OP.CHUNK_CODE]: 'ChunkCode',
  [OP.DELETE_CHUNK]: 'DeleteChunk',
  [OP.START_CHUNK]: 'StartChunk',
  [OP.STOP_CHUNK]: 'StopChunk',
  [OP.START_ALL]: 'StartAll',
  [OP.STOP_ALL]: 'StopAll',
  [OP.GET_VAR]: 'GetVariable',
  [OP.SET_VAR]: 'SetVariable',
  [OP.GET_VAR_NAMES]: 'GetVariableNames',
  [OP.CLEAR_VARS]: 'ClearVariables',
  [OP.GET_CRC]: 'GetCRC',
  [OP.GET_VM_VERSION]: 'GetVMVersion',
  [OP.GET_ALL_CODE]: 'GetAllCode',
  [OP.DELETE_ALL_CODE]: 'DeleteAllCode',
  [OP.SYSTEM_RESET]: 'SystemReset',
  [OP.TASK_STARTED]: 'TaskStarted',
  [OP.TASK_DONE]: 'TaskDone',
  [OP.TASK_RETURNED]: 'TaskReturned',
  [OP.TASK_ERROR]: 'TaskError',
  [OP.OUTPUT_VALUE]: 'OutputValue',
  [OP.VAR_VALUE]: 'VariableValue',
  [OP.VM_VERSION]: 'VMVersion',
  [OP.CHUNK_CRC]: 'ChunkCRC',
  [OP.CLEAR_GRAPH]: 'ClearGraph',
  [OP.CODE_STORE_FULL]: 'CodeStoreFull',
  [OP.PING]: 'Ping',
  [OP.BROADCAST]: 'Broadcast',
  [OP.CHUNK_ATTR]: 'ChunkAttr',
  [OP.VAR_NAME]: 'VariableName',
  [OP.EXTENDED]: 'Extended',
  [OP.ENABLE_BLE]: 'EnableBLE',
  [OP.CHUNK_CODE16]: 'ChunkCode16',
  [OP.CODE_SPACE_USED]: 'CodeSpaceUsed',
  [OP.SNAPSHOT_CODE]: 'SnapshotCode',
  [OP.GET_ALL_CRCS]: 'GetAllCRCs',
  [OP.ALL_CRCS]: 'AllCRCs',
  [OP.DELETE_FILE]: 'DeleteFile',
  [OP.LIST_FILES]: 'ListFiles',
  [OP.FILE_INFO]: 'FileInfo',
  [OP.START_READING]: 'StartReading',
  [OP.START_WRITING]: 'StartWriting',
  [OP.FILE_CHUNK]: 'FileChunk',
};

const KIND_BY_OP: Record<number, FeedbackKind> = {
  [OP.TASK_STARTED]: 'taskStarted',
  [OP.TASK_DONE]: 'taskDone',
  [OP.TASK_RETURNED]: 'taskReturned',
  [OP.TASK_ERROR]: 'taskError',
  [OP.OUTPUT_VALUE]: 'output',
  [OP.VAR_VALUE]: 'variableValue',
  [OP.VM_VERSION]: 'vmVersion',
  [OP.CHUNK_CRC]: 'chunkCrc',
  [OP.CLEAR_GRAPH]: 'clearGraph',
  [OP.CODE_STORE_FULL]: 'codeStoreFull',
  [OP.PING]: 'ping',
  [OP.BROADCAST]: 'broadcast',
  [OP.CHUNK_ATTR]: 'chunkAttr',
  [OP.VAR_NAME]: 'variableName',
  [OP.CODE_SPACE_USED]: 'codeSpaceUsed',
  [OP.ALL_CRCS]: 'allCrcs',
};

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** 合法 OpCode 集合（用于失步后重新同步：flag 后必须跟合法 OpCode）。 */
const VALID_OPCODES = new Set<number>([
  ...Object.values(OP),
]);

export function toHex(bytes: Uint8Array, sep = ' '): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) parts.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
  return parts.join(sep);
}

/** 编码短消息 [0xFA, OpCode, ID]。 */
export function encodeShort(opcode: number, id = 0): Uint8Array {
  return new Uint8Array([FLAG_SHORT, opcode & 0xff, id & 0xff]);
}

/** 编码长消息 [0xFB, OpCode, ID, sizeLSB, sizeMSB, ...payload, 0xFE]（size 含终止符）。 */
export function encodeLong(opcode: number, id: number, payload: Uint8Array): Uint8Array {
  const size = payload.length + 1; // 含终止符 0xFE
  const frame = new Uint8Array(5 + payload.length + 1);
  frame[0] = FLAG_LONG;
  frame[1] = opcode & 0xff;
  frame[2] = id & 0xff;
  frame[3] = size & 0xff;
  frame[4] = (size >> 8) & 0xff;
  frame.set(payload, 5);
  frame[5 + payload.length] = TERM;
  return frame;
}

/** 编码一条“广播”下行消息（0x1B，长消息），body 为广播名（UTF-8）。 */
export function encodeBroadcast(body: string, id = 0): Uint8Array {
  return encodeLong(OP.BROADCAST, id, TEXT_ENCODER.encode(body));
}

export function encodePing(id = 0): Uint8Array {
  return encodeShort(OP.PING, id);
}
export function encodeStartAll(id = 0): Uint8Array {
  return encodeShort(OP.START_ALL, id);
}
export function encodeStopAll(id = 0): Uint8Array {
  return encodeShort(OP.STOP_ALL, id);
}

/** 把整数（4 字节 LSB）封装为带类型标记的值体，用于 Set/Output/Returned。 */
export function encodeValueInt(n: number): Uint8Array {
  const b = new Uint8Array(5);
  b[0] = VAL_INT;
  b[1] = n & 0xff;
  b[2] = (n >> 8) & 0xff;
  b[3] = (n >> 16) & 0xff;
  b[4] = (n >> 24) & 0xff;
  return b;
}
export function encodeValueString(s: string): Uint8Array {
  const body = TEXT_ENCODER.encode(s);
  const b = new Uint8Array(1 + body.length);
  b[0] = VAL_STRING;
  b.set(body, 1);
  return b;
}
export function encodeValueBool(v: boolean): Uint8Array {
  return new Uint8Array([VAL_BOOL, v ? 1 : 0]);
}

/** 解码“Set/Get Variable、Output、Returned Value”的负载：类型标记 + 值。 */
export function decodeValue(data: Uint8Array): { type: number; value: number | string | boolean } {
  if (data.length === 0) return { type: 0, value: 0 };
  const type = data[0];
  if (type === VAL_INT) {
    const v =
      data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
    return { type, value: v };
  }
  if (type === VAL_BOOL) {
    return { type, value: data.length > 1 ? data[1] !== 0 : false };
  }
  // VAL_STRING（默认按字符串处理）
  return { type, value: TEXT_DECODER.decode(data.subarray(1)) };
}

/** 把一条板子消息转换为中文可读描述（用于 UI 反馈日志）。 */
export function describeBoardMessage(msg: BoardMessage): string {
  const who = msg.flag === FLAG_LONG || msg.flag === FLAG_SHORT ? '' : '';
  switch (msg.kind) {
    case 'taskStarted':
      return `板子：任务启动（chunk ${msg.chunkId}）`;
    case 'taskDone':
      return `板子：任务完成（chunk ${msg.chunkId}）`;
    case 'taskReturned':
      return `板子：任务返回值 ${msg.valueText ?? ''}`;
    case 'taskError':
      return `板子：任务错误 0x${(msg.errorCode ?? 0).toString(16).padStart(2, '0')}（chunk ${msg.errorChunkId ?? msg.chunkId}）`;
    case 'output':
      return `板子输出：${msg.valueText ?? '(空)'}`;
    case 'variableValue':
      return `变量值：${msg.valueText ?? ''}`;
    case 'vmVersion':
      return `VM 版本：${msg.valueText ?? ''}`;
    case 'chunkCrc':
      return `块 CRC：0x${(msg.value as number | undefined)?.toString(16).padStart(8, '0') ?? ''}`;
    case 'ping':
      return `心跳回应（chunk ${msg.chunkId}）`;
    case 'broadcast':
      return `板子广播：${msg.valueText ?? ''}`;
    case 'codeStoreFull':
      return `代码存储已满`;
    case 'clearGraph':
      return `清空绘图`;
    case 'variableName':
      return `变量名：${msg.valueText ?? ''}`;
    case 'codeSpaceUsed':
      return `代码空间占用：${msg.valueText ?? ''}`;
    case 'allCrcs':
      return `全部块 CRC`;
    default:
      return `消息 ${msg.opName} (0x${msg.opcode.toString(16).padStart(2, '0')}, chunk ${msg.chunkId})`;
  }
}

function statusOf(msg: BoardMessage): FeedbackStatus {
  switch (msg.kind) {
    case 'taskError':
    case 'codeStoreFull':
      return 'error';
    case 'taskDone':
    case 'taskReturned':
      return 'ok';
    case 'output':
      // 输出文本以 ERR/FAIL 开头视为失败
      if (msg.valueText && /^(ERR|FAIL)/i.test(msg.valueText.trim())) return 'error';
      return 'ok';
    default:
      return 'info';
  }
}

/** 由原始帧字节构造一条 BoardMessage。 */
function buildMessage(
  flag: number,
  opcode: number,
  chunkId: number,
  data: Uint8Array | undefined,
  raw: Uint8Array
): BoardMessage {
  const kind = KIND_BY_OP[opcode] ?? 'other';
  const msg: BoardMessage = {
    flag,
    opcode,
    opName: OP_NAMES[opcode] ?? `0x${opcode.toString(16).padStart(2, '0')}`,
    chunkId,
    kind,
    status: 'info',
    raw,
    hex: toHex(raw),
    time: Date.now(),
  };

  if (data) {
    switch (opcode) {
      case OP.OUTPUT_VALUE:
      case OP.TASK_RETURNED:
      case OP.VAR_VALUE: {
        const { value } = decodeValue(data);
        msg.value = value;
        msg.valueText = typeof value === 'string' ? value : String(value);
        break;
      }
      case OP.VM_VERSION:
      case OP.VAR_NAME:
      case OP.BROADCAST: {
        msg.valueText = TEXT_DECODER.decode(data);
        break;
      }
      case OP.TASK_ERROR: {
        if (data.length >= 1) msg.errorCode = data[0];
        // 后 4 字节：高 24 位 IP + 低 8 位 chunkID
        if (data.length >= 5) msg.errorChunkId = data[4];
        break;
      }
      case OP.CHUNK_CRC: {
        if (data.length >= 4) msg.value = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
        break;
      }
      case OP.CODE_SPACE_USED: {
        if (data.length >= 8) {
          const used = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
          const free = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
          msg.valueText = `已用 ${used} / 剩余 ${free} 字节`;
        }
        break;
      }
      default:
        break;
    }
  }

  msg.status = statusOf(msg);
  return msg;
}

/**
 * 流式帧解析器：持续喂入从 BLE RX 收到的字节，返回已解析出的完整消息。
 * 具备失步重同步能力（遇到非法字节时丢弃，直到重新见到 flag + 合法 OpCode）。
 */
export class FrameParser {
  private buf = new Uint8Array(0);

  private append(chunk: Uint8Array) {
    const next = new Uint8Array(this.buf.length + chunk.length);
    next.set(this.buf, 0);
    next.set(chunk, this.buf.length);
    this.buf = next;
  }

  /** 找到下一个有效的帧起始位置（flag + 合法 OpCode），否则返回 -1。 */
  private findStart(from: number): number {
    for (let i = from; i < this.buf.length; i++) {
      const f = this.buf[i];
      if (f !== FLAG_SHORT && f !== FLAG_LONG) continue;
      if (i + 1 >= this.buf.length) return -1; // 暂无下一字节，等更多数据
      const op = this.buf[i + 1];
      if (VALID_OPCODES.has(op)) return i;
    }
    return -1;
  }

  /** 喂入一帧字节，返回本次解析出的所有完整消息。 */
  push(chunk: Uint8Array): BoardMessage[] {
    this.append(chunk);
    const out: BoardMessage[] = [];
    let i = 0;

    while (i < this.buf.length) {
      const flag = this.buf[i];

      if (flag !== FLAG_SHORT && flag !== FLAG_LONG) {
        const start = this.findStart(i + 1);
        if (start < 0) {
          this.buf = new Uint8Array(0); // 全部为垃圾，丢弃
          return out;
        }
        this.buf = this.buf.subarray(start);
        i = 0;
        continue;
      }

      const opcode = this.buf[i + 1];
      if (!VALID_OPCODES.has(opcode)) {
        // 误报的 flag（如数据中的 0xFA/0xFB），跳 1 字节继续扫描
        i += 1;
        continue;
      }

      if (flag === FLAG_SHORT) {
        if (i + 3 > this.buf.length) break; // 等更多数据
        const id = this.buf[i + 2];
        const raw = this.buf.subarray(i, i + 3);
        out.push(buildMessage(FLAG_SHORT, opcode, id, undefined, raw.slice()));
        i += 3;
      } else {
        if (i + 5 > this.buf.length) break; // 头还不完整
        const size = this.buf[i + 3] | (this.buf[i + 4] << 8);
        const total = 5 + (size - 1); // size 含终止符，故负载 = size-1
        if (i + total > this.buf.length) break; // 等更多数据
        const data = this.buf.subarray(i + 5, i + 5 + (size - 1));
        const raw = this.buf.subarray(i, i + total);
        out.push(buildMessage(FLAG_LONG, opcode, this.buf[i + 2], data.slice(), raw.slice()));
        i += total;
      }
    }

    if (i > 0) this.buf = this.buf.subarray(i);
    return out;
  }

  reset() {
    this.buf = new Uint8Array(0);
  }
}
