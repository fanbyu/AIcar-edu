// SPDX-License-Identifier: AGPL-3.0-or-later
// 第四级「拓展」关卡：与检测引擎无关的“决策 + 讲解”逻辑。
// 实际的检测推理已抽到 src/features/train/detectors（coco-ssd / yolov8 / yolo-world），
// 本文件只负责把检测结果映射成小车驾驶指令，以及生成无模型依赖的示例场景。
import { DRIVE_CLASS_CMD, DRIVE_CLASS_ZH } from '@/content/trainedYoloModels';
import type { DetectedObject, DrivingDecision } from './detectors/types';

export type { DetectedObject, DrivingDecision } from './detectors/types';

// COCO 80 类英文 → 中文（只翻译课堂常用、与小车相关的类别，其余回退到英文）。
// 同时作为 YOLO-World 用“英文提示词”时的中文显示名。
const ZH: Record<string, string> = {
  person: '人',
  bicycle: '自行车',
  car: '汽车',
  motorcycle: '摩托车',
  bus: '公交车',
  train: '火车',
  truck: '卡车',
  boat: '船',
  'traffic light': '红绿灯',
  'fire hydrant': '消防栓',
  'stop sign': '停车标志',
  'parking meter': '停车计时器',
  bench: '长椅',
  bird: '鸟',
  cat: '猫',
  dog: '狗',
  horse: '马',
  sheep: '羊',
  cow: '牛',
  elephant: '大象',
  bear: '熊',
  zebra: '斑马',
  giraffe: '长颈鹿',
  backpack: '背包',
  umbrella: '雨伞',
  handbag: '手提包',
  suitcase: '行李箱',
  bottle: '瓶子',
  cup: '杯子',
  'sports ball': '球',
  frisbee: '飞盘',
  skateboard: '滑板',
  surfboard: '冲浪板',
  'tennis racket': '网球拍',
  chair: '椅子',
  couch: '沙发',
  'potted plant': '盆栽',
  bed: '床',
  'dining table': '餐桌',
  toilet: '马桶',
  tv: '电视',
  laptop: '笔记本电脑',
  mouse: '鼠标',
  remote: '遥控器',
  keyboard: '键盘',
  'cell phone': '手机',
  book: '书',
  clock: '时钟',
  vase: '花瓶',
  scissors: '剪刀',
  'teddy bear': '泰迪熊',
  banana: '香蕉',
  apple: '苹果',
  orange: '橘子',
  broccoli: '西兰花',
  carrot: '胡萝卜',
  pizza: '披萨',
  cake: '蛋糕',
  'hair drier': '吹风机',
  toothbrush: '牙刷',
};

export function toZh(english: string): string {
  return DRIVE_CLASS_ZH[english] ?? ZH[english] ?? english;
}

// 高优先级“必须立刻停下”的类别（人、停车标志、红绿灯等）。
const MUST_STOP = new Set(['person', 'stop sign', 'traffic light']);
// 视为“障碍物”的车辆 / 骑行类（用于绕行判断）。
const OBSTACLE = new Set([
  'car',
  'truck',
  'bus',
  'motorcycle',
  'bicycle',
  'train',
  'boat',
  'bench',
  'chair',
  'couch',
  'potted plant',
  'suitcase',
  'backpack',
  'umbrella',
  'dog',
  'cat',
]);

/**
 * 把一帧的检测结果转成小车的驾驶指令。
 * 约定：画面正中央 = 小车正前方；框越大 = 离得越近（越危险）。
 */
