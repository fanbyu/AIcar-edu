// SPDX-License-Identifier: AGPL-3.0-or-later
export interface TrainingLevel {
  id: 'knn' | 'mlp' | 'cnn';
  title: string;
  difficulty: '入门' | '进阶' | '高级';
  classes: string[]; // 分类标签，如 ['前进','左','右','停']
  minSamplesPerClass: number; // 入门~10，进阶~30，高级 200+
  defaultHyperparams: Record<string, number | number[]>;
  needsGpu: boolean; // 高级 CNN 标记高算力
}

export const CLASSES = ['前进', '左', '右', '停'] as const;
export type CarClass = (typeof CLASSES)[number];
