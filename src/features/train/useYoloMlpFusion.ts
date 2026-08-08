// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMobileNet } from './useMobileNet';
import type { MobileNetConfig } from './mobilenetTrunc';
import type { DrivingDecision } from './detectors/types';
import { MlpTrainer } from './mlpTrainer';
import {
  fuseObstacleWithMlpLane,
  loadMlpTrainerFromFile,
  parseMlpModelFile,
  type MlpModelFile,
} from './yoloMlpFusion';

const DEFAULT_MN: MobileNetConfig = {
  version: 1,
  alpha: 0.25,
  truncationLayer: 'conv_pw_13_relu',
};

/**
 * YOLO 页专用：加载 mlp-model.json（或浏览器缓存），在无障碍分支用 MLP 巡线接管。
 */
export function useYoloMlpFusion() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [mnCfg, setMnCfg] = useState<MobileNetConfig>(DEFAULT_MN);
  const trainerRef = useRef<MlpTrainer | null>(null);
  const pendingRef = useRef<MlpModelFile | null>(null);
  const cfgEpoch = useRef(0);

  const mn = useMobileNet(mnCfg, { workerInfer: true, backend: 'cpu' });

  const finishLoad = useCallback(async (file: MlpModelFile) => {
    try {
      trainerRef.current?.dispose();
      trainerRef.current = await loadMlpTrainerFromFile(file);
      setStatus('ready');
      setEnabled(true);
      setError('');
      const mn = file.opts?.mobilenet;
      setInfo(
        `已加载 MLP（${file.exportedAt ? new Date(file.exportedAt).toLocaleString() : '无导出时间'}；MobileNet v${mn?.version ?? 1} α${mn?.alpha ?? 0.25}）`
      );
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
      setInfo('');
    }
  }, []);

  // MobileNet 配置变更并就绪后，再导入挂起的 MLP 权重
  useEffect(() => {
    if (!mn.ready || !pendingRef.current) return;
    const file = pendingRef.current;
    pendingRef.current = null;
    void finishLoad(file);
  }, [mn.ready, mnCfg, finishLoad]);

  const queueLoad = useCallback(
    (file: MlpModelFile) => {
      setStatus('loading');
      setError('');
      setInfo('正在对齐 MobileNet 并载入 MLP 权重…');
      const next: MobileNetConfig = {
        version: (file.opts?.mobilenet?.version as 1 | 2) ?? 1,
        alpha: file.opts?.mobilenet?.alpha ?? 0.25,
        truncationLayer: file.opts?.mobilenet?.truncationLayer ?? 'conv_pw_13_relu',
      };
      const same =
        next.version === mnCfg.version &&
        next.alpha === mnCfg.alpha &&
        (next.truncationLayer ?? '') === (mnCfg.truncationLayer ?? '');
      pendingRef.current = file;
      if (same && mn.ready) {
        pendingRef.current = null;
        void finishLoad(file);
      } else if (same) {
        // 等当前 MobileNet ready 的 effect
      } else {
        cfgEpoch.current += 1;
        setMnCfg(next);
      }
    },
    [finishLoad, mn.ready, mnCfg]
  );

  const loadFromText = useCallback(
    (text: string) => {
      try {
        const file = parseMlpModelFile(JSON.parse(text));
        queueLoad(file);
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [queueLoad]
  );

  const loadFromFileInput = useCallback(
    async (file: File) => {
      loadFromText(await file.text());
    },
    [loadFromText]
  );

  const loadFromCache = useCallback(() => {
    const cached = localStorage.getItem('mlp-cached-model');
    if (!cached) {
      setStatus('error');
      setError('浏览器缓存中没有 mlp-cached-model，请先在 MLP 教学页「保存到缓存」或上传 mlp-model.json');
      return;
    }
    loadFromText(cached);
  }, [loadFromText]);

  const fuse = useCallback(
    async (base: DrivingDecision, frame: CanvasImageSource): Promise<DrivingDecision> => {
      if (!enabled || status !== 'ready' || !trainerRef.current || !mn.ready) return base;
      return fuseObstacleWithMlpLane(base, {
        enabled: true,
        predict: async () => {
          const vec = await mn.infer(frame);
          return trainerRef.current!.predict(vec);
        },
      });
    },
    [enabled, status, mn]
  );

  useEffect(() => {
    return () => {
      trainerRef.current?.dispose();
      trainerRef.current = null;
    };
  }, []);

  return {
    enabled,
    setEnabled,
    status,
    info,
    error,
    mnReady: mn.ready,
    mnLoading: !mn.ready && (enabled || status === 'loading' || status === 'ready'),
    loadFromFileInput,
    loadFromCache,
    fuse,
  };
}
