// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useRef, useState } from 'react';
import { useCamera } from '@/features/train/useCamera';
import { FloatingPreview } from '@/components/shared/FloatingPreview';
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import { Card, Chip } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BluetoothPanel } from '@/components/shared/BluetoothPanel';
import type { CarCommand } from '@/features/bluetooth/esp32Protocol';
import { cn } from '@/lib/utils';
import {
  buildDemoScene,
  decideDriving,
  toZh,
  type DetectedObject,
  type DrivingDecision,
} from '@/features/train/yoloDetector';
import { createDetector, AVAILABLE_DETECTORS } from '@/features/train/detectors';
import type { DetectInput, DetectorEngine, YoloWorldConfig } from '@/features/train/detectors/types';

type Step = 'understand' | 'detect' | 'decide' | 'connect';

const YOLO_PROMPTS_DEFAULT = 'person, car, bus, truck, motorcycle, bicycle, traffic light, stop sign';

export function YoloDetector() {
  const camera = useCamera();
  const bluetooth = useBluetooth();

  const [step, setStep] = useState<Step>('understand');
  const [detections, setDetections] = useState<DetectedObject[]>([]);
  const [decision, setDecision] = useState<DrivingDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  // 检测引擎：coco-ssd（TF.js）基线 vs YOLO-World（ort-web）开放词汇。
  const [engine, setEngine] = useState<DetectorEngine>('tfjs-coco');
  const [promptsText, setPromptsText] = useState(YOLO_PROMPTS_DEFAULT);

  // YOLO-World 模型来源（页面内加载，无需服务器命令）：
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | null>(null);
  const [modelUrl, setModelUrl] = useState('');
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelErr, setModelErr] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveTimer = useRef<number | null>(null);
  const lastSent = useRef<CarCommand | null>(null);

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
      const cfg: YoloWorldConfig | undefined =
        engine === 'ort-yolo-world'
          ? { modelBuffer: modelBuffer ?? undefined, modelUrl: modelUrl || undefined }
          : undefined;
      backendRef.current = createDetector(engine, cfg);
      engineRef.current = engine;
    }
    return backendRef.current;
  }, [engine, modelBuffer, modelUrl]);

  // 在浏览器内加载 YOLO-World 模型（上传的字节优先，其次 URL，再次默认静态路径）。
  const doLoadModel = useCallback(
    async (buffer?: ArrayBuffer, url?: string) => {
      setModelStatus('loading');
      setModelErr('');
      setError(null);
      try {
        const cfg: YoloWorldConfig = { modelBuffer: buffer, modelUrl: url };
        const backend = createDetector('ort-yolo-world', cfg);
        await backend.load(promptsFromText(promptsText));
        backendRef.current = backend;
        engineRef.current = 'ort-yolo-world';
        setModelStatus('ready');
      } catch (e) {
        setModelStatus('error');
        setModelErr((e as Error).message);
      }
    },
    [promptsText]
  );

  const handleModelFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const buf = await file.arrayBuffer();
      setModelBuffer(buf);
      setModelUrl('');
      await doLoadModel(buf, undefined);
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
    await doLoadModel(undefined, url);
  }, [modelUrl, doLoadModel]);

  const handleLoadDefault = useCallback(async () => {
    setModelBuffer(null);
    setModelUrl('');
    await doLoadModel(undefined, '');
  }, [doLoadModel]);

  const runDetect = useCallback(
    async (input: DetectInput): Promise<DetectedObject[]> => {
      // YOLO-World 必须先在本页加载模型（上传 / URL），否则给明确引导而非静默失败。
      if (engine === 'ort-yolo-world' && modelStatus !== 'ready') {
        setError('请先在下方「加载 YOLO-World 模型」（上传 .onnx 或填写 URL），再开始检测。');
        return [];
      }
      const backend = getBackend();
      const prompts =
        engine === 'ort-yolo-world' ? promptsFromText(promptsText) : undefined;
      return backend.detect(input, { prompts });
    },
    [engine, modelStatus, getBackend, promptsFromText, promptsText]
  );

  const renderFrame = useCallback(
    (src: CanvasImageSource, w: number, h: number, dets: DetectedObject[]): DrivingDecision | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(src, 0, 0, w, h);
      ctx.lineWidth = Math.max(2, Math.round(w / 240));
      ctx.font = `${Math.max(12, Math.round(w / 36))}px sans-serif`;
      ctx.strokeStyle = '#3b82f6';
      ctx.fillStyle = '#3b82f6';
      for (const d of dets) {
        const [x, y, bw, bh] = d.bbox;
        const isTrigger = decision && decision.trigger === d;
        ctx.strokeStyle = isTrigger ? '#22c55e' : '#3b82f6';
        ctx.fillStyle = isTrigger ? '#22c55e' : '#3b82f6';
        ctx.strokeRect(x, y, bw, bh);
        const tag = `${d.labelZh} ${Math.round(d.score * 100)}%`;
        const tw = ctx.measureText(tag).width;
        ctx.fillRect(x, y - 18, tw + 8, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(tag, x + 4, y - 5);
      }
      const dec = decideDriving(dets, w, h);
      setDetections(dets);
      setDecision(dec);
      return dec;
    },
    [decision]
  );

  const handleDetectSource = useCallback(
    async (input: DetectInput) => {
      setError(null);
      setLoading(true);
      setLoadingMsg(engine === 'ort-yolo-world' ? 'YOLO-World 推理中…' : '检测中…');
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
        renderFrame(src, w, h, dets);
      } catch (e) {
        setError('检测失败：' + (e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [engine, runDetect, renderFrame]
  );

  const handleDemo = useCallback(() => {
    setError(null);
    const { canvas, detections: demoDetections } = buildDemoScene();
    renderFrame(canvas, canvas.width, canvas.height, demoDetections);
  }, [renderFrame]);

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

  const handleStartCamera = useCallback(() => {
    if (camera.active) return;
    camera.start();
    setError(null);
  }, [camera]);

  const tick = useCallback(async () => {
    const video = camera.videoRef.current;
    if (!video || video.videoWidth === 0) return;
    try {
      const dets = await runDetect({ htmlVideo: video });
      const dec = renderFrame(video, video.videoWidth, video.videoHeight, dets);
      if (
        dec &&
        step === 'decide' &&
        bluetooth.state === 'connected' &&
        dec.command !== lastSent.current
      ) {
        lastSent.current = dec.command;
        bluetooth.send(dec.command, 150);
      }
    } catch (e) {
      setError('检测失败：' + (e as Error).message);
      if (liveTimer.current) {
        clearInterval(liveTimer.current);
        liveTimer.current = null;
      }
    }
  }, [camera.videoRef, renderFrame, step, bluetooth, runDetect]);

  const handleStartLive = useCallback(() => {
    if (!camera.active) {
      camera.start();
      return;
    }
    if (liveTimer.current) return;
    liveTimer.current = window.setInterval(tick, 600);
  }, [camera, tick]);

  const handleStopLive = useCallback(() => {
    if (liveTimer.current) {
      clearInterval(liveTimer.current);
      liveTimer.current = null;
    }
  }, []);

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
              // 切到 YOLO-World 时重置模型加载态；切回 coco-ssd 清空模型来源。
              setModelStatus('idle');
              setModelErr('');
              setModelBuffer(null);
              setModelUrl('');
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
      {engine === 'ort-yolo-world' ? (
        <div className="mt-2 space-y-2">
          <input
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="文本提示，逗号分隔，如 person, car, traffic light"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-md bg-brand-600 px-2.5 py-1.5 text-xs text-white">
              选择 ONNX 文件
              <input type="file" accept=".onnx" className="hidden" onChange={handleModelFile} />
            </label>
            <input
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              placeholder="模型 URL（可选，如 https://.../yolo-world.onnx）"
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
            开放词汇：模型将检测你写的类别（词序需与导出 ONNX 的 --custom-text 一致）。
            浏览器内**不会**执行 export_onnx.py（需 PyTorch）；请上传已导出的 .onnx，或填其 URL。
            模型状态：
            <b className={cn(modelStatus === 'ready' ? 'text-green-600' : 'text-amber-600')}>
              {modelStatus === 'ready'
                ? ' 已加载 ✓'
                : modelStatus === 'loading'
                  ? ' 加载中…'
                  : modelStatus === 'error'
                    ? ' 加载失败'
                    : ' 未加载（请先上传/填写）'}
            </b>
          </p>
          {modelErr && <p className="text-[11px] text-red-500">模型加载失败：{modelErr}</p>}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-gray-400">{AVAILABLE_DETECTORS[0].note}</p>
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
          我们用浏览器端实时检测模型：coco-ssd（TF.js，与 YOLO 同族、封闭词汇即用）作为基线，
          并用 YOLO-World（ort-web，开放词汇、文本提示任意类别）作为升级，把检测结果直接变成小车避障指令。
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
            <h3 className="mt-4 font-semibold">本关用的两个引擎</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>
                <b>coco-ssd（TF.js）</b>：SSD + MobileNetV2，封闭 80 类，无需训练即开即用，作为检测基线。
              </li>
              <li>
                <b>YOLO-World（ort-web）</b>：开放词汇——你写“文本提示”它就能检测对应类别（零样本），
                需把 PyTorch 模型导出为 ONNX 后用 ONNX Runtime Web 在浏览器推理。
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-400">
              TF.js 适合“浏览器内训练”的前三级；PyTorch→ONNX→ort-web 则是运行 YOLO-World 这类 SOTA 检测模型的自然路径。
            </p>
          </Card>
          <Card>
            <h3 className="font-semibold">检测框怎么变成“开车指令”？</h3>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
{`正前方有人/停车标志/红绿灯(近) → 停车(S)
障碍在路中央(近)            → 停车(S)
障碍偏左                    → 右转(R)
障碍偏右                    → 左转(L)
前方空旷                    → 前进(F)`}
            </pre>
            <p className="mt-3 text-sm text-slate-600">
              约定：画面正中央 = 小车正前方；框越大 = 离得越近 = 越危险。
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
            </div>
            {loading && <p className="mt-2 text-xs text-slate-400">{loadingMsg}</p>}
            {EngineSwitch}
          </Card>
          <Card>
            <h3 className="font-semibold">本帧检测到的目标</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {detections.length === 0 && (
                <li className="text-slate-400">点击「示例场景」或上传图片查看。</li>
              )}
              {detections.map((d, i) => (
                <li key={i} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                  <span>{d.labelZh}</span>
                  <span className="text-slate-400">{Math.round(d.score * 100)}%</span>
                </li>
              ))}
            </ul>
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
              <Button size="sm" variant="ghost" onClick={handleStartLive}>
                {liveTimer.current ? '实时决策中…（再点停止）' : '开启摄像头并决策'}
              </Button>
              {liveTimer.current && (
                <Button size="sm" variant="ghost" onClick={handleStopLive}>
                  停止
                </Button>
              )}
            </div>
            {loading && <p className="mt-2 text-xs text-slate-400">{loadingMsg}</p>}
            {EngineSwitch}
          </Card>
          <Card>
            <h3 className="font-semibold">小车决策</h3>
            {decision ? (
              <div className="mt-2">
                <div className="text-2xl font-bold text-brand-700">{decision.labelZh}</div>
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
              决策逻辑与检测引擎无关：coco-ssd 与 YOLO-World 的输出都映射成同一套 F/L/R/S 指令。
            </p>
          </Card>
        </div>
      )}

      {step === 'connect' && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <BluetoothPanel />
          <Card>
            <h3 className="font-semibold">把“看到”变成“行动”</h3>
            <p className="mt-2 text-sm text-slate-600">
              在「自动驾驶决策」一步开启蓝牙并连上小车，每 600ms 检测一次；
              当决策指令变化时，自动下发到 ESP32（***REMOVED***）。
            </p>
            <p className="mt-3 text-sm text-slate-600">
              建议先用「示例场景」确认决策方向正确，再切到实时摄像头，并始终把车放在安全区域调试。
            </p>
            {bluetooth.state === 'connected' ? (
              <p className="mt-3 text-xs text-green-600">已连接小车，指令自动下发（变化时发送）。</p>
            ) : (
              <p className="mt-3 text-xs text-amber-600">
                未连接：请先在左侧「连接小车」中配对蓝牙，再到「自动驾驶决策」开启实时检测。
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
