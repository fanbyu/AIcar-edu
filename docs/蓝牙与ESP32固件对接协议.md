# 蓝牙与 ESP32 固件对接协议

> 适用对象：ESP32 小车固件开发者、Web 端调试人员
> 协议定位：Web 端（浏览器 / 边缘计算控制台）与 ESP32 小车之间的 BLE 通信契约
> 参考规范：Nordic UART Service（NUS），见 <https://github.com/NordicSemiconductor/Android-nRF-Connect-UART>

---

## 1. 概述

Web 端通过 **Web Bluetooth API** 与 ESP32 建立 BLE 连接，采用业界标准的 **Nordic UART Service（NUS）** 透传文本行，实现双向通信：

- **下行（Web → ESP32）**：运动控制指令（前进/左转/右转/停止）+ 实时检测分类标签广播。
- **上行（ESP32 → Web）**：小车遥测数据（电量、速度、模式、错误码）。

所有数据均为 **UTF-8 文本**，以换行符 `\n` 作为帧分隔符。固件无需解析二进制，按行切分即可。

---

## 2. GATT 服务与特征值（UUID）

| 项目 | UUID | 方向 | 说明 |
| --- | --- | --- | --- |
| NUS 服务 | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | — | 主服务，需广播此 UUID |
| TX 特征 | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | Web → ESP32（write） | 下行指令写入此特征 |
| RX 特征 | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | ESP32 → Web（notify） | 上行遥测通过 notify 推送 |

> **固件要求**：
> - 必须广播 NUS 服务 UUID（或可被发现，设备名建议以 `ESP32` 前缀，便于 Web 端过滤）。
> - TX 特征需要 **write**（建议 `writeWithoutResponse`，即 `BT_GATT_CHRC_WRITE_WITHOUT_RESP`）属性。
> - RX 特征需要 **notify** 属性，固件上行数据通过 `notify` 推送。

---

## 3. 数据帧通用规则

1. 编码：`UTF-8`。
2. 帧尾：每条消息以 `\n`（LF，`0x0A`）结尾。
3. 多帧：一条 BLE 通知可能携带多帧，Web 端按 `\n` 拆分后逐帧解析；固件发送时也请保证每条消息以 `\n` 结束。
4. 指令与广播的区分：下行消息首字符或前缀用于区分语义（见下表），固件应在解析时先判断前缀：

| 下行前缀 | 含义 | 示例 |
| --- | --- | --- |
| 单字符 `F`/`L`/`R`/`S` | 运动控制指令 | `F\n`、`L,120\n` |
| `LBL:` | 分类标签广播 | `LBL:Forward\|88\n` |

---

## 4. 下行协议（Web → ESP32）

### 4.1 运动控制指令

格式一（无速度）：

```
<CMD>\n
```

格式二（带速度，可选）：

```
<CMD>,<SPEED>\n
```

其中：

| CMD | 含义 | 中文 |
| --- | --- | --- |
| `F` | Forward | 前进 |
| `L` | Left | 左转 |
| `R` | Right | 右转 |
| `S` | Stop | 停止 |

- `<SPEED>`：整数，单位由固件解释（建议 0–255 的 PWM 或归一化速度值）。Web 端会向下取整。
- 示例：`F\n`（前进）、`L,120\n`（左转，速度 120）、`S\n`（停止）。

> Web 端对下行指令做了 **约 60ms 节流**，避免高频刷屏；固件无需额外去抖。

### 4.2 分类标签广播

当 Web 端完成目标检测 / 模型推理后，会把"当前帧优先级最高的四分类驾驶决策"持续广播给小车，格式：

```
LBL:<LABEL>[|<SCORE>]\n
```

- `<LABEL>`：英文四分类标签之一（`Forward` / `Left` / `Right` / `Stop`）。
- `<SCORE>`（可选）：置信度，整数百分比 0–100。Web 端实际下发时会附带，例如 `LBL:Forward|88`。

示例：

```
LBL:Forward|88\n
LBL:Stop|95\n
LBL:Left|62\n
```

> 说明：本工程中广播标签统一使用 **英文四分类**（由决策映射而来）。固件如需中文标签，可对称处理（`前进`/`左`/`右`/`停`），但需与 Web 端约定一致。Web 端已内置中文→英文映射函数，确保下发内容为英文。

---

## 5. 上行协议（ESP32 → Web）

固件通过 RX 特征的 `notify` 上行小车遥测。Web 端 **兼容两种格式**，固件任选其一实现即可。

### 5.1 文本格式（推荐，简单）

```
BAT:<电量>|SPEED:<速度>|MODE:<模式>|ERR:<错误码>\n
```

字段说明：

| 字段 | 含义 | 取值范围 |
| --- | --- | --- |
| `BAT` | 电量百分比 | 0–100 |
| `SPEED` | 速度（任意单位） | 整数 |
| `MODE` | 控制模式 | `AUTO`（自动）或 `MANUAL`（手动） |
| `ERR` | 错误码 | 0 表示正常；非 0 由固件自定义 |

示例：

```
BAT:88|SPEED:0|MODE:MANUAL|ERR:0\n
BAT:76|SPEED:120|MODE:AUTO|ERR:0\n
```

