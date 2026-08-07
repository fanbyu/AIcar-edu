# 蓝牙服务 UUID 备忘

> 适用范围：智能小车（ESP32 + MicroBlocks BLE 固件，串口透传）
> 维护人：开发
> 最后更新：2026-07-22

---

## 一、速查表（真实值）

小车运行 **MicroBlocks BLE** 固件，GATT 拓扑与官方参考页一致：

| 项目 | UUID | 说明 |
| --- | --- | --- |
| **服务 (Service)** | `bb37a001-b922-4018-8e74-e14824b3a638` | MicroBlocks BLE 服务，**连接时 `getPrimaryService` 要用的就是它** |
| **写特征 (RX)** | `bb37a002-b922-4018-8e74-e14824b3a638` | 板子接收命令，主机（浏览器/手机）写入 |
| **读特征 (TX)** | `bb37a003-b922-4018-8e74-e14824b3a638` | 板子上送遥测，主机通过 `notify` 读取 |

下行指令统一封装为 MicroBlocks 广播帧，广播名为单词：

- `go`（前进）/ `left`（左转）/ `right`（右转）/ `stop`（停止）
- 另支持：`back`（后退）/ `kick`（踢）

代码位置：`src/features/bluetooth/esp32Protocol.ts`
（服务名别名 `NUS_SERVICE`、`MICROBLOCKS_SERVICE` 均指向同一值，扫描过滤与连接复用该值。）

---

## 二、踩坑记录（重要）

**曾误把服务 UUID 写成 `bb370000-…`（步长 `000` 而非 `a001`）。**

后果：浏览器 `requestDevice({ namePrefix: 'MicroBlocks' })` 能匹配到设备、连接成功，
但 `getPrimaryService('bb370000-…')` 报错：

```
No Services matching UUID bb370000-b922-4018-8e74-e14824b3a638 found in Device.
```

连接成功 ≠ 服务存在。设备名匹配只说明"连上了设备"，服务/特征要靠 UUID 再去找。

**正确值：`bb37a001-…`（特征 `a002` / `a003`）。已修复并部署。**

排查要点：报错 "No Services matching UUID" 时，优先确认服务 UUID 写对了，
而不是去改设备名过滤或重连逻辑。

---

## 三、概念解释

### 1. UUID 是什么

**UUID = 通用唯一标识符（Universally Unique IDentifier）**，是一个 128 位（16 字节）
的数字，标准写成 8-4-4-4-12 的十六进制形式：

```
bb37a001 - b922 - 4018 - 8e74 - e14824b3a638
 时间低位   时间中位 版本 变体   节点
```

- 作用：在没有任何中央协调的情况下，给"某样东西"一个**全球唯一**的名字，
  让双方无需事先约定字符串就能对得上号。
- 蓝牙里一切可寻址对象（服务、特征、描述符）都用 128 位 UUID 标识。

### 2. 为什么蓝牙大量用 16 位短 UUID

完整 128 位太长。蓝牙 SIG 定义了**基础 UUID**：

```
0000XXXX-0000-1000-8000-00805F9B34FB
```

所有蓝牙官方服务/特征都长这样，只有 `XXXX` 这 16 位不同。
所以官方服务（如 Nordic UART Service / 心率服务）常被写成短形式 `0x6E40`、`0x180D`。

本项目小车用的是 **MicroBlocks 自定义的 128 位 UUID**（不是 16 位短号），
所以必须写完整 128 位，不能省略成 `bb37a001`。

### 3. GATT 层级模型

BLE 设备用 **GATT（Generic Attribute Profile，通用属性规范）** 组织数据，层级如下：

```
设备 (Device / Peripheral)
 └─ 服务 (Service)            ← 按 UUID 找，例如本项目的 bb37a001
     └─ 特征 (Characteristic) ← 按 UUID 找，例如 a002(写) / a003(读)
         └─ 描述符 (Descriptor)（可选，描述单位、范围等）
```

- **服务（Service）**：一组相关功能的集合。一辆车可能有"驱动服务""电池服务"等。
- **特征（Characteristic）**：服务下真正读写数据的端点，有"读/写/通知"等属性。
  - **写（Write）**：主机 → 设备（下发 `go/left/...`）
  - **读 + 通知（Notify）**：设备 → 主机（上送遥测）
- **描述符（Descriptor）**：修饰特征，比如开启 `CCCD`（Client Characteristic
  Configuration Descriptor）来订阅 `notify`。

### 4. 连接流程（浏览器 Web Bluetooth）

```js
// 1. 扫描并选择设备（按设备名前缀过滤）
const device = await navigator.bluetooth.requestDevice({
  filters: [{ namePrefix: 'MicroBlocks' }],
  optionalServices: ['bb37a001-b922-4018-8e74-e14824b3a638'], // 必须声明要用的服务
});

// 2. 建立 GATT 连接
const server = await device.gatt.connect();

// 3. 拿到服务（这里用完整 128 位 UUID）
const service = await server.getPrimaryService('bb37a001-b922-4018-8e74-e14824b3a638');

// 4. 拿到特征
const rx = await service.getCharacteristic('bb37a002-b922-4018-8e74-e14824b3a638'); // 写
const tx = await service.getCharacteristic('bb37a003-b922-4018-8e74-e14824b3a638'); // 读/notify

// 5. 下发命令（写特征）
await rx.writeValue(new TextEncoder().encode('go'));
```

> 要点：`requestDevice` 的 `filters` 决定能不能选到设备；`optionalServices`
> 决定连上后能不能访问该服务；两者 UUID 都必须与设备广播/声明的完全一致。

### 5. 广播名 vs 服务 UUID（易混）

- **设备名（如 `MicroBlocks`）**：在广播包里，用于"发现/选择"设备，由 `namePrefix` 过滤。
- **服务 UUID（如 `bb37a001-…`）**：设备连上后，在服务数据库里，用于"定位服务"。
- 二者是不同层面的标识，浏览器流程里都要正确，缺一不可。

---

## 四、变更记录

- 2026-07-22：将服务 UUID 由误写的 `bb370000-…` 修正为真实值 `bb37a001-…`（特征 `a002`/`a003`），
  已 `npm run build` 并同步至腾讯云 CloudBase 静态托管。
