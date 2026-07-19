// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react';
import { CarSimEngine, type SimParams } from './CarSimEngine';
import type { CarCommand } from '@/features/bluetooth/esp32Protocol';

/**
 * 仿真生命周期 Hook：绑定 Canvas 与 CarSimEngine，支持参数与指令驱动。
 */
export function useCarSim(params: SimParams) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CarSimEngine | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new CarSimEngine(canvasRef.current);
    engineRef.current = engine;
    engine.start();
    return () => engine.dispose();
  }, []);

  useEffect(() => {
    engineRef.current?.setParams(params);
  }, [params]);

  const setCommand = (cmd: CarCommand) => engineRef.current?.setCommand(cmd);

  return { canvasRef, setCommand };
}
