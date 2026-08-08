# 智能小车 AI 教育平台（smart-car-ai-edu）

一个基于浏览器、部署在 CloudBase 上的智能小车 AI 教学平台，面向中学信息技术 / 人工智能课程。
学生可在网页中完成：图像分类、目标检测（YOLO / COCO-SSD）、姿态识别、CNN/MLP/KNN 模型训练、
Python/JS 代码沙箱、蓝牙遥控小车仿真等实践活动，无需本地安装深度学习环境。

## 技术栈

- 前端：React 18 + Vite + TypeScript + Tailwind CSS
- AI 推理：TensorFlow.js、ONNX Runtime Web、Pyodide（浏览器内 Python）
- 模型：COCO-SSD、MobileNet、Pose Detection、YOLO（通过下载脚本获取权重）
- 后端 / 托管：CloudBase（@cloudbase/js-sdk）
- 状态管理：Zustand；本地持久化：IndexedDB

## 快速开始

```bash
npm install
npm run dev          # 本地开发
npm run build        # 生产构建
npm run preview      # 预览构建产物
```

模型权重通过以下脚本下载（下载后请勿提交进仓库，遵循各自原许可）：

```bash
npm run download:yolo-model
npm run download:yolo-world
```

## 部署与自定义域名

本项目部署在 **CloudBase 静态网站托管**（不是 CVM 云服务器）。生产构建产物 `dist/` 通过
CloudBase CLI 上传到环境 `cloud1-2gdgwiz697e3db93`（腾讯云账号 AppID `1304139990`）。

### 构建环境要求（重要）

构建工具链 **Vite 5 需要 Node 18+**。本机默认 `node` 是 v16，直接 `npm run build` 会报错：

```
TypeError: crypto$2.getRandomValues is not a function
```

解决方案（任选其一）：
- 使用本机已解压的 Node 22：`C:\Users\HP\.workbuddy\binaries\node\versions\22.22.2`
  （加到 PATH 最前面后，`node -v` 应为 v18+）；
- 或安装 Node 18+（推荐 nvm / nvm-windows 管理，`nvm use 20`）。

### 部署命令（「同步 / 发布」即指此步）

CloudBase CLI 的 `tcb` 未全局安装，用 `npx` 显式指定包运行（确保使用 Node 18+）：

```powershell
# 1) 切到 Node 18+ 的环境（本机示例）
$env:PATH = "C:\Users\HP\.workbuddy\binaries\node\versions\22.22.2;$env:PATH"

# 2) 构建
cd d:\实验室\智能小车边缘计算
npm run build

# 3) 上传到静态托管
npx -y -p @cloudbase/cli tcb hosting deploy dist -e cloud1-2gdgwiz697e3db93
```

部署后默认访问地址：
`https://cloud1-2gdgwiz697e3db93-1304139990.tcloudbaseapp.com/#/`
（HashRouter + `base='/'` 已适配根域名托管，代码无需改动。）

### 绑定自定义域名 fanscar.cn

1. **域名激活**：`fanscar.cn` 注册后注册局需 1–2 个工作日恢复，期间无法做 DNS 解析。
2. **ICP 备案（强制）**：`.cn` 必须完成 ICP 备案才能指向大陆节点（ap-shanghai），否则无法访问。
   在腾讯云备案系统提交（需实名已完成 + 托管环境 `cloud1-2gdgwiz697e3db93` + 主体信息），约 1–2 周，免费。
3. **控制台添加域名**：云开发控制台 → 环境 `cloud1-2gdgwiz697e3db93` → 静态网站托管 → 自定义域名 → 添加 `fanscar.cn`。
   控制台会给出一个 **CNAME 目标地址**。
4. **DNS 解析**：到 DNSPod（域名在腾讯云注册，DNS 默认在此）→ 给 `fanscar.cn` 加 CNAME 记录
   `@` → 第 3 步的目标（如需 `www` 也加一条）。
5. **证书签发**：CloudBase 自动校验域名所有权并签发 SSL 证书（需域名已激活且 DNS 生效，几分钟到几小时）。
6. 生效后访问 `http://fanscar.cn`（自动跳 HTTPS）。

> 注意：添加自定义域名 **不会删除** 默认域名 `*.tcloudbaseapp.com`，后者始终保留可用；
> 添加期间及之前请继续用默认域名访问。

## 开源协议

本项目采用 **GNU Affero General Public License v3.0（AGPL-3.0-or-later）**。

- 协议全文见仓库根目录 [`LICENSE`](./LICENSE)。
- 选择 AGPL 的原因：本项目以「在线 Web 服务」形式提供给用户使用。AGPL 在 GPL 基础上增加了
  **网络条款**——任何通过网络使用你修改后版本的人，都有权获得对应的完整源码。这保证了基于本项目的
  衍生产品（无论以何种形式分发或在线部署）都必须继续开源。
- 源码标识：所有 `src/**` 下的源文件均在文件头部带有
  `// SPDX-License-Identifier: AGPL-3.0-or-later` 标识。

### 关于预训练模型权重

本项目代码以 AGPL-3.0 授权，但**预训练模型权重不在此协议范围内**，它们遵循各自原项目的许可：

- YOLO / YOLO-World 权重：遵循 Ultralytics 相关许可（代码为 AGPL-3.0，权重另有声明）。
- COCO-SSD、MobileNet、Pose Detection 等 TensorFlow 预训练权重：遵循 TensorFlow 模型仓库各自声明。

仓库中仅保留权重下载脚本，权重文件本身不包含在版本库中。若你重新分发包含权重的产物，请自行核实
对应权重的许可要求。

## 贡献

欢迎提交 Issue 与 Pull Request。提交贡献即表示你同意以 AGPL-3.0-or-later 协议授权你的贡献。
## 作者

- 太原五中范保玉老师

## 致谢

- 本项目参考了上海松江区青少年综合实践教育中心 汤铭老师的网站、教学视频和书籍
- 感谢学校领导、老师和同学的支持与鼓励，希望这个项目为120年校庆献上一份礼物
- 感谢microblocks 线上分享会 （B站）
- TensorFlow.js、ONNX Runtime Web、Pyodide、CloudBase 等开源社区
- 祝贺西班牙夺冠

---

## 部署记录

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-08-08 | 重新部署 | 构建产物 `dist/`（70 个文件）上传至 CloudBase 静态托管，环境 `cloud1-2gdgwiz697e3db93` |
| 2026-08-08 | 重新部署 | 构建产物 `dist/`（73 个文件）上传至 CloudBase 静态托管：含 YOLO 训练模型(yolo-trained)、COCO-SSD、YOLO-World ort-web wasm 运行时、Pyodide；含 YOLO 避障 + MLP 巡线融合页面(`/teaching/yolo`) |

**部署资源：**
- 静态托管（Hosting）：`cloud1-2gdgwiz697e3db93`
- 前端访问地址：`https://cloud1-2gdgwiz697e3db93-1304139990.tcloudbaseapp.com/#/`
- 使用的 CloudBase SDK：`@cloudbase/js-sdk`（匿名登录，无云函数/数据库依赖）

**部署方式说明：** 本项目为纯前端 SPA，通过 IDE 内置 CloudBase 集成上传 `dist/` 到静态网站托管，等效于 `tcb hosting deploy dist -e cloud1-2gdgwiz697e3db93`。
