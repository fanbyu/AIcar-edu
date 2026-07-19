// SPDX-License-Identifier: AGPL-3.0-or-later
export type Difficulty = '入门' | '进阶' | '高级' | '拓展';

export interface Course {
  id: string;
  level: 'knn' | 'mlp' | 'cnn' | 'yolo' | 'tm';
  title: string;
  difficulty: Difficulty;
  summary: string;
  hours: number;
  gpu: '低' | '中' | '高';
  minSamples: number;
  highlights: string[];
}

export const courses: Course[] = [
  {
    id: 'knn',
    level: 'knn',
    title: 'MobileNet + KNN 四分类',
    difficulty: '入门',
    summary:
      '用 MobileNet 抽取图像特征，再用最邻近算法做「前进/左转/右转/停止」四分类。只需用手机/摄像头采集几十张图即可训练，零基础也能玩。',
    hours: 2,
    gpu: '低',
    minSamples: 10,
    highlights: ['少量图片即可训练', '无需调参', '实时推理', '适合课堂演示'],
  },
  {
    id: 'tm',
    level: 'tm',
    title: 'AI训练平台',
    difficulty: '入门',
    summary:
      '冻结 MobileNet 负责特征提取，顶部叠加可训练分类头，在浏览器内用迁移学习训练专属图像分类器。支持采集样本、训练、实时推理与模型导出。',
    hours: 3,
    gpu: '低',
    minSamples: 10,
    highlights: ['迁移学习', '浏览器内训练', '模型导出', '通用图像分类'],
  },
  {
    id: 'mlp',
    level: 'mlp',
    title: 'MobileNet + MLP 多层感知机',
    difficulty: '进阶',
    summary:
      '在 MobileNet 特征之上叠加多层感知机（MLP），可调节学习率、隐藏层神经元数等超参数，训练快、效果更稳，适合初高中深入。',
    hours: 4,
    gpu: '中',
    minSamples: 30,
    highlights: ['可调超参数', '训练可视化', '理解神经网络', '泛化更好'],
  },
  {
    id: 'cnn',
    level: 'cnn',
    title: '自定义 CNN 卷积网络',
    difficulty: '高级',
    summary:
      '从零搭建卷积神经网络，理解卷积、池化、全连接。每类需 200+ 张图，算力要求高，是通往真实深度学习的关卡。',
    hours: 8,
    gpu: '高',
    minSamples: 200,
    highlights: ['从零搭建', '理解卷积', '高算力需求', '成果最接近真实 AI'],
  },
  {
    id: 'yolo',
    level: 'yolo',
    title: 'YOLO 目标检测与自动驾驶',
    difficulty: '拓展',
    summary:
      '升级到“目标检测”：不仅要认出物体，还要在画面里框出位置。用浏览器端实时检测模型 coco-ssd（与 YOLO 同族），把“人 / 汽车 / 红绿灯”检测结果直接变成小车的避障指令。',
    hours: 3,
    gpu: '低',
    minSamples: 0,
    highlights: ['无需训练即用', '实时框选', '检测→决策', '关联 YOLO 思想'],
  },
];

export const difficultyColor: Record<Difficulty, string> = {
  入门: 'bg-emerald-100 text-emerald-700',
  进阶: 'bg-amber-100 text-amber-700',
  高级: 'bg-rose-100 text-rose-700',
  拓展: 'bg-purple-100 text-purple-700',
};
