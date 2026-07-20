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
