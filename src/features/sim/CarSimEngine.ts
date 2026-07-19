// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CarCommand } from '@/features/bluetooth/esp32Protocol';

export interface SimParams {
  speed: number; // 基础速度
  steer: number; // 转向灵敏度 0-1
  laneFollow: boolean; // 是否自动循迹
}

export interface CarState {
  x: number;
  y: number;
  angle: number; // 弧度
  cmd: CarCommand;
}

/**
 * Canvas 2D 小车仿真引擎：在车道/赛道上演示转向、循迹与避障。
 * 可由训练模型输出驱动（模型联动），也可由手动指令驱动。
 */
export class CarSimEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private car: CarState = { x: 120, y: 200, angle: 0, cmd: 'S' };
  private params: SimParams = { speed: 2, steer: 0.4, laneFollow: false };
  private raf = 0;
  private onFrame?: (s: CarState) => void;
  private running = false;
  private laneCenter = 200;

  constructor(canvas: HTMLCanvasElement, onFrame?: (s: CarState) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onFrame = onFrame;
  }

  setParams(p: Partial<SimParams>) {
    this.params = { ...this.params, ...p };
  }

  setCommand(cmd: CarCommand) {
    this.car.cmd = cmd;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      this.step();
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private step() {
    const { speed, steer, laneFollow } = this.params;
    let turn = 0;
    if (this.car.cmd === 'L') turn = -steer;
    else if (this.car.cmd === 'R') turn = steer;
    else if (this.car.cmd === 'F') turn = 0;
    // 自动循迹：根据与车道中心的偏差微调
    if (laneFollow && this.car.cmd === 'F') {
      const err = (this.laneCenter - this.car.y) / 200;
      turn = Math.max(-steer, Math.min(steer, err * steer));
    }
    if (this.car.cmd !== 'S') {
      this.car.angle += turn * 0.08;
      this.car.x += Math.cos(this.car.angle) * speed;
      this.car.y += Math.sin(this.car.angle) * speed * 0.6;
    }
    // 环绕边界
    if (this.car.x > this.canvas.width) this.car.x = 0;
    if (this.car.x < 0) this.car.x = this.canvas.width;
    if (this.car.y > this.canvas.height) this.car.y = 0;
    if (this.car.y < 0) this.car.y = this.canvas.height;
    this.onFrame?.(this.car);
  }

  private draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 车道背景
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, this.laneCenter);
    ctx.lineTo(canvas.width, this.laneCenter);
    ctx.stroke();
    ctx.setLineDash([]);
    // 小车
    ctx.save();
    ctx.translate(this.car.x, this.car.y);
    ctx.rotate(this.car.angle);
    ctx.fillStyle = '#2f83f7';
    ctx.fillRect(-12, -8, 24, 16);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(8, -6, 6, 12);
    ctx.restore();
  }

  dispose() {
    this.stop();
  }
}
