// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from '@/features/train/useCamera';
import { FloatingPreview } from '@/components/shared/FloatingPreview';
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import { Card, Chip } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BluetoothPanel } from '@/components/shared/BluetoothPanel';
import { driveCommandToLabel } from '@/features/bluetooth/esp32Protocol';
import { cn } from '@/lib/utils';
import {
  buildDemoScene,
  decideDriving,
  type DetectedObject,
  type DrivingDecision,
} from '@/features/train/yoloDetector';
import { createDetector, AVAILABLE_DETECTORS } from '@/features/train/detectors';
import type { DetectInput, DetectorEngine, YoloWorldConfig } from '@/features/train/detectors/types';
import { TRAINED_YOLO_MODELS, type TrainedYoloModel } from '@/content/trainedYoloModels';
import { DriveCommandGate, LIVE_INFER_MS } from '@/features/bluetooth/driveSend';
import { useYoloMlpFusion } from '@/features/train/useYoloMlpFusion';

type Step = 'understand' | 'detect' | 'decide' | 'connect';

const YOLO_PROMPTS_DEFAULT = 'person, car, bus, truck, motorcycle, bicycle, traffic light, stop sign';
const DRIVE_CLASSES_DEFAULT = 'ting, zuo, qian, you';

export function YoloDetector() {
  const camera = useCamera();
  const bluetooth = useBluetooth();
  const mlpFusion = useYoloMlpFusion();

  const [step, setStep] = useState<Step>('understand');
  const [detections, setDetections] = useState<DetectedObject[]>([]);
  const [decision, setDecision] = useState<DrivingDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  // 最近一次通过蓝牙广播的最高优先级分类标签（用于界面回显）
  const [lastSentLabel, setLastSentLabel] = useState<string | null>(null);

  // 默认 coco-ssd：避障（人/车/灯）即开即用；训练四类 / World 可在引擎区切换
  const [engine, setEngine] = useState<DetectorEngine>('tfjs-coco');
  const [promptsText, setPromptsText] = useState(YOLO_PROMPTS_DEFAULT);
  const [activeTrainedId, setActiveTrainedId] = useState<string | null>(null);

  // ONNX 模型来源（页面内加载）：
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | null>(null);
  const [modelUrl, setModelUrl] = useState('');
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelErr, setModelErr] = useState('');
  /** 是否处于实时检测/决策循环（驱动按钮文案与停止键显示；不能只用 liveTimer.current） */
  const [live, setLive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveTimer = useRef<number | null>(null);
  const liveInFlight = useRef(false);
  const previewRaf = useRef<number | null>(null);
  const driveGateRef = useRef(new DriveCommandGate());

  const cameraActive = camera.active;

  const promptsFromText = useCallback(
    (t: string) => t.split(',').map((s) => s.trim()).filter(Boolean),
    []
  );

  // ---- 检测引擎抽象层：按引擎创建单例后端，切换时重建 ----
  const backendRef = useRef<ReturnType<typeof createDetector> | null>(null);
  const engineRef = useRef<DetectorEngine>(engine);
  const getBackend = useCallback((): ReturnType<typeof createDetector> => {
    if (!backendRef.current || engineRef.current !== engine) {
      let cfg: YoloWorldConfig | undefined;
      if (engine === 'ort-yolo-world' || engine === 'ort-yolov8') {
        cfg = {
          modelBuffer: modelBuffer ?? undefined,
          modelUrl: modelUrl || undefined,
          classes: promptsFromText(promptsText),
        };
      }
      backendRef.current = createDetector(engine, cfg);
      engineRef.current = engine;
    }
    return backendRef.current;
  }, [engine, modelBuffer, modelUrl, promptsText, promptsFromText]);

  /** 加载 ONNX：YOLOv8 训练模型或 YOLO-World */
  const doLoadModel = useCallback(
    async (
      target: DetectorEngine,
      opts: { buffer?: ArrayBuffer; url?: string; classes?: string[]; trainedId?: string | null }
    ) => {
      setModelStatus('loading');
      setModelErr('');
      setError(null);
      setEngine(target);
      try {
        const classes = opts.classes ?? promptsFromText(promptsText);
        const cfg: YoloWorldConfig = {
          modelBuffer: opts.buffer,
          modelUrl: opts.url,
          classes,
        };
        const backend = createDetector(target, cfg);
        await backend.load(classes);
        backendRef.current = backend;
        engineRef.current = target;
        setPromptsText(classes.join(', '));
        setActiveTrainedId(opts.trainedId ?? null);
        setModelStatus('ready');
      } catch (e) {
        setModelStatus('error');
        setModelErr((e as Error).message);
        setActiveTrainedId(null);
      }
    },
    [promptsText, promptsFromText]
  );

  // 从 zip 压缩包里提取第一个 .onnx 模型（学生/同学训练后打包的 onnx(1).zip 等）。
  const extractOnnxFromZip = useCallback(async (file: File): Promise<ArrayBuffer> => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);
    const onnxEntry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.onnx')
    );
    if (!onnxEntry) {
      throw new Error('压缩包里没有找到 .onnx 模型文件');
    }
    return onnxEntry.async('arraybuffer');
  }, []);

  const handleModelFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, target: DetectorEngine = engine) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoading(true);
      setLoadingMsg(file.name.toLowerCase().endsWith('.zip') ? '正在解压模型…' : '正在读取模型…');
      try {
        const buf = file.name.toLowerCase().endsWith('.zip')
          ? await extractOnnxFromZip(file)
          : await file.arrayBuffer();
        setModelBuffer(buf);
        setModelUrl('');
        const classes =
          target === 'ort-yolov8'
            ? promptsFromText(DRIVE_CLASSES_DEFAULT)
            : promptsFromText(promptsText);
        await doLoadModel(target, { buffer: buf, classes, trainedId: null });
      } catch (err) {
        setModelStatus('error');
        setModelErr((err as Error).message);
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    },
    [doLoadModel, extractOnnxFromZip, engine, promptsText, promptsFromText]
  );

  /** 一键加载 public/models/yolo-trained 里的同学训练模型 */
  const handleLoadTrained = useCallback(
    async (m: TrainedYoloModel) => {
      setLoading(true);
      setLoadingMsg(`正在加载 ${m.name}…`);
      setModelBuffer(null);
      setModelUrl(m.url);
      try {
        await doLoadModel('ort-yolov8', {
          url: m.url,
          classes: m.classes,
          trainedId: m.id,
        });
      } finally {
        setLoading(false);
      }
    },
    [doLoadModel]
  );

  const handleLoadModelFromUrl = useCallback(async () => {
    const url = modelUrl.trim();
    if (!url) {
      setModelErr('请先填写模型 URL');
      setModelStatus('error');
      return;
    }
    setModelBuffer(null);
    await doLoadModel(engine === 'ort-yolov8' ? 'ort-yolov8' : 'ort-yolo-world', {
      url,
      trainedId: null,
    });
  }, [modelUrl, doLoadModel, engine]);

  const handleLoadDefault = useCallback(async () => {
    setModelBuffer(null);
    setModelUrl('');
    await doLoadModel('ort-yolo-world', { url: '', trainedId: null });
  }, [doLoadModel]);

  const needsOnnxReady = engine === 'ort-yolo-world' || engine === 'ort-yolov8';

  const runDetect = useCallback(
    async (input: DetectInput): Promise<DetectedObject[]> => {
      if (needsOnnxReady && modelStatus !== 'ready') {
        setError(
          engine === 'ort-yolov8'
            ? '请先点击下方「赵数据 / 郝数据」一键加载训练模型，或上传自己的 .onnx。'
            : '请先在下方加载 YOLO-World 模型（上传 .onnx 或填写 URL），再开始检测。'
        );
        return [];
      }
      const backend = getBackend();
      const prompts =
        engine === 'ort-yolo-world' || engine === 'ort-yolov8'
          ? promptsFromText(promptsText)
          : undefined;
      return backend.detect(input, { prompts });
    },
    [engine, needsOnnxReady, modelStatus, getBackend, promptsFromText, promptsText]
  );

  const paintFrame = useCallback(
    (src: CanvasImageSource, w: number, h: number, dets: DetectedObject[], dec: DrivingDecision) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(src, 0, 0, w, h);
      ctx.lineWidth = Math.max(2, Math.round(w / 240));
      ctx.font = `${Math.max(12, Math.round(w / 36))}px sans-serif`;
      for (const d of dets) {
        const [x, y, bw, bh] = d.bbox;
        const isTrigger = dec.trigger === d;
        ctx.strokeStyle = isTrigger ? '#22c55e' : '#3b82f6';
        ctx.fillStyle = isTrigger ? '#22c55e' : '#3b82f6';
        ctx.strokeRect(x, y, bw, bh);
        const tag = `${d.labelZh} ${Math.round(d.score * 100)}%`;
        const tw = ctx.measureText(tag).width;
        ctx.fillRect(x, y - 18, tw + 8, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(tag, x + 4, y - 5);
      }
      // 角标：决策来源
      const badge =
        dec.source === 'mlp-lane' ? 'MLP巡线' : dec.clearPath ? '无障碍' : dec.source === 'drive-class' ? '训练类' : '避障';
      ctx.fillStyle = 'rgba(15,23,42,0.7)';
      ctx.fillRect(8, 8, ctx.measureText(badge).width + 16, 22);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(badge, 16, 24);
    },
    []
  );

  /** 避障决策；无障碍且开启融合时改用 MLP 巡线 L/F/R/S */
  const resolveDecision = useCallback(
    async (
      src: CanvasImageSource,
      w: number,
      h: number,
      dets: DetectedObject[]
    ): Promise<DrivingDecision> => {
      const base = decideDriving(dets, w, h);
      const dec = await mlpFusion.fuse(base, src);
      paintFrame(src, w, h, dets, dec);
      setDetections(dets);
      setDecision(dec);
      return dec;
    },
    [mlpFusion.fuse, paintFrame]
  );

  // 连接蓝牙后下发驾驶决策：与各教学页共用 DriveCommandGate。
  // 实时推理场景下传 alwaysResend=true：相同指令也每帧持续下发（仅受 minIntervalMs 限流），
  // 维持小车固件所需的持续运动广播，避免同指令被「跳过」导致间歇性断流。
  const broadcastDec = useCallback(
    (dec: DrivingDecision | null, opts?: { replayMs?: number; alwaysResend?: boolean; minIntervalMs?: number }) => {
      if (!dec || bluetooth.state !== 'connected') return;
      const label = driveCommandToLabel(dec.command);
      const sent = driveGateRef.current.trySend(
        dec.command,
        (c) => bluetooth.send(c),
        opts?.minIntervalMs ?? 0,
        opts?.replayMs ?? 0,
        opts?.alwaysResend ?? false
      );
      // 仅当真正下发时才更新「最后发送」标签，避免 UI 显示有指令但小车其实没收到。
      if (sent) setLastSentLabel(dec.trigger ? `${label}（${dec.trigger.labelZh}）` : label);
    },
    [bluetooth, setLastSentLabel]
  );

  const handleDetectSource = useCallback(
    async (input: DetectInput) => {
      setError(null);
      setLoading(true);
      setLoadingMsg(
        engine === 'ort-yolov8'
          ? '训练模型推理中…'
          : engine === 'ort-yolo-world'
            ? 'YOLO-World 推理中…'
            : '检测中…'
      );
      try {
        const dets = await runDetect(input);
        const src = (input.htmlVideo ?? input.htmlImage ?? input.htmlCanvas) as CanvasImageSource & {
          videoWidth?: number;
          videoHeight?: number;
          naturalWidth?: number;
          naturalHeight?: number;
          width: number;
          height: number;
        };
        const w = src.videoWidth ?? src.naturalWidth ?? src.width;
        const h = src.videoHeight ?? src.naturalHeight ?? src.height;
        const dec = await resolveDecision(src, w, h, dets);
        broadcastDec(dec);
      } catch (e) {
        setError('检测失败：' + (e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [engine, runDetect, resolveDecision, broadcastDec]
  );

  const handleDemo = useCallback(async () => {
    setError(null);
    const { canvas, detections: demoDetections } = buildDemoScene();
    const dec = await resolveDecision(canvas, canvas.width, canvas.height, demoDetections);
    broadcastDec(dec);
  }, [resolveDecision, broadcastDec]);

  const handleImage = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        handleDetectSource({ htmlImage: img });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    },
    [handleDetectSource]
  );

  // 纯预览循环：把摄像头视频实时画到 canvas（不推理、不画框），让用户「开启摄像头」立即可见画面。
  const startPreviewLoop = useCallback(() => {
    const loop = () => {
      const video = camera.videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      }
      previewRaf.current = requestAnimationFrame(loop);
    };
    previewRaf.current = requestAnimationFrame(loop);
  }, [camera.videoRef]);

  const stopPreviewLoop = useCallback(() => {
    if (previewRaf.current) {
      cancelAnimationFrame(previewRaf.current);
      previewRaf.current = null;
    }
  }, []);

  const handleStartCamera = useCallback(async () => {
    if (camera.videoRef.current?.srcObject) {
      startPreviewLoop();
      return;
    }
    setError(null);
    await camera.start();
    if (!camera.videoRef.current?.srcObject) {
      setError('无法访问摄像头（权限被拒或没有可用摄像头），可用「上传图片」或「示例场景」。');
      return;
    }
    // 摄像头开启即启动预览，让用户立即看到画面（不开决策也能看）。
    startPreviewLoop();
  }, [camera, startPreviewLoop]);

  const tick = useCallback(async () => {
    // 防止推理慢于 interval 时并发堆叠（MLP worker 被压垮会导致间歇性断流）。
    if (liveInFlight.current) return;
    const video = camera.videoRef.current;
    if (!video || video.videoWidth === 0) return;
    liveInFlight.current = true;
    try {
      const dets = await runDetect({ htmlVideo: video });
      const dec = await resolveDecision(video, video.videoWidth, video.videoHeight, dets);
      broadcastDec(dec, { alwaysResend: true, minIntervalMs: 80 });
    } catch (e) {
      setError('检测失败：' + (e as Error).message);
      if (liveTimer.current) {
        clearInterval(liveTimer.current);
        liveTimer.current = null;
      }
    } finally {
      liveInFlight.current = false;
    }
  }, [camera.videoRef, resolveDecision, runDetect, broadcastDec]);

  const handleStartLive = useCallback(async () => {
    if (liveTimer.current) return;
    setError(null);
    // 若预览循环在跑（用户先点了「开启摄像头」），先停掉，避免与 tick 的 paintFrame 双重绘制冲突。
    stopPreviewLoop();
    if (!camera.videoRef.current?.srcObject) {
      await camera.start();
    }
    if (!camera.videoRef.current?.srcObject) {
      setError('无法访问摄像头（权限被拒或没有可用摄像头），可用「上传图片」或「示例场景」。');
      return;
    }
    setLive(true);
    // 摄像头已就绪，立即启动实时决策循环（tick 内部会把画面 + 检测框画到 canvas）。
    liveTimer.current = window.setInterval(tick, LIVE_INFER_MS);
    // 立刻跑一帧，避免等第一个 interval
    void tick();
  }, [camera, tick, stopPreviewLoop]);

  const handleStopLive = useCallback(() => {
    if (liveTimer.current) {
      clearInterval(liveTimer.current);
      liveTimer.current = null;
    }
    setLive(false);
    stopPreviewLoop();
    // 停止实时推理后显式停车，避免小车继续惯性前进。
    if (bluetooth.state === 'connected') {
      driveGateRef.current.trySend('S', (c) => bluetooth.send(c), 0, 0, true);
    }
    // 摄像头仍开着则恢复纯预览
    if (camera.videoRef.current?.srcObject) startPreviewLoop();
  }, [bluetooth, camera.videoRef, startPreviewLoop, stopPreviewLoop]);

  /** 检测栏：对当前摄像头帧做一次推理（不进入持续循环） */
  const handleDetectOnce = useCallback(async () => {
    setError(null);
    if (!camera.videoRef.current?.srcObject) {
      await camera.start();
      startPreviewLoop();
    }
    const video = camera.videoRef.current;
    if (!video?.srcObject) {
      setError('无法访问摄像头，请改用「上传图片」或「示例场景」。');
      return;
    }
    // 等首帧就绪（最多约 1.5s）
    for (let i = 0; i < 30 && video.videoWidth === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (video.videoWidth === 0) {
      setError('摄像头画面尚未就绪，请稍候再点「检测当前帧」。');
      return;
    }
    stopPreviewLoop();
    await handleDetectSource({ htmlVideo: video });
    if (!liveTimer.current) startPreviewLoop();
  }, [camera, startPreviewLoop, stopPreviewLoop, handleDetectSource]);

  // 组件卸载时清理所有定时/动画，避免泄漏。
  useEffect(() => {
    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current);
      if (previewRaf.current) cancelAnimationFrame(previewRaf.current);
    };
  }, []);

  const modelStatusLabel =
    modelStatus === 'ready'
      ? ' 已加载 ✓'
      : modelStatus === 'loading'
        ? ' 加载中…'
        : modelStatus === 'error'
          ? ' 加载失败'
          : ' 未加载';

  const FusionPanel = (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-emerald-800">拓展 · YOLO 避障 + MLP 巡线</p>
          <p className="mt-0.5 text-[11px] text-emerald-700/80">
            有障碍仍按 S/L/R；无障碍时用 MLP（前进/左/右/停）接管巡线。请先用 coco-ssd / YOLO-World 做避障检测。
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-emerald-800">
          <input
            type="checkbox"
            checked={mlpFusion.enabled}
            onChange={(e) => mlpFusion.setEnabled(e.target.checked)}
            disabled={mlpFusion.status !== 'ready'}
            className="accent-emerald-600"
          />
          启用融合
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={mlpFusion.loadFromCache}>
          从 MLP 缓存加载
        </Button>
        <label className="inline-flex cursor-pointer items-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs text-white">
          上传 mlp-model.json
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void mlpFusion.loadFromFileInput(f);
            }}
          />
        </label>
        <span
          className={cn(
            'text-[11px]',
            mlpFusion.status === 'ready'
              ? 'text-emerald-700'
              : mlpFusion.status === 'error'
                ? 'text-red-600'
                : 'text-slate-500'
          )}
        >
          {mlpFusion.status === 'ready'
            ? 'MLP 已就绪'
            : mlpFusion.status === 'loading'
              ? 'MLP 加载中…'
              : mlpFusion.status === 'error'
                ? '加载失败'
                : '未加载 MLP'}
          {mlpFusion.mnLoading ? ' · MobileNet 准备中' : ''}
        </span>
      </div>
      {mlpFusion.info && <p className="mt-1.5 text-[11px] text-emerald-700">{mlpFusion.info}</p>}
      {mlpFusion.error && <p className="mt-1 text-[11px] text-red-600">{mlpFusion.error}</p>}
      <p className="mt-1.5 text-[11px] text-slate-500">
        在「MLP 分类」页训练并点「下载模型」或「保存到缓存」后，回到本页加载即可串联。
      </p>
    </div>
  );

  const EngineSwitch = (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">检测引擎：</span>
        {AVAILABLE_DETECTORS.map((d) => (
          <button
            key={d.engine}
            onClick={() => {
              setEngine(d.engine);
              setDetections([]);
              setDecision(null);
              setError(null);
              setModelStatus('idle');
              setModelErr('');
              setModelBuffer(null);
              setModelUrl('');
              setActiveTrainedId(null);
              setPromptsText(
                d.engine === 'ort-yolov8' ? DRIVE_CLASSES_DEFAULT : YOLO_PROMPTS_DEFAULT
              );
            }}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs transition',
              engine === d.engine
                ? 'bg-purple-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            )}
          >
            {d.name}
          </button>
        ))}
      </div>

      {engine === 'ort-yolov8' ? (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-slate-500">
            来自「yolo数据」的同学训练模型已内置到站点（停/左/前/右）。点一下即可在浏览器加载，检测结果直接映射为小车指令。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {TRAINED_YOLO_MODELS.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={activeTrainedId === m.id && modelStatus === 'ready' ? 'primary' : 'ghost'}
                disabled={loading || modelStatus === 'loading'}
                onClick={() => handleLoadTrained(m)}
                title={m.description}
              >
                {activeTrainedId === m.id && modelStatus === 'ready' ? `✓ ${m.name}` : m.name}
              </Button>
            ))}
            <label className="inline-flex cursor-pointer items-center rounded-md bg-brand-600 px-2.5 py-1.5 text-xs text-white">
              上传自己的 .onnx / .zip
              <input
                type="file"
                accept=".onnx,.zip"
                className="hidden"
                onChange={(e) => handleModelFile(e, 'ort-yolov8')}
              />
            </label>
          </div>
          <input
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="类别顺序须与训练 classes.txt 一致，如 ting, zuo, qian, you"
          />
          <p className="text-[11px] text-gray-400">
            模型状态：
            <b className={cn(modelStatus === 'ready' ? 'text-green-600' : 'text-amber-600')}>
              {modelStatusLabel}
            </b>
            {activeTrainedId ? ` · ${activeTrainedId}` : ''}
          </p>
          {modelErr && <p className="text-[11px] text-red-500">模型加载失败：{modelErr}</p>}
        </div>
      ) : engine === 'ort-yolo-world' ? (
        <div className="mt-2 space-y-2">
          <input
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="文本提示，逗号分隔，如 person, car, traffic light"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-md bg-brand-600 px-2.5 py-1.5 text-xs text-white">
              上传模型（.onnx / .zip）
              <input
                type="file"
                accept=".onnx,.zip"
                className="hidden"
                onChange={(e) => handleModelFile(e, 'ort-yolo-world')}
              />
            </label>
            <input
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              placeholder="模型 URL（可选）"
              className="min-w-[12rem] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <Button size="sm" variant="ghost" onClick={handleLoadModelFromUrl}>
              从 URL 加载
            </Button>
            <Button size="sm" variant="ghost" onClick={handleLoadDefault}>
              用默认模型
            </Button>
          </div>
          <p className="text-[11px] text-gray-400">
            开放词汇检测。模型状态：
            <b className={cn(modelStatus === 'ready' ? 'text-green-600' : 'text-amber-600')}>
              {modelStatusLabel}
            </b>
          </p>
          {modelErr && <p className="text-[11px] text-red-500">模型加载失败：{modelErr}</p>}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-gray-400">
          {AVAILABLE_DETECTORS.find((d) => d.engine === 'tfjs-coco')?.note}
        </p>
      )}
    </div>
  );

  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-2">
        <Chip className="w-fit bg-purple-100 text-purple-700">拓展关卡 · 目标检测与自动驾驶</Chip>
        <h1 className="section-title">YOLO：让小车“看见”并避障</h1>
        <p className="text-slate-600">
          前三级（KNN / MLP / CNN）我们训练模型“认物”；这一级升级到“目标检测”——不仅要认出物体，还要在画面里框出位置。
          默认用 coco-ssd 做避障（人/车/灯）；也可加载同学训练的四类 YOLOv8，或开启「避障 + MLP 巡线」融合。
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ['understand', '1. 读懂 YOLO'],
            ['detect', '2. 实时检测'],
            ['decide', '3. 自动驾驶决策'],
            ['connect', '4. 连接小车'],
          ] as [Step, string][]
        ).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm transition',
              step === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* 摄像头视频始终挂载（隐藏），供 useCamera 写入视频流 */}
      <video ref={camera.videoRef} className="hidden" playsInline muted />

      {step === 'understand' && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="font-semibold">什么是“目标检测”？</h3>
            <p className="mt-2 text-sm text-slate-600">
              分类只回答“图里是什么”，检测还要回答“在哪里、有几个”。
              模型输出一组边界框（bbox）+ 类别 + 置信度。YOLO 的思想是“一次看全图、直接预测框”，所以快。
            </p>
            <h3 className="mt-4 font-semibold">本关可用的检测引擎</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>
                <b>coco-ssd（推荐避障）</b>：封闭 80 类，无需上传模型，可直接识别人 / 车 / 停车标志 / 红绿灯。
              </li>
              <li>
                <b>训练模型 YOLOv8</b>：同学标注的停/左/前/右，一键加载后按类名直接控车。
              </li>
              <li>
                <b>YOLO-World</b>：开放词汇，需自行提供已导出的 .onnx，并用文本提示指定类别。
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-400">
              「避障 + MLP 巡线」请用 coco-ssd（或 YOLO-World）做障碍检测；四类 YOLOv8 走独立的指令映射，不会进入空旷→MLP 分支。
            </p>
          </Card>
          <Card>
            <h3 className="font-semibold">检测框怎么变成“开车指令”？</h3>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
{`正前方有人/停车标志/红绿灯(近) → 停车(S)
障碍在路中央(近)            → 停车(S)
障碍偏左                    → 右转(R)
障碍偏右                    → 左转(L)
前方空旷                    → 前进(F)
  └ 开启「避障+MLP巡线」时 → 改由 MLP 输出 L/F/R/S`}
            </pre>
            <p className="mt-3 text-sm text-slate-600">
              约定：画面正中央 = 小车正前方；框越大 = 离得越近 = 越危险。
              MLP 权重来自进阶关导出的 <code className="rounded bg-slate-100 px-1">mlp-model.json</code>
              （或 MLP 页「保存到缓存」），浏览器内直接推理，无需重新训练。
            </p>
          </Card>
        </div>
      )}

      {step === 'detect' && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <FloatingPreview className="relative w-full overflow-hidden rounded-lg">
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg bg-black"
                style={{ aspectRatio: '3 / 2' }}
              />
            </FloatingPreview>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={handleDemo}>
                示例场景
              </Button>
              <label className="inline-flex cursor-pointer items-center rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white">
                上传图片
                <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
              </label>
              <Button size="sm" variant="ghost" onClick={handleStartCamera} disabled={cameraActive}>
                {cameraActive ? '摄像头已开启' : '开启摄像头'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDetectOnce} disabled={loading}>
                检测当前帧
              </Button>
              <Button
                size="sm"
                variant={live ? 'primary' : 'ghost'}
                onClick={() => (live ? handleStopLive() : void handleStartLive())}
              >
                {live ? '停止实时检测' : '开始实时检测'}
              </Button>
            </div>
            {camera.error && (
              <p className="mt-2 text-xs text-amber-600">{camera.error}</p>
            )}
            {loading && <p className="mt-2 text-xs text-slate-400">{loadingMsg}</p>}
            {EngineSwitch}
          </Card>
          <Card>
            <h3 className="font-semibold">本帧检测到的目标</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {detections.length === 0 && (
                <li className="text-slate-400">
                  可用「示例场景 / 上传图片 / 开启摄像头后点检测当前帧」。
                </li>
              )}
              {detections.map((d, i) => (
                <li key={i} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                  <span>{d.labelZh}</span>
                  <span className="text-slate-400">{Math.round(d.score * 100)}%</span>
                </li>
              ))}
            </ul>
            {decision && (
              <p className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-600">
                当前决策：<strong>{decision.labelZh}</strong> — {decision.reason}
              </p>
            )}
          </Card>
        </div>
      )}

      {step === 'decide' && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <FloatingPreview className="relative w-full overflow-hidden rounded-lg">
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg bg-black"
                style={{ aspectRatio: '3 / 2' }}
              />
            </FloatingPreview>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={handleDemo}>
                示例场景
              </Button>
              <Button
                size="sm"
                variant={live ? 'primary' : 'ghost'}
                onClick={() => (live ? handleStopLive() : void handleStartLive())}
              >
                {live ? '停止实时决策' : '开启摄像头并决策'}
              </Button>
              {live && (
                <Button size="sm" variant="ghost" onClick={handleStopLive}>
                  停止
                </Button>
              )}
            </div>
            {camera.error && (
              <p className="mt-2 text-xs text-amber-600">{camera.error}</p>
            )}
            {loading && <p className="mt-2 text-xs text-slate-400">{loadingMsg}</p>}
            {EngineSwitch}
            {FusionPanel}
          </Card>
          <Card>
            <h3 className="font-semibold">小车决策</h3>
            {decision ? (
              <div className="mt-2">
                <div className="text-2xl font-bold text-brand-700">{decision.labelZh}</div>
                <p className="mt-1 text-xs text-slate-400">
                  来源：
                  {decision.source === 'mlp-lane'
                    ? 'MLP 巡线'
                    : decision.source === 'drive-class'
                      ? '训练四类'
                      : decision.clearPath
                        ? '避障（前方空旷）'
                        : '避障'}
                </p>
                <p className="mt-2 text-sm text-slate-600">{decision.reason}</p>
                {decision.trigger && (
                  <p className="mt-2 text-xs text-slate-400">
                    触发目标：{decision.trigger.labelZh}（{Math.round(decision.trigger.score * 100)}%）
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">点击「示例场景」或开启摄像头开始决策。</p>
            )}
            <p className="mt-4 rounded bg-slate-50 p-2 text-xs text-slate-500">
              基础：人/灯/停车牌近处 → S；障碍居中 → S，偏左 → R，偏右 → L；空旷 → F。
              融合开启后，空旷分支由 MLP 巡线接管。
            </p>
          </Card>
        </div>
      )}

      {step === 'connect' && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="font-semibold">实时画面 + 自动驾驶下发</h3>
            <FloatingPreview className="relative mt-2 w-full overflow-hidden rounded-lg">
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg bg-black"
                style={{ aspectRatio: '3 / 2' }}
              />
            </FloatingPreview>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={live ? 'primary' : 'ghost'}
                onClick={() => (live ? handleStopLive() : void handleStartLive())}
              >
                {live ? '停止实时决策' : '开启摄像头并决策'}
              </Button>
              {live && (
                <Button size="sm" variant="ghost" onClick={handleStopLive}>
                  停止
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={bluetooth.scanAndConnect}
                disabled={bluetooth.state === 'connected' || bluetooth.state === 'scanning' || bluetooth.state === 'connecting'}
              >
                {bluetooth.state === 'connected'
                  ? '小车已连接'
                  : bluetooth.state === 'scanning' || bluetooth.state === 'connecting'
                    ? '连接中…'
                    : '连接小车'}
              </Button>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              开启后约每 250ms 检测一次；连上小车会<strong>持续下发运动指令</strong>（同指令也会按间隔重发，避免小车停住）。
              可在下方切换引擎并开启「避障 + MLP 巡线」融合。
            </p>
            {camera.error && (
              <p className="mt-2 text-xs text-amber-600">{camera.error}</p>
            )}
            {EngineSwitch}
            {FusionPanel}
            {bluetooth.state === 'connected' ? (
              <p className="mt-3 text-xs text-green-600">
                已连接小车：运动指令按变化下发，最近下发——{lastSentLabel ?? '—'}
                {decision?.source === 'mlp-lane' ? '（MLP 巡线）' : ''}
              </p>
            ) : (
              <p className="mt-3 text-xs text-amber-600">
                未连接：点击「连接小车」配对蓝牙后，实时检测会自动下发指令。
              </p>
            )}
          </Card>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">小车蓝牙连接（Web Bluetooth）</p>
            <BluetoothPanel />
          </div>
        </div>
      )}
    </div>
  );
}