export function decideDriving(
  detections: DetectedObject[],
  frameW: number,
  frameH: number
): DrivingDecision {
  const centerX = frameW / 2;
  // 用框的高度占画面的比例粗略估计“距离远近”，超过阈值算“很近”。
  const closeRatio = 0.18;

  // 0) 同学训练的封闭词汇（ting/zuo/qian/you）：检测类名即驾驶指令，取最高分框。
  const driveHits = detections
    .filter((d) => DRIVE_CLASS_CMD[d.className] != null && d.score >= 0.25)
    .sort((a, b) => b.score - a.score);
  if (driveHits.length > 0) {
    const top = driveHits[0];
    const command = DRIVE_CLASS_CMD[top.className]!;
    const labelZh =
      command === 'S' ? '停车' : command === 'F' ? '前进' : command === 'L' ? '左转' : '右转';
    return {
      command,
      labelZh,
      reason: `训练模型识别到「${top.labelZh}」（置信度 ${Math.round(top.score * 100)}%），按标注语义控车。`,
      trigger: top,
      source: 'drive-class',
    };
  }

  // 1) 高优先级目标：人 / 停车标志 / 红绿灯 —— 只要离得够近就停车。
  const mustStopHit = detections.find(
    (d) => MUST_STOP.has(d.className) && d.bbox[3] / frameH > closeRatio
  );
  if (mustStopHit) {
    return {
      command: 'S',
      labelZh: '停车',
      reason: `正前方出现“${mustStopHit.labelZh}”且距离很近，必须立刻停下确保安全。`,
      trigger: mustStopHit,
      source: 'obstacle',
    };
  }

  // 2) 找最靠近画面中心、且较近的障碍物。
  const obstacles = detections
    .filter((d) => OBSTACLE.has(d.className) && d.bbox[3] / frameH > 0.08)
    .map((d) => ({ d, cx: d.bbox[0] + d.bbox[2] / 2 }))
    .sort((a, b) => Math.abs(a.cx - centerX) - Math.abs(b.cx - centerX));

  if (obstacles.length === 0) {
    return {
      command: 'F',
      labelZh: '前进',
      reason: '正前方没有障碍物，安全前进。',
      clearPath: true,
      source: 'obstacle',
    };
  }

  const nearest = obstacles[0];
  const boxCenterX = nearest.cx;
  const margin = frameW * 0.12; // 中央安全带宽度

  if (Math.abs(boxCenterX - centerX) <= margin) {
    return {
      command: 'S',
      labelZh: '停车',
      reason: `障碍物“${nearest.d.labelZh}”正挡在路中央，先停下再判断。`,
      trigger: nearest.d,
      source: 'obstacle',
    };
  }
  if (boxCenterX < centerX) {
    // 障碍在左 → 向右绕开
    return {
      command: 'R',
      labelZh: '右转',
      reason: `左侧有“${nearest.d.labelZh}”，向右转绕开它。`,
      trigger: nearest.d,
      source: 'obstacle',
    };
  }
  // 障碍在右 → 向左绕开
  return {
    command: 'L',
    labelZh: '左转',
    reason: `右侧有“${nearest.d.labelZh}”，向左转绕开它。`,
    trigger: nearest.d,
    source: 'obstacle',
  };
}

/**
 * 合成一张“街景示例”图 + 预置检测框，用于无摄像头 / 无网络时讲解 YOLO 的输出格式。
 * 不依赖模型推理，框是预设的，和画面对应。
 */
export function buildDemoScene(): {
  canvas: HTMLCanvasElement;
  detections: DetectedObject[];
} {
  const W = 480;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 天空 + 地面 + 马路
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#bfe3ff');
  sky.addColorStop(1, '#eaf6ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6b7280'; // 马路
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  ctx.strokeStyle = '#fde047'; // 中线虚线
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(0, H * 0.82);
  ctx.lineTo(W, H * 0.82);
  ctx.stroke();
  ctx.setLineDash([]);

  // 左侧停着一辆车
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(60, 180, 110, 60);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(72, 150, 86, 34);

  // 右侧一个停车标志（红圈）
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(380, 150, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('停', 380, 158);

  // 中间偏左站着一个人
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(212, 196, 18, 46); // 身体
  ctx.beginPath();
  ctx.arc(221, 188, 11, 0, Math.PI * 2); // 头
  ctx.fillStyle = '#fde68a';
  ctx.fill();

  const detections: DetectedObject[] = [
    { bbox: [60, 150, 110, 90], className: 'car', labelZh: '汽车', score: 0.92 },
    { bbox: [354, 124, 52, 52], className: 'stop sign', labelZh: '停车标志', score: 0.97 },
    { bbox: [210, 177, 22, 65], className: 'person', labelZh: '人', score: 0.88 },
  ];

  return { canvas, detections };
}
