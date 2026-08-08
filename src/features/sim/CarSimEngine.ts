// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CarCommand } from '@/features/bluetooth/esp32Protocol';
import { COMMAND_LABELS } from '@/features/bluetooth/esp32Protocol';

export interface SimParams {
  speed: number;
  steer: number;
  laneFollow: boolean;
}

export interface CarState {
  x: number;
  y: number;
  angle: number;
  cmd: CarCommand;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Canvas 2D 小车仿真：车道、障碍、循迹微调、指令 HUD。
 * 可由方向键 / 模型联动指令驱动。
 */
export class CarSimEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private car: CarState = { x: 80, y: 150, angle: 0, cmd: 'S' };
  private params: SimParams = { speed: 2, steer: 0.4, laneFollow: false };
  private raf = 0;
  private onFrame?: (s: CarState) => void;
  private running = false;
  private laneCenter = 150;
  private t = 0;
  private obstacles: Obstacle[] = [
    { x: 220, y: 40, w: 28, h: 28 },
    { x: 380, y: 210, w: 32, h: 24 },
  ];

  constructor(canvas: HTMLCanvasElement, onFrame?: (s: CarState) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onFrame = onFrame;
    this.laneCenter = canvas.height / 2;
    this.car.y = this.laneCenter;
  }

  setParams(p: Partial<SimParams>) {
    this.params = { ...this.params, ...p };
  }

  setCommand(cmd: CarCommand) {
    this.car.cmd = cmd;
  }

  getState(): CarState {
    return { ...this.car };
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
    this.t += 0.016;
    let throttle = 0;
    let turn = 0;
    switch (this.car.cmd) {
      case 'F':
        throttle = 1;
        break;
      case 'B':
        throttle = -1;
        break;
      case 'L':
        turn = -1;
        break;
      case 'R':
        turn = 1;
        break;
      case 'LF':
        throttle = 1;
        turn = -1;
        break;
      case 'RF':
        throttle = 1;
        turn = 1;
        break;
      case 'LB':
        throttle = -1;
        turn = -1;
        break;
      case 'RB':
        throttle = -1;
        turn = 1;
        break;
      case 'TL':
        turn = -1.4;
        break;
      case 'TR':
        turn = 1.4;
        break;
      case 'S':
      default:
        throttle = 0;
        turn = 0;
    }

    // 轻微摆动的目标车道中心，让循迹演示更直观
    const targetY = this.laneCenter + Math.sin(this.t * 0.7) * 18;
    if (laneFollow && throttle > 0) {
      const err = (targetY - this.car.y) / 120;
      turn = Math.max(-1, Math.min(1, turn + err));
    }

    if (throttle !== 0 || Math.abs(turn) > 0) {
      this.car.angle += turn * steer * 0.08;
      if (throttle !== 0) {
        this.car.x += Math.cos(this.car.angle) * speed * throttle;
        this.car.y += Math.sin(this.car.angle) * speed * throttle * 0.55;
      } else if (this.car.cmd === 'L' || this.car.cmd === 'R' || this.car.cmd === 'TL' || this.car.cmd === 'TR') {
        // 原地转向时略微前进一点，便于观察
        this.car.x += Math.cos(this.car.angle) * speed * 0.25;
        this.car.y += Math.sin(this.car.angle) * speed * 0.15;
      }
    }

    // 简易障碍碰撞：碰到则强制停车
    for (const o of this.obstacles) {
      if (
        this.car.x > o.x &&
        this.car.x < o.x + o.w &&
        this.car.y > o.y &&
        this.car.y < o.y + o.h
      ) {
        this.car.cmd = 'S';
        this.car.x = o.x - 20;
      }
    }

    if (this.car.x > this.canvas.width) this.car.x = 0;
    if (this.car.x < 0) this.car.x = this.canvas.width;
    if (this.car.y > this.canvas.height - 8) this.car.y = this.canvas.height - 8;
    if (this.car.y < 8) this.car.y = 8;

    this.onFrame?.(this.car);
  }

  private draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 路面渐变
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#e2e8f0');
    g.addColorStop(0.5, '#f8fafc');
    g.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 上下路肩
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);

    // 中心虚线车道
    const mid = this.laneCenter + Math.sin(this.t * 0.7) * 18;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let x = 0; x <= w; x += 20) {
      ctx.lineTo(x, mid + Math.sin(x * 0.03 + this.t) * 4);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 障碍物
    for (const o of this.obstacles) {
      ctx.fillStyle = '#f97316';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText('障', o.x + 6, o.y + 16);
    }

    // 小车
    ctx.save();
    ctx.translate(this.car.x, this.car.y);
    ctx.rotate(this.car.angle);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(-14, -9, 28, 18);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(6, -7, 8, 14);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-12, -11, 6, 3);
    ctx.fillRect(-12, 8, 6, 3);
    ctx.fillRect(4, -11, 6, 3);
    ctx.fillRect(4, 8, 6, 3);
    ctx.restore();

    // HUD
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.fillRect(8, 14, 118, 36);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`指令：${COMMAND_LABELS[this.car.cmd] ?? this.car.cmd}`, 14, 30);
    ctx.fillText(this.params.laneFollow ? '循迹：开' : '循迹：关', 14, 44);
  }

  dispose() {
    this.stop();
  }
}