> Web 端解析规则：按 `|` 分段，每段按 `键:值` 解析；缺失字段按默认值（0 / manual）处理；`MODE` 仅当值为 `AUTO` 时判定为自动模式。

### 5.2 JSON 格式（扩展）

```
{"bat":<电量>,"spd":<速度>,"mode":<模式>,"err":<错误码>}\n
```

示例：

```
{"bat":88,"spd":0,"mode":"manual","err":0}\n
```

> Web 端检测首字符为 `{` 时走 JSON 解析分支；`mode` 取值为 `"auto"` / `"manual"`。

---

## 6. 四分类标签映射表

Web 端与固件之间约定如下统一语义映射：

| 驾驶决策 | 运动指令（下行 CMD） | 英文标签（LBL 广播） | 中文标签 |
| --- | --- | --- | --- |
| 前进 | `F` | `Forward` | 前进 |
| 左转 | `L` | `Left` | 左 |
| 右转 | `R` | `Right` | 右 |
| 停止 | `S` | `Stop` | 停 |

决策优先级约定（Web 端推理时）：`Stop`（含行人 / 停车标志 / 红绿灯等必须停车场景）> `Left` / `Right`（避障转向）> `Forward`（默认通行）。

---

## 7. 连接状态机与重连

Web 端连接状态机：

```
idle → scanning → connecting → connected
                       │            │
                       ▼            ▼
                     error      disconnected（意外断线 → 指数退避自动重连）
```

- **扫描**：由用户手势触发 `requestDevice`（浏览器安全限制，必须由点击等用户操作发起）。
- **自动重连**：意外断开后，Web 端以指数退避（基数 1000ms，上限 10000ms）自动重连最近设备；用户主动断开则不再重连。
- **安全上下文**：Web Bluetooth 仅在 `https://` 或 `localhost` / `127.0.0.1` 下可用。

---

## 8. ESP32 固件实现要点（NimBLE / BluetoothSerial BLE UART）

以下为对接要点（伪代码，具体 API 取决于所用框架）：

1. **初始化 NUS 服务**：使用 NimBLE UART 示例（`ble_uart` / `bleuart`）或 `BluetoothSerial`（BLE 模式），注册表 2 中的服务与特征值 UUID。
2. **TX 特征**：配置为 `writeWithoutResponse`，并在回调中接收 Web 下行数据。
3. **RX 特征**：配置为 `notify`，定时或事件触发时推送遥测。
4. **下行解析示例（Arduino 风格）**：

   ```cpp
   void onRx(String line) {
     line.trim();
     if (line.startsWith("LBL:")) {
       // 分类标签广播：LBL:Forward|88
       String payload = line.substring(4);          // "Forward|88"
       String label = payload; int score = 0;
       int sep = payload.indexOf('|');
       if (sep >= 0) { label = payload.substring(0, sep); score = payload.substring(sep+1).toInt(); }
       applyDriveLabel(label, score);               // 决策（可选）
     } else if (line.length() >= 1) {
       char cmd = line[0];                           // F / L / R / S
       int speed = 0;
       int comma = line.indexOf(',');
       if (comma >= 0) speed = line.substring(comma+1).toInt();
       applyCommand(cmd, speed);                     // 驱动电机
     }
   }
   ```

5. **上行示例**：

   ```cpp
   String telem = "BAT:" + String(batteryPct) +
                  "|SPEED:" + String(speed) +
                  "|MODE:" + (autoMode ? "AUTO" : "MANUAL") +
                  "|ERR:" + String(errCode);
   bleUartNotify(telem + "\n");
   ```

6. **注意**：
   - 每条上行消息必须以 `\n` 结尾。
   - `MODE` 文本格式请用 `AUTO` / `MANUAL`（大写）。
   - 错误码 `ERR` 非 0 时，Web 端会在控制台展示，建议在固件侧定义清晰的错误码表。

---

## 9. 兼容性与约束

- 协议不自定义不兼容特征值，必须与 ESP32 NimBLE / BluetoothSerial BLE UART 固件匹配。
- Web 端对 `writeWithoutResponse` 与 `write` 均做了回退处理，固件只需支持其中一种即可。
- 标签广播与运动指令复用同一 TX 通道，靠前缀（`LBL:` vs 单字符）区分，固件须据此分流。
- 仅当 BLE 已连接时才下行指令 / 广播标签；未连接时 Web 端会自动切换为仿真模式（不发包）。

---

## 10. 消息速查表

| 方向 | 类型 | 格式 | 示例 |
| --- | --- | --- | --- |
| 下行 | 前进 | `F\n` | `F\n` |
| 下行 | 左转（带速度） | `L,<SPEED>\n` | `L,120\n` |
| 下行 | 停止 | `S\n` | `S\n` |
| 下行 | 标签广播 | `LBL:<LABEL>\|<SCORE>\n` | `LBL:Forward\|88\n` |
| 上行 | 文本遥测 | `BAT:x\|SPEED:x\|MODE:x\|ERR:x\n` | `BAT:88\|SPEED:0\|MODE:MANUAL\|ERR:0\n` |
| 上行 | JSON 遥测 | `{"bat":x,"spd":x,"mode":"x","err":x}\n` | `{"bat":88,"spd":0,"mode":"manual","err":0}\n` |
