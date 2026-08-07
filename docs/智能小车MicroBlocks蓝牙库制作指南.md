# 智能小车 MicroBlocks 蓝牙库（ESP32）制作指南

> 目标：把《蓝牙与 ESP32 固件对接协议》封装成一个 **MicroBlocks 库**，让中小学生用图形积木即可让 ESP32 小车与网页（localhost:5173）通信，无需关心文本行协议细节。
> 适用平台：ESP32（需刷入带 BLE 的 MicroBlocks 固件）

---

## 0. 结论先行（为什么可行）

MicroBlocks 官方自带 **BLE Serial** 库（在 `Network` 分类的额外库中），它让微控制器作为 **BLE 外设（Peripheral）**，并默认提供 **Nordic UART Service**：

| 项目 | UUID |
| --- | --- |
| 服务 | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` |
| RX 特征（Web→小车，可写） | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` |
| TX 特征（小车→Web，notify） | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` |

这组 UUID 与《蓝牙与 ESP32 固件对接协议》**逐字一致**。也就是说：

> 小车只要刷上 MicroBlocks + BLE Serial，上电即自动广播 NUS 服务；网页端在 `localhost` 下用 Web Bluetooth 即可直接扫描连接，**Web 端代码一行都不用改**。

我们要做的"库"，是在 BLE Serial 之上再封装一层，把协议文本（`F/L/R/S`、`LBL:Forward|88`、`BAT:...|...`）变成学生易懂的积木。

---

## 1. 底层积木：BLE Serial 库（先了解，不必改）

| 积木 | 作用 |
| --- | --- |
| `BLE Serial Connected` | 布尔，是否已连接 |
| `BLE Serial Read String` | 读入下行字符串（RX），通常读后清空接收缓冲 |
| `BLE Serial Read Bytes` | 读入下行字节数组 |
| `BLE Serial Write (text)` | 上行字符串（TX，notify 给 Web） |

注意：BLE Serial **不会自动按行切分**，它给的是原始字节流。我们的协议以 `\n` 分帧，因此封装库内部必须自己维护行缓冲、按 `\n` 逐帧解析——这正是封装库的价值。

---

## 2. 我们要做的库：`智能小车蓝牙`（CarBLE）

### 2.1 积木清单（建议中英文双标签）

**A. 连接状态**
- `蓝牙已连接？` → 直接包装 `BLE Serial Connected`（布尔）

**B. 接收（事件帽块 + 报告块）**
- `当收到小车指令` —— 帽块（事件），Web 下发 `F/L/R/S` 时触发
- `小车指令` —— 报告块，返回 `F`/`L`/`R`/`S` 之一
- `指令速度` —— 报告块，返回速度整数（无速度时为 0）
- `当收到分类标签` —— 帽块（事件），Web 下发 `LBL:...` 时触发
- `分类标签` —— 报告块，返回 `Forward`/`Left`/`Right`/`Stop`
- `标签置信度` —— 报告块，返回 0–100 整数

**C. 发送（上行给 Web）**
- `发送小车遥测 电量[ ] 速度[ ] 模式[auto/manual] 错误码[ ]` —— 命令块，封装为 `BAT:..|SPEED:..|MODE:..|ERR:..\n`
- `发送标签广播 标签[ ] 置信度[ ]` —— 命令块（可选，供小车反向广播检测标签），封装为 `LBL:..|..\n`
- `发送文本` —— 命令块，直接包装 `BLE Serial Write`（高级用户用）

---

## 3. 库内部实现（脚本逻辑）

### 3.1 内部变量（库私有，学生不可见）
```
carBuf      : 行缓冲字符串（累积未处理数据）
carCmd      : 最近一次指令字符 F/L/R/S
carSpeed    : 最近指令速度
carLabel    : 最近标签 Forward/Left/Right/Stop
carScore    : 最近标签置信度
```

### 3.2 内部常驻解析循环（库自带 `when started` 脚本，加载即运行）
用伪积木描述逻辑：

```
when started:
  forever:
    if BLE Serial Connected:
      set s = BLE Serial Read String
      if s ≠ "":
        set carBuf = join carBuf s
        // 按换行逐帧切分
        repeat until (carBuf 中不含 "\n"):
          set line = 取 carBuf 中第一个 "\n" 之前的部分
          set carBuf = 去掉该行及换行符
          调用 解析一行(line)
```

```
定义 解析一行(line):
  set line = trim(line)
  if line 以 "LBL:" 开头:
    set body = line 去掉前 4 字符        // "Forward|88"
    set carLabel = body 中 "|" 之前部分
    set carScore = (body 中 "|" 之后部分) 转为数字
    broadcast "carLabelReceived"          // 触发 当收到分类标签
  else if line 长度 ≥ 1:
    set carCmd = line 第 1 个字符         // F/L/R/S
    set carSpeed = 0
    if line 含 ",":
      set carSpeed = ("," 之后部分) 转为数字
    broadcast "carCmdReceived"            // 触发 当收到小车指令
```

> 说明：MicroBlocks 没有原生的"库自定义事件帽块"语法，最稳妥的做法是用**广播（broadcast）**：库内部解析到帧时 `broadcast "carCmdReceived"` / `broadcast "carLabelReceived"`；再向学提供两个帽块 `当收到小车指令` = `when I receive carCmdReceived`、`当收到分类标签` = `when I receive carLabelReceived`（库导出时带上这两个消息名即可，学生看到的是中文标签）。

### 3.3 各积木脚本
```
定义 小车指令:        report carCmd
定义 指令速度:        report carSpeed
定义 分类标签:        report carLabel
定义 标签置信度:      report carScore
定义 蓝牙已连接？:    report BLE Serial Connected

