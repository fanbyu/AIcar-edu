import type { CarCommand } from '@/features/bluetooth/esp32Protocol';
import { clamp } from '@/lib/utils';

export interface DriveDecision {
  cmd: CarCommand;
  label: string;
  reason: string;
}

export interface DriveMapperOptions {
  straightAngleDeg?: number;
  straightOffset?: number;
  sharpTurnDeg?: number;
  /** 上一拍指令：用于迟滞，减轻阈值附近 F↔LF↔RF 抖动 */
  prevCmd?: CarCommand;
}

/** 将连续 offset + angleDeg 映射为离散蓝牙指令（支持 8 方向）。 */
export function mapLaneToCommand(
  offset: number,
  angleDeg: number,
  detected: boolean,
  opts: DriveMapperOptions = {}
): DriveDecision {
  if (!detected) {
    return { cmd: 'S', label: '停止', reason: '未检测到赛道线' };
  }

  // 已直行时放宽居中带，避免在阈值附近来回换向
  const holdStraight = opts.prevCmd === 'F';
  const straightAngle = (opts.straightAngleDeg ?? 8) + (holdStraight ? 4 : 0);
  const straightOffset = (opts.straightOffset ?? 0.15) + (holdStraight ? 0.06 : 0);
  const sharpTurn = opts.sharpTurnDeg ?? 25;

  const absAngle = Math.abs(angleDeg);
  const absOffset = Math.abs(offset);

  if (absAngle >= sharpTurn) {
    if (angleDeg < 0) {
      return { cmd: 'TL', label: '左转', reason: `急弯切线角 ${angleDeg.toFixed(1)}°` };
    }
    return { cmd: 'TR', label: '右转', reason: `急弯切线角 ${angleDeg.toFixed(1)}°` };
  }

  if (absAngle < straightAngle && absOffset < straightOffset) {
    return { cmd: 'F', label: '前进', reason: '赛道居中，切线接近 0°' };
  }

  if (offset < -straightOffset || angleDeg < -straightAngle) {
    if (absAngle > straightAngle && offset < 0) {
      return {
        cmd: 'LF',
        label: '左前',
        reason: `偏左 offset=${offset.toFixed(2)}，角=${angleDeg.toFixed(1)}°`,
      };
    }
    return { cmd: 'L', label: '左移', reason: `偏左 offset=${offset.toFixed(2)}` };
  }

  if (offset > straightOffset || angleDeg > straightAngle) {
    if (absAngle > straightAngle && offset > 0) {
      return {
        cmd: 'RF',
        label: '右前',
        reason: `偏右 offset=${offset.toFixed(2)}，角=${angleDeg.toFixed(1)}°`,
      };
    }
    return { cmd: 'R', label: '右移', reason: `偏右 offset=${offset.toFixed(2)}` };
  }

  return { cmd: 'F', label: '前进', reason: '默认直行' };
}

/** 简单线性回归：用 (offset, angle) 样本学习 steering ∈ [-1,1] */
export class SteeringRegressor {
  private n = 0;
  private sumX = 0;
  private sumY = 0;
  private sumXX = 0;
  private sumXY = 0;

  addSample(offset: number, angleDeg: number, steering: number) {
    const x = offset * 0.6 + (angleDeg / 45) * 0.4;
    const y = clamp(steering, -1, 1);
    this.n++;
    this.sumX += x;
    this.sumY += y;
    this.sumXX += x * x;
    this.sumXY += x * y;
  }

  predict(offset: number, angleDeg: number): number {
    if (this.n < 2) return offset * 0.5 + (angleDeg / 90) * 0.5;
    const denom = this.n * this.sumXX - this.sumX * this.sumX;
    if (Math.abs(denom) < 1e-9) return 0;
    const a = (this.n * this.sumXY - this.sumX * this.sumY) / denom;
    const b = (this.sumY - a * this.sumX) / this.n;
    const x = offset * 0.6 + (angleDeg / 45) * 0.4;
    return clamp(a * x + b, -1, 1);
  }

  get sampleCount() {
    return this.n;
  }

  reset() {
    this.n = 0;
    this.sumX = 0;
    this.sumY = 0;
    this.sumXX = 0;
    this.sumXY = 0;
  }
}

export function steeringToCommand(steering: number): DriveDecision {
  const s = clamp(steering, -1, 1);
  if (Math.abs(s) < 0.12) {
    return { cmd: 'F', label: '前进', reason: `回归输出 ${s.toFixed(2)} ≈ 0` };
  }
  if (s < -0.55) return { cmd: 'TL', label: '左转', reason: `回归 ${s.toFixed(2)}` };
  if (s > 0.55) return { cmd: 'TR', label: '右转', reason: `回归 ${s.toFixed(2)}` };
  if (s < 0) return { cmd: 'LF', label: '左前', reason: `回归 ${s.toFixed(2)}` };
  return { cmd: 'RF', label: '右前', reason: `回归 ${s.toFixed(2)}` };
}
