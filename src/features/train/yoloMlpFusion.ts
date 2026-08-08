// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * YOLO 避障 + MLP 巡线融合：
 * - 有障碍时沿用 decideDriving 的 S/L/R；
 * - 无障碍（clearPath）时改用 MLP（前进/左/右/停）决定巡线方向。
 *
 * MLP 权重格式与教学页导出的 mlp-model.json / localStorage `mlp-cached-model` 一致。
 */
import { MlpTrainer, type MlpModelArtifacts } from './mlpTrainer';
import { CLASSES, type CarClass } from './types';
import type { DrivingDecision } from './detectors/types';

export interface MlpModelFile {
  type: 'mlp-model';
  labels?: string[];
  opts?: {
    learningRate?: number;
    hiddenUnits?: number;
    epochs?: number;
    batchSize?: number;
    modelCode?: string;
    mobilenet?: {
      version?: number;
      alpha?: number;
      truncationLayer?: string;
    };
  };
  model: MlpModelArtifacts;
  exportedAt?: string;
}

export const CLASS_TO_CMD: Record<CarClass, 'F' | 'L' | 'R' | 'S'> = {
  前进: 'F',
  左: 'L',
  右: 'R',
  停: 'S',
};

export const CMD_TO_ZH: Record<'F' | 'L' | 'R' | 'S', string> = {
  F: '前进',
  L: '左转',
  R: '右转',
  S: '停车',
};

export function parseMlpModelFile(raw: unknown): MlpModelFile {
  const o = raw as MlpModelFile;
  if (!o || o.type !== 'mlp-model' || !o.model?.weightData || !o.model?.modelTopology) {
    throw new Error('不是有效的 mlp-model.json（需含 type=mlp-model 与 model 权重）');
  }
  return o;
}

/** 从 MLP 导出文件恢复可推理的分类器（浏览器内，无需重新训练）。 */
export async function loadMlpTrainerFromFile(file: MlpModelFile): Promise<MlpTrainer> {
  const labels = (file.labels?.length ? file.labels : [...CLASSES]) as CarClass[];
  const trainer = new MlpTrainer(labels, {
    learningRate: file.opts?.learningRate,
    hiddenUnits: file.opts?.hiddenUnits,
    epochs: file.opts?.epochs,
    batchSize: file.opts?.batchSize,
    modelCode: file.opts?.modelCode,
  });
  await trainer.importArtifacts(file.model);
  return trainer;
}

/**
 * 无障碍时用 MLP 接管；否则原样返回避障决策。
 * predict 需自行完成 MobileNet 特征提取 + MLP.predict。
 */
export async function fuseObstacleWithMlpLane(
  base: DrivingDecision,
  opts: {
    enabled: boolean;
    predict: (() => Promise<{ label: CarClass; confidence: number }>) | null;
  }
): Promise<DrivingDecision> {
  if (!opts.enabled || !base.clearPath || !opts.predict) return base;
  try {
    const pred = await opts.predict();
    const command = CLASS_TO_CMD[pred.label] ?? 'F';
    return {
      command,
      labelZh: CMD_TO_ZH[command],
      reason: `无障碍 → MLP 巡线预测「${pred.label}」（置信度 ${Math.round(pred.confidence * 100)}%）`,
      clearPath: true,
      source: 'mlp-lane',
    };
  } catch (e) {
    return {
      ...base,
      reason:
        base.reason +
        `（MLP 巡线失败，回退前进：${e instanceof Error ? e.message : String(e)}）`,
    };
  }
}
