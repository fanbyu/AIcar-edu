// SPDX-License-Identifier: AGPL-3.0-or-later
export type KnowledgeTier = '基础' | '进阶' | '高阶';

export interface KnowledgeArticle {
  id: string;
  tier: KnowledgeTier;
  title: string;
  tag: string;
  summary: string;
  body: string[];
  /** 可交互可视化部件标识 */
  widget?: 'activation' | 'conv' | 'knn' | 'mlp';
}

export const knowledgeTiers: KnowledgeTier[] = ['基础', '进阶', '高阶'];

export const knowledgeArticles: KnowledgeArticle[] = [
  {
    id: 'what-is-ai',
    tier: '基础',
    title: '什么是人工智能与机器学习',
    tag: '概念',
    summary: '从「会计算的机器」到「会学习的机器」，理解 AI、机器学习与深度学习的关系。',
    body: [
      '人工智能（AI）是让机器模拟人类智能的科学。机器学习是 AI 的一个分支：不再手工编写规则，而是让机器从数据中自动总结规律。',
      '深度学习是机器学习的子集，使用多层神经网络，擅长处理图像、语音等复杂数据。本项目三种算法都属于机器学习/深度学习的范畴。',
    ],
  },
  {
    id: 'knn-basics',
    tier: '基础',
    title: 'K 近邻（KNN）算法',
    tag: '分类',
    summary: '最直观的分类算法：远的邻居不如近的邻居说话算数。',
    body: [
      'KNN 是一种「基于实例」的分类方法：要判断一个新样本的类别，就去看离它最近的 K 个已知样本，多数票决定类别。',
      '在本项目中，MobileNet 先把图片变成一串数字（特征向量），KNN 再比较这些向量之间的距离，从而把小车看到的画面分成「前进/左/右/停」。',
    ],
    widget: 'knn',
  },
  {
    id: 'activation',
    tier: '基础',
    title: '激活函数：让网络学会「弯曲」',
    tag: '神经网络',
    summary: '没有激活函数，神经网络就只是一根直尺。',
    body: [
      '神经网络由一层层神经元组成。如果每个神经元只是线性相加，再多层也等价于一条直线。',
      '激活函数（如 ReLU、Sigmoid、Tanh）给网络引入非线性，使它能拟合复杂的曲线与边界。拖动下方可交互曲线，观察不同激活函数形状。',
    ],
    widget: 'activation',
  },
  {
    id: 'conv-basics',
    tier: '进阶',
    title: '卷积：让机器「看见」图案',
    tag: 'CNN',
    summary: '卷积核像一个小窗口，在图像上滑动提取边缘、纹理等特征。',
    body: [
      '卷积运算用一个小的滤波器（卷积核）在图像上滑动，逐点相乘求和，得到特征图，从而检测边缘、角点等局部模式。',
      '多层卷积能由浅入深地提取从「边缘」到「车轮」再到「整辆车」的抽象特征。下方动画演示一个 3×3 卷积核的滑动过程。',
    ],
    widget: 'conv',
  },
  {
    id: 'mlp-basics',
    tier: '进阶',
    title: '多层感知机（MLP）',
    tag: '神经网络',
    summary: '把神经元叠成多层，配合反向传播学会复杂映射。',
    body: [
      'MLP 由输入层、若干隐藏层和输出层组成，每层全连接。训练时使用反向传播算法，根据误差不断调整连接权重。',
      '学习率决定每次调整的步幅：太大可能错过最优，太小则训练缓慢。隐藏层神经元数影响模型容量。',
    ],
    widget: 'mlp',
  },
  {
    id: 'transfer-learning',
    tier: '高阶',
    title: '迁移学习：站在 MobileNet 肩膀上',
    tag: '工程技巧',
    summary: '不必从零训练，复用预训练模型的特征提取能力。',
    body: [
      'MobileNet 在百万张图片上预训练过，已具备强大的通用视觉特征。我们把它「截断」，只取其特征输出，再接一个简单的分类器。',
      '这样只需很少的数据和算力，就能在小车上实现不错的识别效果——这正是本项目入门与进阶方案的核心思想。',
    ],
  },
  {
    id: 'cnn-build',
    tier: '高阶',
    title: '从零搭建 CNN',
    tag: 'CNN',
    summary: '卷积层、池化层、Dropout、全连接层的组合艺术。',
    body: [
      '一个典型的 CNN 由「卷积+激活+池化」的重复堆叠，最后用全连接层输出分类概率。',
      '池化层降低分辨率、减少计算；Dropout 随机丢弃部分神经元以防过拟合。高级训练器允许你自由组合这些积木。',
    ],
  },
];
