// SPDX-License-Identifier: AGPL-3.0-or-later
export type KnowledgeLevel = '基础' | '进阶' | '高阶';
export type WidgetId =
  | 'activation'
  | 'step'
  | 'perceptron'
  | 'xor'
  | 'conv'
  | 'knn'
  | 'cosine'
  | 'regression'
  | 'lane'
  | 'softmax'
  | 'mlp'
  | 'yolo';

export interface KnowledgeArticle {
  id: string;
  title: string;
  level: KnowledgeLevel;
  summary: string;
  minutes: number;
  interactive: boolean;
  hasGraphic: boolean;
  goals: string[];
  carLink: string;
  sections: { heading: string; paragraphs: string[] }[];
  tip?: string;
  relatedTeaching: string[];
  widget?: WidgetId;
}

export const AI_KNOWLEDGE: KnowledgeArticle[] = [
  {
    id: 'ai-basics',
    title: 'AI 与机器学习概述',
    level: '基础',
    summary: '用一句话说清「什么是 AI / 机器学习 / 深度学习」，并给出本专区学习地图。',
    minutes: 6,
    interactive: false,
    hasGraphic: false,
    goals: ['能区分 AI、ML、DL 三者的包含关系', '知道智能小车用到哪类方法', '找到自己该从哪篇读起'],
    carLink: '小车看到前方有障碍 → 调用一个「避障模型」输出「停止/左转」；这个模型就是 ML 训练出来的。',
    sections: [
      {
        heading: '一句话区分',
        paragraphs: [
          '人工智能（AI）是让机器「像人一样完成任务」的大目标；机器学习（ML）是实现 AI 的一种方法——不让程序员写死规则，而是让程序从数据中自动总结规律；深度学习（DL）是 ML 里用「多层神经网络」的一类方法，适合图像、语音等复杂数据。',
          '关系就像：AI ⊃ ML ⊃ DL。智能小车主要用到 ML，其中图像识别（YOLO）用 DL，巡线/避障决策用经典 ML 或规则即可。',
        ],
      },
      {
        heading: '本专区地图',
        paragraphs: [
          '基础篇讲「单个神经元如何工作」（激活函数、阶跃、感知机）；进阶篇讲「怎么组合成网络」（卷积、KNN、余弦、回归）；高阶篇讲「怎么在小车上落地」（Softmax 决策、MLP 训练、YOLO 检测）。',
          '每篇都配一个可拖拽/可调参的小组件，建议边读边玩。',
        ],
      },
    ],
    tip: '记不住概念时，先看底部「推荐学习路径」，按难度从低到高点一遍就能串起来。',
    relatedTeaching: ['activation', 'step', 'perceptron'],
  },
  {
    id: 'activation',
    title: '激活函数：神经网络的开关',
    level: '基础',
    summary: 'ReLU / Sigmoid / Tanh 怎么把「加权和」变成非线性输出，为什么不能没有它。',
    minutes: 8,
    interactive: true,
    hasGraphic: true,
    goals: ['看懂 Sigmoid/Tanh/ReLU 曲线形状', '理解「没有激活 = 永远是直线」', '知道小车用 ReLU 最多'],
    carLink: '小车神经网络最后一层把摄像头特征变成「前进概率」，中间层几乎都用 ReLU 提特征。',
    sections: [
      {
        heading: '为什么需要激活',
        paragraphs: [
          '神经元先算加权和 z = w·x + b，如果直接输出 z，那么无论叠多少层，整体仍是「直线变换」，学不了弯道、人形这种弯曲边界。激活函数给网络加入「弯曲能力」。',
          'Sigmoid 把输出压到 (0,1)，适合表示概率；Tanh 压到 (-1,1)，中心对称；ReLU 是 max(0,z)，计算快、不容易梯度消失，是现在最常用的默认选择。',
        ],
      },
      {
        heading: '小车怎么用',
        paragraphs: [
          '图像特征提取网络（CNN）几乎每层后接 ReLU；最后做「前进/停止」二分类时，才在输出层用 Sigmoid 把分数变成概率。',
          '动手试试右边组件：把输入从负拖到正，看 ReLU 怎么「负数全掐断、正数原样通过」。',
        ],
      },
    ],
    tip: 'ReLU 在 x<0 时梯度为 0，可能「神经元死亡」；小车项目里一般问题不大，不必深究。',
    relatedTeaching: ['step', 'perceptron'],
    widget: 'activation',
  },
  {
    id: 'step',
    title: '阶跃函数与阈值决策',
    level: '基础',
    summary: '最朴素的「开关」：超过阈值输出 1，否则 0。它是激活函数的老祖宗。',
    minutes: 5,
    interactive: true,
    hasGraphic: true,
    goals: ['理解阶跃 = 硬阈值', '对比阶跃与 Sigmoid 的软硬', '知道 ultrasonic 避障就是阶跃思想'],
    carLink: '超声波测得距离 < 30cm → 输出「停止」(1)，否则「前进」(0)，本质就是一个阶跃函数。',
    sections: [
      {
        heading: '硬开关',
        paragraphs: [
          '阶跃函数：输入 ≥ 阈值时输出 1，否则 0。它把连续信号变成「是/否」两类决策，是早期感知机和数字逻辑的基石。',
          '缺点是「不连续、不可导」，不能直接用梯度下降训练；现代网络多用 Sigmoid 等平滑近似。但做规则类控制（如避障）时，阶跃反而最直观。',
        ],
      },
      {
        heading: '小车里的阶跃',
        paragraphs: [
          '很多小车的超声波避障就是阶跃：distance < 阈值 → 刹车。右边组件把阈值调一调，看决策点怎么移动。',
        ],
      },
    ],
    tip: '阶跃可看作「把 Sigmoid 的温度 T 调到极小」的极限情况。',
    relatedTeaching: ['activation', 'perceptron'],
    widget: 'step',
  },
  {
    id: 'perceptron',
    title: '感知机：会学习的单个神经元',
    level: '基础',
    summary: '从「权重·输入 + 偏置」到「错误驱动更新」，看一个神经元如何学会画分界线。',
    minutes: 10,
    interactive: true,
    hasGraphic: true,
    goals: ['写出感知机公式 z=w·x+b', '理解「预测错才更新权重」', '知道它只能分直线'],
    carLink: '巡线时把「左偏/右偏」当两类，感知机可以学出一条直线把赛道分成「该左 / 该右」。',
    sections: [
      {
        heading: '一个神经元长啥样',
        paragraphs: [
          '感知机接收多个输入 x₁…xₙ，各自乘权重 w，加偏置 b，再过阶跃/符号函数得到输出：ŷ = sign(w·x + b)。',
          '训练时：若预测错，就朝「减小错误」的方向更新 w ← w + η·(y − ŷ)·x，b ← b + η·(y − ŷ)。η 是学习率。',
        ],
      },
      {
        heading: '它的边界',
        paragraphs: [
          '感知机只能学到「直线可分」的问题（如 AND、OR）。对 XOR 这类弯边界无能为力——这正是后面要叠网络、用非线性的原因。',
          '拖右边组件的两个输入点，看分界线如何被「错误」推着移动。',
        ],
      },
    ],
    tip: '感知机收敛定理：只要数据线性可分，权重一定会停下；分不了就一直抖。',
    relatedTeaching: ['activation', 'xor', 'mlp'],
    widget: 'perceptron',
  },
  {
    id: 'xor',
    title: 'XOR 难题与线性不可分',
    level: '基础',
    summary: '为什么一条直线分不开 XOR，以及「加一层」为什么能解决它。',
    minutes: 7,
    interactive: true,
    hasGraphic: true,
    goals: ['看懂 XOR 的四个点', '理解「单条直线最多对 3 个」', '知道需要隐藏层/非线性'],
    carLink: '若把「左前/右前/停止」看作异或式决策，单层网络不够，需要两层以上。',
    sections: [
      {
        heading: '异或长啥样',
        paragraphs: [
          '(0,0)→0、(1,1)→0、(0,1)→1、(1,0)→1。你会发现：无论怎么画一条直线，都至少分错一个点——这叫「线性不可分」。',
          '感知机在这里会一直震荡不收敛。解决办法：引入隐藏层 + 非线性激活，让网络能画出弯折边界。',
        ],
      },
      {
        heading: '怎么破',
        paragraphs: [
          '一个经典解：先用两层感知机分别识别「是否 x=1」「是否 y=1」，再在输出层做或/与非组合。右边组件勾选「示意非线性边界」看多层思路。',
        ],
      },
    ],
    tip: 'XOR 是深度学习的「Hello World」式反例：它告诉我们「层数」为何重要。',
    relatedTeaching: ['perceptron', 'mlp'],
    widget: 'xor',
  },
  {
    id: 'conv',
    title: '卷积：让小车看懂图像',
    level: '进阶',
    summary: '卷积核怎么在画面上「滑动」，提取边缘、模糊等特征，是 YOLO 的眼睛。',
    minutes: 9,
    interactive: true,
    hasGraphic: true,
    goals: ['理解「核在图上滑」', '知道边缘核/模糊核作用', '明白 CNN 靠卷积提特征'],
    carLink: 'YOLO 在识别「行人/障碍」前，先用很多卷积层把画面变成「哪里有边缘、哪里有纹理」的特征图。',
    sections: [
      {
        heading: '滑动的小窗口',
        paragraphs: [
          '卷积用一个 3×3 的小矩阵（核）在图像上逐格滑动，每格做「对应相乘再求和」，输出一张新图（特征图）。不同核提取不同特征：边缘核让边界发亮，模糊核把相邻像素抹平。',
          '相比全连接，卷积参数量小、平移不变（车在左在右都能认），特别适合摄像头输入。',
        ],
      },
      {
        heading: '小车怎么用',
        paragraphs: [
          '右边组件把「中间深色竖条」当作赛道胶带，蓝框是卷积核正在看的区域。切换边缘/模糊/恒等核，感受特征变化。',
        ],
      },
    ],
    tip: '卷积核的权重不是人写的，是训练出来的——这点和感知机一脉相承。',
    relatedTeaching: ['yolo', 'activation'],
    widget: 'conv',
  },
  {
    id: 'knn',
    title: 'K 近邻：最朴素的分类器',
    level: '进阶',
    summary: '「近朱者赤」：看最近的 K 个邻居投什么票，就能分类，无需训练。',
    minutes: 8,
    interactive: true,
    hasGraphic: true,
    goals: ['理解「距离近=相似」', '知道 K 太小易过拟合、太大易模糊', '能画出投票结果'],
    carLink: '小车可用 KNN 对「压缩后的摄像头特征」分类：最近几个样本多是「障碍」就刹车。',
    sections: [
      {
        heading: '投票法',
        paragraphs: [
          '给定新样本，算它到所有训练点的距离，取最近的 K 个，看它们大多属于哪类，就把新样本判为哪类。K 是奇数可避免平票。',
          'K 小：对噪声敏感、边界弯折（易过拟合）；K 大：边界平滑但可能把两类混在一起。',
        ],
      },
      {
        heading: '小车场景',
        paragraphs: [
          '把每个历史帧的「特征向量+人类遥控动作」当作样本。新帧找最近 K 个，多数动作即预测动作。右边组件可自己点样本、放查询点玩。',
        ],
      },
    ],
    tip: 'KNN 不训练（惰性学习），但预测时要遍历全库，样本多了会慢——小车常先降维再 KNN。',
    relatedTeaching: ['cosine', 'regression'],
    widget: 'knn',
  },
  {
    id: 'cosine',
    title: '余弦相似度：比「长得像」更比「方向像」',
    level: '进阶',
    summary: '用夹角而非直线距离衡量相似，适合比较特征向量的「模式」。',
    minutes: 7,
    interactive: true,
    hasGraphic: true,
    goals: ['会算 cosθ = (A·B)/(|A||B|)', '理解「同向不同长仍相似」', '知道它 vs 欧氏距离'],
    carLink: '比对两帧图像的「特征向量」时，用余弦看它们模式是否一致，比看绝对数值更稳。',
    sections: [
      {
        heading: '看方向不看长度',
        paragraphs: [
          '余弦相似度只看两向量夹角：1 表示同向、0 垂直、-1 反向，与向量长度无关。欧氏距离则会被长度放大。',
          '特征向量常做归一化，此时余弦≈（内积），计算快，是检索/匹配的首选。',
        ],
      },
      {
        heading: '小车里',
        paragraphs: [
          '右边组件拖两个箭头：点「同向不同长」，余弦仍≈1 但欧氏距离变大——说明余弦更适合判断「是不是同一类场景」。',
        ],
      },
    ],
    tip: '很多「以图搜图」底层就是余弦相似度：把图变成向量，找夹角最小的几个。',
    relatedTeaching: ['knn', 'regression'],
    widget: 'cosine',
  },
  {
    id: 'regression',
    title: '回归 vs 分类：连续转向与离散指令',
    level: '进阶',
    summary: '赛道偏移该「输出 0.35（连续）」还是「输出 左前（类别）」？两种思路对比。',
    minutes: 8,
    interactive: true,
    hasGraphic: true,
    goals: ['区分分类(离散)与回归(连续)', '理解连续转向更平滑', '知道小车常用回归控转向'],
    carLink: '巡线时输出一个连续 steering∈[-1,1]，比「非左即右」更顺，弯道不抖。',
    sections: [
      {
        heading: '两类输出',
        paragraphs: [
          '分类：输出有限个类别（前进/左/右/停）。简单但弯道易在阈值附近抖动。回归：输出一个连续数值（如转向角 -1~1），可映射到更细的档位，过弯更平滑。',
          '现代端到端小车多用回归直接预测转向；经典方案常先分类再后处理。',
        ],
      },
      {
        heading: '小车怎么选',
        paragraphs: [
          '右边组件调 offset，看「分类」只给几档、而「回归」给出平滑数值与转向条。',
        ],
      },
    ],
    tip: '分类可视为「把回归结果再离散化」；端到端模型常直接回归，省去后处理。',
    relatedTeaching: ['softmax', 'lane'],
    widget: 'regression',
  },
  {
    id: 'lane',
    title: '巡线决策：从偏移/角度到指令',
    level: '进阶',
    summary: '把「横向偏移 + 切线角」映射成 F/L/R/LF/RF 等蓝牙指令，含迟滞防抖。',
    minutes: 9,
    interactive: true,
    hasGraphic: true,
    goals: ['理解 offset 与 angle 两个输入', '知道 8 方向指令怎么来', '理解迟滞减少抖动'],
    carLink: '小车摄像头算出赛道偏移与切线角 → 这里映射成真实蓝牙指令驱动车轮。',
    sections: [
      {
        heading: '两个输入',
        paragraphs: [
          '横向偏移 offset∈[-1,1]（负偏左、正偏右）与切线角 angleDeg（赛道走向）。二者都小→前进 F；偏左明显→左前 LF 或左移 L；偏右同理；角很大→急转 TL/TR。',
          '为避免在阈值附近 F↔LF 反复横跳，加入「迟滞」：已直行时放宽居中带。',
        ],
      },
      {
        heading: '落地下发',
        paragraphs: [
          '映射结果直接是 CarCommand，通过蓝牙发给 ESP32。右边组件拖偏移与角度，看指令与理由实时变化。',
        ],
      },
    ],
    tip: '真实小车还会用「上次指令」做迟滞（prevCmd），本项目 driveMapper 已内置。',
    relatedTeaching: ['regression', 'softmax'],
    widget: 'lane',
  },
  {
    id: 'softmax',
    title: 'Softmax 与温度：把分数变概率',
    level: '高阶',
    summary: '多个类别的「原始分」经 Softmax 变成和为 1 的概率，温度控制自信程度。',
    minutes: 8,
    interactive: true,
    hasGraphic: true,
    goals: ['会算 Softmax', '理解温度 T 的作用', '知道低置信度要保守（停车）'],
    carLink: '小车末端输出「前进/左/右/停」四类 logits，Softmax 后取最高概率动作；置信太低就停车。',
    sections: [
      {
        heading: '分数 → 概率',
        paragraphs: [
          'Softmax(zᵢ) = exp(zᵢ/T) / Σexp(zⱼ/T)。T=1 是标准概率；T 越小分布越「尖」（更自信），T 越大越「平」（更犹豫）。',
          '决策时取概率最大的类；若最大概率低于阈值（如 0.45），宁可按兵不动（停车）也不要莽撞。',
        ],
      },
      {
        heading: '小车末端',
        paragraphs: [
          '右边组件调四个类的 logits 与温度，看「前进/左/右/停」的概率条与最终决策。',
        ],
      },
    ],
    tip: '推理时 T 常取 1；如果想「模型拿不准时多探索」，可临时调大 T 看分布变平。',
    relatedTeaching: ['regression', 'lane', 'mlp'],
    widget: 'softmax',
  },
  {
    id: 'mlp',
    title: 'MLP 与梯度下降：玩具训练演示',
    level: '高阶',
    summary: '用最小的线性+tanh 网络，演示「学习率/步数」如何影响决策边界与损失曲线。',
    minutes: 11,
    interactive: true,
    hasGraphic: true,
    goals: ['看懂前向 z=w·x+b、tanh 激活', '理解梯度下降更新权重', '观察学习率过大发散'],
    carLink: '小车策略网络本质就是 MLP：输入特征→若干隐藏层→输出动作概率，靠梯度下降从数据里学。',
    sections: [
      {
        heading: '最小训练循环',
        paragraphs: [
          '前向：z = w₁x + w₂y + b，pred = tanh(z)。损失用 (pred−label)²。反向：对 w,b 求梯度并更新 w ← w − η·∂L/∂w。重复若干步，损失应下降、边界应分开两类。',
          '学习率太大→损失发散乱跳；太小→半天不收敛。步数太少→没学完。',
        ],
      },
      {
        heading: '小车里的网络',
        paragraphs: [
          '右边组件调学习率与步数，看决策边界（蓝线）与损失曲线（紫线）实时变化。真实小车网络更深，但数学一模一样。',
        ],
      },
    ],
    tip: 'tanh 比 Sigmoid 更常用作隐藏激活，因为中心对称、梯度更稳。',
    relatedTeaching: ['perceptron', 'softmax', 'yolo'],
    widget: 'mlp',
  },
  {
    id: 'yolo',
    title: 'YOLO 目标检测与小车决策',
    level: '高阶',
    summary: '检测框（人/障碍）如何转成「前进/绕行/停止」——端到端视觉决策的雏形。',
    minutes: 10,
    interactive: true,
    hasGraphic: true,
    goals: ['理解「检测框 → 规则决策」', '知道中央偏下的人最危险', '区分示意与真实权重'],
    carLink: '摄像头跑 YOLO 得到「人/障碍」框，本篇用规则把框位置变成控车指令。',
    sections: [
      {
        heading: '从框到动作',
        paragraphs: [
          '拿到检测框后，用简单规则决策：画面中央偏下出现「人」→ 停止（最危险）；左侧障碍→右绕；右侧障碍→左绕；正前方障碍→停止；无近距目标→前进。',
          '注意：右边组件是「规则示意」，不是真 YOLO 权重；真实部署时框由模型给出，决策可换成另一小网络。',
        ],
      },
      {
        heading: '小车落地',
        paragraphs: [
          '拖动彩色检测框，看决策如何从「前进」变「右绕」再变「停止」。',
        ],
      },
    ],
    tip: '真实系统常把「检测」与「决策」解耦：YOLO 只给框，决策网络/规则再接管，便于分别迭代。',
    relatedTeaching: ['conv', 'softmax'],
    widget: 'yolo',
  },
  {
    id: 'data-aug',
    title: '数据增强：用少量样本训出稳模型',
    level: '高阶',
    summary: '翻转/加噪/调亮让训练集「变大」，小车在光照变化时更鲁棒。',
    minutes: 7,
    interactive: false,
    hasGraphic: false,
    goals: ['理解增强为何防过拟合', '知道小车常用哪些增强', '明白增强要「合理」'],
    carLink: '给摄像头样本做左右翻转（赛道对称）、亮度抖动，模型在阴天/强光下也不慌。',
    sections: [
      {
        heading: '为什么增强',
        paragraphs: [
          '真实小车采集难、标注贵。对已有样本做随机变换（水平翻转、旋转小角、调亮度、加高斯噪声），等价于「免费」扩充数据，降低过拟合。',
          '增强要符合物理：赛道左右翻转合理，但把「停止标志」上下颠倒就不合理。',
        ],
      },
      {
        heading: '小车常用',
        paragraphs: [
          '巡线：左右翻转 + 轻微透视；检测：马赛克拼接 + 色彩抖动。增强只在训练时用，验证/推理关闭。',
        ],
      },
    ],
    tip: '增强太狠会让模型学错分布；以「人眼仍认得原图」为度。',
    relatedTeaching: ['conv', 'yolo'],
  },
  {
    id: 'deploy',
    title: '边缘部署：把模型搬上小车',
    level: '高阶',
    summary: '模型怎么从电脑压缩到 ESP32/树莓派跑起来：量化、轻量网络、延迟权衡。',
    minutes: 9,
    interactive: false,
    hasGraphic: false,
    goals: ['理解「为什么不能丢个大模型上去」', '知道量化/剪枝的作用', '了解延迟与精度权衡'],
    carLink: '本项目把轻量网络/规则跑在 ESP32 或浏览器端，做到「看到→决策→下发」低延迟闭环。',
    sections: [
      {
        heading: '资源受限',
        paragraphs: [
          '小车算力、内存、电量都有限。直接跑服务器级模型会卡顿、发热。常见压缩：量化（float32→int8，体积与算力大降）、剪枝（删冗余连接）、用轻量结构（MobileNet 类）。',
          '还要看「端到端延迟」：从摄像头取帧到指令下发，必须远小于安全反应时间。',
        ],
      },
      {
        heading: '本项目的取舍',
        paragraphs: [
          '简单任务用规则/经典 ML（快、可解释）；图像任务用小型 CNN/检测；能用浏览器端推理就用浏览器端，减少小车负担。',
        ],
      },
    ],
    tip: '部署不是「模型训好就完」，而是「在真机上又快又准」——多在实车测延迟。',
    relatedTeaching: ['yolo', 'mlp', 'lane'],
  },
];

export const KNOWLEDGE_LEVELS: KnowledgeLevel[] = ['基础', '进阶', '高阶'];
