/** 拓展关可一键加载的本地训练模型（来自 yolo数据，已复制到 public/models/yolo-trained） */

export interface TrainedYoloModel {
  id: string;
  name: string;
  description: string;
  /** 相对站点根路径 */
  url: string;
  /** 与训练时 classes.txt 顺序一致 */
  classes: string[];
  classesZh: string[];
}

export const TRAINED_YOLO_MODELS: TrainedYoloModel[] = [
  {
    id: 'zhao-best',
    name: '赵数据 · best.onnx',
    description: '标注训练的 YOLOv8 检测模型：停 / 左 / 前 / 右',
    url: `${import.meta.env.BASE_URL}models/yolo-trained/zhao-best.onnx`,
    classes: ['ting', 'zuo', 'qian', 'you'],
    classesZh: ['停', '左', '前', '右'],
  },
  {
    id: 'hao-best',
    name: '郝数据 · best.onnx',
    description: '标注训练的 YOLOv8 检测模型：停 / 左 / 前 / 右',
    url: `${import.meta.env.BASE_URL}models/yolo-trained/hao-best.onnx`,
    classes: ['ting', 'zuo', 'qian', 'you'],
    classesZh: ['停', '左', '前', '右'],
  },
];

/** 拼音/英文类名 → 中文 */
export const DRIVE_CLASS_ZH: Record<string, string> = {
  ting: '停',
  zuo: '左',
  qian: '前',
  you: '右',
  停: '停',
  左: '左',
  前: '前',
  右: '右',
  stop: '停',
  left: '左',
  forward: '前',
  go: '前',
  right: '右',
};

/** 检测类名 → 小车指令 */
export const DRIVE_CLASS_CMD: Record<string, 'F' | 'L' | 'R' | 'S'> = {
  ting: 'S',
  zuo: 'L',
  qian: 'F',
  you: 'R',
  停: 'S',
  左: 'L',
  前: 'F',
  右: 'R',
  stop: 'S',
  left: 'L',
  forward: 'F',
  go: 'F',
  right: 'R',
};