定义 发送小车遥测 电量 bat 速度 spd 模式 mode 错误码 err:
  set m = (mode = "auto") ? "AUTO" : "MANUAL"
  set s = join "BAT:" bat "|SPEED:" spd "|MODE:" m "|ERR:" err
  BLE Serial Write (join s "\n")

定义 发送标签广播 标签 label 置信度 score:
  BLE Serial Write (join "LBL:" label "|" score "\n")

定义 发送文本 text:
  BLE Serial Write text
```

---

## 4. 在 MicroBlocks IDE 中创建本库（操作步骤）

1. **准备固件**：给 ESP32 刷入带 BLE 的 MicroBlocks 固件（官方 ESP32 固件已含 BLE）。
2. **加载底层库**：菜单 `Library` → 找到 **BLE Serial**（Network 分类），加载。
3. **新建自定义积木**：菜单 `Make a block`，按第 2.1 节逐个创建积木，并选择类型（命令 / 报告 / 帽子）。
   - 两个帽子块选择 "hat"（当…时），其脚本体分别为 `when I receive carCmdReceived` / `when I receive carLabelReceived`。
4. **写脚本**：在积木定义里按第 3 节填入逻辑；把 `when started + forever` 解析循环也放进项目（它会随库一起导出）。
5. **保存为库**：菜单 `Library` → `Save Library...`，命名为 `智能小车蓝牙`（文件名 `car-ble.ubl`）。
   - `.ubl` 是 MicroBlocks 的库二进制格式，包含积木定义 + 脚本 + 广播消息名。
6. **（可选）共享**：把 `.ubl` 提交到 MicroBlocks 官方库仓库（`smallvm` 的 `ide/libraries` 目录）或放入本地库目录，供全班加载。

---

## 5. 学生使用示例

### 示例 1：收到网页指令，驱动小车（接电机）
```
当收到小车指令:
  如果 小车指令 = "F": 设置电机 前进
  如果 小车指令 = "L": 设置电机 左转
  如果 小车指令 = "R": 设置电机 右转
  如果 小车指令 = "S": 设置电机 停止

forever:
  如果 蓝牙已连接？:
    发送小车遥测 电量(读电量) 速度(读速度) 模式 "manual" 错误码 0
```

### 示例 2：收到网页的分类标签，做灯光提示
```
当收到分类标签:
  如果 分类标签 = "Stop": 点亮红色 LED
  否则: 点亮绿色 LED
```

> 网页端在 `localhost:5173` 的「自动驾驶决策 / Playground」页连接小车后，会持续下发 `F/L/R/S` 与 `LBL:Forward|xx`；小车侧上述积木即可实时响应。

---

## 6. 分发与加载（给学生）

- **加载库**：学生打开 MicroBlocks → `Library` → `Load Library from file...` → 选择 `car-ble.ubl`（需先加载底层 **BLE Serial** 库）。
- **依赖说明**：本库依赖 BLE Serial；若学生未加载，IDE 会在用到相关积木时提示缺失。可在库说明里写明"先加载 BLE Serial"。
- **兼容性**：ESP32 全系（ESP32 / ESP32-S3 等）均可；micro:bit v2 等其他支持 BLE 的板子也能用同一套积木（但本工程面向小车，建议用 ESP32）。

---

## 7. 注意事项 / FAQ

1. **设备名**：BLE Serial 库自动广播，设备名通常为板子默认名（如 `ESP32`）。Web 端过滤条件为 `namePrefix: 'ESP32'` 或 NUS 服务，因此建议保持 ESP32 默认名或确保名称以 `ESP32` 开头，便于网页扫描发现。
2. **MTU 与分片**：BLE 单包默认约 20 字节（BLE 4.0/4.1），BLE 4.2+ 可达 244 字节。我们的帧都很短（`F\n`、`LBL:Forward|88\n`、遥测行约 30 字节），一般无需处理分片；库的行缓冲已能跨包重组。
3. **缓冲策略**：`BLE Serial Read String` 读出的是累积文本，库内部必须以 `\n` 切分，不能假设一次读就是一整帧。
4. **模式字段**：上行遥测文本格式的 `MODE` 用大写 `AUTO`/`MANUAL`（Web 端解析规则），JSON 格式用 `"auto"`/`"manual"`。本库默认发文本格式。
5. **无需改 Web 端**：因为 UUID 与协议完全一致，小车侧换成 MicroBlocks 后，网页无需任何改动即可连接通信。

---

## 8. 与协议文档的对应关系

| 协议文档条款 | 本库对应积木 |
| --- | --- |
| 下行 `F/L/R/S[,\<speed>]` | `当收到小车指令` + `小车指令` + `指令速度` |
| 下行 `LBL:<label>\|<score>` | `当收到分类标签` + `分类标签` + `标签置信度` |
| 上行文本遥测 `BAT\|SPEED\|MODE\|ERR` | `发送小车遥测` |
| 上行 JSON 遥测（可选） | 暂未封装，可用 `发送文本` 自行拼接 |
| NUS UUID / 外设广播 | 由 BLE Serial 库自动完成 |
