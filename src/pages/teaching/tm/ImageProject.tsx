// SPDX-License-Identifier: AGPL-3.0-or-later
// 图像 / 姿势项目：基于 @teachablemachine/image 的迁移学习
// （冻结 MobileNet 提取特征 + 顶部可训练分类头）。
// 姿势项目复用同一套视觉迁移学习：采集不同姿势的摄像头画面作为样本，
// 模型学习的是姿势的“外观特征”。同时用 @tensorflow-models/pose-detection（MoveNet）
// 在预览上叠加骨骼关键点，便于直观看到当前姿态。
import { useCallback, useEffect, useRef, useState } from 'react';
import { FloatingPreview } from '@/components/shared/FloatingPreview';
import {
  Camera,
  Play,
  Square,
  Trash2,
  Network,
  Lightbulb,
  Download,
  Upload,
  GraduationCap,
  BarChart3,
  Boxes,
  Cpu,
  Plus,
  X,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ensureTfReady } from '@/lib/tf';
import type { TeachableMobileNet, Webcam } from '@teachablemachine/image';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import type * as TF from '@tensorflow/tfjs';

// COCO 17 关键点的骨骼连线（MoveNet 返回的关键点顺序与 COCO 一致）
const POSE_EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4], // 鼻子-眼-耳
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // 肩-肘-腕
  [5, 11], [6, 12], [11, 12], // 肩-髋-髋
  [11, 13], [13, 15], [12, 14], [14, 16], // 髋-膝-踝
];

// 在覆盖层画布上绘制关节节点 + 骨骼连线
function drawSkeleton(ctx: CanvasRenderingContext2D, poses: poseDetection.Pose[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  for (const pose of poses) {
    const kp = pose.keypoints;
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.5;
    for (const [a, b] of POSE_EDGES) {
      const ka = kp[a];
      const kb = kp[b];
      if (ka && kb && (ka.score ?? 0) > 0.3 && (kb.score ?? 0) > 0.3) {
        ctx.beginPath();
        ctx.moveTo(ka.x, ka.y);
        ctx.lineTo(kb.x, kb.y);
        ctx.stroke();
      }
    }
    for (const p of kp) {
      if ((p.score ?? 0) > 0.3) {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

import {
  CLASS_COLORS,
  SectionCard,
  UnsupportedNotice,
  SampleBars,
  PredictionBars,
  MiniLineChart,
  LabeledNum,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  downloadBlob,
} from './shared';

type Prediction = { className: string; probability: number };
type Variant = 'image' | 'pose';

const DEFAULTS: Record<Variant, string[]> = {
  image: ['类别 1', '类别 2'],
  pose: ['姿势 A', '姿势 B'],
};

export function ImageProject({ variant, onBack }: { variant: Variant; onBack: () => void }) {
  const isPose = variant === 'pose';

  const [classNames, setClassNames] = useState<string[]>(DEFAULTS[variant]);
  const [created, setCreated] = useState(false);

  const teachableRef = useRef<TeachableMobileNet | null>(null);
  const webcamRef = useRef<Webcam | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<number | null>(null);
  const predictingRef = useRef(false);
  const predictBusyRef = useRef(false);
  const preparedCountRef = useRef(0);
  const trainedRef = useRef(false);
  const poseDetectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const poseOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const poseBusyRef = useRef(false);

  const [camReady, setCamReady] = useState(false);
  const [counts, setCounts] = useState<number[]>([]);
  const [training, setTraining] = useState(false);
  const [trained, setTrained] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<Prediction[]>([]);
  const [epochInfo, setEpochInfo] = useState('');
  const [history, setHistory] = useState<{ epoch: number; loss: number; acc: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [poseLoading, setPoseLoading] = useState(false);

  const [params, setParams] = useState({ epochs: 8, learningRate: 0.001, batchSize: 16, denseUnits: 100 });

  // 当前置信度最高的类别（实时推理时用于醒目展示“胜出类别”）
  const topPrediction = prediction.length
    ? prediction.reduce((best, p) => (p.probability > best.probability ? p : best), prediction[0])
    : null;

  const refreshCounts = useCallback(() => {
    const t = teachableRef.current;
    if (!t) return;
    const next = Array.from({ length: classNames.length }, (_, i) => t.examples?.[i]?.length ?? 0);
    setCounts(next);
  }, [classNames.length]);

  const stopLoop = useCallback(() => {
    if (loopRef.current != null) cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
  }, []);

  const loop = useCallback(() => {
    const webcam = webcamRef.current;
    const canvas = canvasRef.current;
    const teachable = teachableRef.current;
    if (!webcam || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      webcam.update();
      ctx.drawImage(webcam.canvas, 0, 0, canvas.width, canvas.height);
    }
    // 姿势项目：在覆盖层画布上实时绘制关节节点与骨架
    if (isPose) {
      const detector = poseDetectorRef.current;
      const overlay = poseOverlayRef.current;
      if (detector && overlay && !poseBusyRef.current) {
        poseBusyRef.current = true;
        detector
          .estimatePoses(webcam.canvas)
          .then((poses) => {
            const octx = overlay.getContext('2d');
            if (octx) drawSkeleton(octx, poses, overlay.width, overlay.height);
          })
          .catch(() => undefined)
          .finally(() => {
            poseBusyRef.current = false;
          });
      }
    }
    if (predictingRef.current && teachable && trainedRef.current && !predictBusyRef.current) {
      predictBusyRef.current = true;
      teachable
        .predict(webcam.canvas)
        .then((pred) => setPrediction(pred))
        .catch((e) => {
          // 不要静默吞掉错误，否则界面只显示“实时预测”却无结果
          console.error('实时推理失败：', e);
          setError('实时推理失败：' + (e as Error).message);
        })
        .finally(() => {
          predictBusyRef.current = false;
        });
    }
    loopRef.current = requestAnimationFrame(loop);
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    try {
      await ensureTfReady();
      const tm = await import('@teachablemachine/image');
      if (!teachableRef.current) {
        setBusy(true);
        const teachable = await tm.createTeachable({ labels: classNames });
        // 必须调用 setLabels 才能初始化「每个类别一个示例数组」，否则 addExample 时
        // this.examples[idx] 为 undefined 而报错：Cannot read properties of undefined (reading 'push')
        teachable.setLabels(classNames);
        preparedCountRef.current = classNames.length;
        teachableRef.current = teachable;
        setCreated(true);
        setBusy(false);
        refreshCounts();
      }
      const webcam = new tm.Webcam(224, 224, true);
      await webcam.setup();
      await webcam.play();
      webcamRef.current = webcam;
      setCamReady(true);
      // 姿势项目：加载 MoveNet 姿态检测模型，用于在预览上叠加关节节点与骨架
      if (isPose && !poseDetectorRef.current) {
        setPoseLoading(true);
        try {
          await tf.setBackend('webgl');
          await tf.ready();
          poseDetectorRef.current = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
          );
        } catch (e) {
          setError('姿态模型加载失败（需联网下载）：' + (e as Error).message);
        } finally {
          setPoseLoading(false);
        }
      }
      stopLoop();
      loopRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError('摄像头或模型初始化失败：' + (e as Error).message);
    }
  }, [classNames, loop, refreshCounts, stopLoop, isPose]);

  const stopCamera = useCallback(() => {
    stopLoop();
    webcamRef.current?.stop();
    webcamRef.current = null;
    poseDetectorRef.current = null;
    setCamReady(false);
    predictingRef.current = false;
    setPredicting(false);
  }, [stopLoop]);

  // 类别数量/名称变化时，重新同步底层 teachable 的示例数组，避免 addExample 越界
  useEffect(() => {
    const t = teachableRef.current;
    if (!t) return; // 摄像头未开启时，createTeachable 会自动用最新 classNames
    if (t.numClasses !== classNames.length) {
      // 数量变化：重建示例数组（会清空已采集样本）
      t.setLabels(classNames);
      preparedCountRef.current = classNames.length;
      trainedRef.current = false;
      setCounts(Array(classNames.length).fill(0));
      setTrained(false);
      setPrediction([]);
      setExportMsg('');
    } else {
      classNames.forEach((name, i) => t.setLabel(i, name));
    }
  }, [classNames]);

  const captureExample = useCallback(
    async (idx: number) => {
      const webcam = webcamRef.current;
      const teachable = teachableRef.current;
      if (!webcam || !teachable) {
        setError('请先开启摄像头');
        return;
      }
      try {
        await teachable.addExample(idx, webcam.canvas);
        refreshCounts();
      } catch (e) {
        setError('采集失败：' + (e as Error).message);
      }
    },
    [refreshCounts]
  );

  const trainModel = useCallback(async () => {
    const teachable = teachableRef.current;
    if (!teachable) return;
    if (counts.reduce((a, b) => a + b, 0) < classNames.length) {
      setError('每个类别至少需要 1 个样本才能训练');
      return;
    }
    setError('');
    setTraining(true);
    setHistory([]);
    try {
      teachable.prepare();
      await teachable.train(params, {
        onEpochEnd: (epoch: number, logs: Record<string, number> | undefined) => {
          const loss = logs?.loss ?? 0;
          const acc = logs?.acc ?? logs?.accuracy ?? 0;
          setEpochInfo(`第 ${epoch + 1}/${params.epochs} 轮 · loss=${loss.toFixed(3)} · acc=${(acc * 100).toFixed(1)}%`);
          setHistory((h) => [...h, { epoch: epoch + 1, loss, acc }]);
        },
      });
      setTrained(true);
      trainedRef.current = true;
      teachable.setLabels(classNames);
    } catch (e) {
      setError('训练失败：' + (e as Error).message);
    } finally {
      setTraining(false);
    }
  }, [counts, classNames, params]);

  const togglePredict = useCallback(() => {
    const next = !predicting;
    predictingRef.current = next;
    setPredicting(next);
  }, [predicting]);

  const resetAll = useCallback(() => {
    stopCamera();
    teachableRef.current?.dispose();
    teachableRef.current = null;
    setCreated(false);
    setTrained(false);
    trainedRef.current = false;
    setCounts([]);
    setPrediction([]);
    setHistory([]);
    setEpochInfo('');
    setExportMsg('');
    setError('');
    setClassNames(DEFAULTS[variant]);
  }, [stopCamera, variant]);

  const exportBundle = useCallback(async () => {
    const teachable = teachableRef.current;
    if (!teachable) return setError('请先创建并训练模型');
    if (!trained) return setError('请先完成训练再导出');
    setBusy(true);
    setExportMsg('');
    try {
      const tf = (await import('@tensorflow/tfjs')) as typeof import('@tensorflow/tfjs');
      const model = teachable.asSequentialModel;
      let artifacts: TF.io.ModelArtifacts | null = null;
      await model.save(
        tf.io.withSaveHandler(async (a) => {
          artifacts = a;
          return { modelArtifactsInfo: { dateSaved: new Date() } as TF.io.ModelArtifactsInfo };
        })
      );
      const bundle = {
        format: 'ai-training-platform/v1',
        name: 'ai-training-platform-model',
        labels: classNames,
        variant,
        timeStamp: new Date().toISOString(),
        modelTopology: artifacts!.modelTopology,
        weightSpecs: artifacts!.weightSpecs,
        weightData: arrayBufferToBase64(artifacts!.weightData as ArrayBuffer),
      };
      downloadBlob(
        new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
        `ai-training-platform-${variant}.tm.json`
      );
      setExportMsg('已导出单文件模型（可离线保存并在本平台重新加载）');
    } catch (e) {
      setError('导出失败：' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [trained, classNames, variant]);

  const exportStandard = useCallback(async () => {
    const teachable = teachableRef.current;
    if (!teachable || !trained) return setError('请先完成训练再导出');
    setBusy(true);
    try {
      teachable.setLabels(classNames);
      await teachable.save(`ai-training-platform-${variant}`);
      setExportMsg('已导出标准格式（model.json + weights.bin + metadata.json）');
    } catch (e) {
      setError('导出失败：' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [trained, classNames, variant]);

  const importBundle = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setBusy(true);
      setError('');
      try {
        await ensureTfReady();
        const tm = await import('@teachablemachine/image');
        const tf = (await import('@tensorflow/tfjs')) as typeof import('@tensorflow/tfjs');
        const bundle = JSON.parse(await file.text());
        if (bundle.format !== 'ai-training-platform/v1') throw new Error('文件格式不匹配');
        const weightData = base64ToArrayBuffer(bundle.weightData);
        const handler: TF.io.IOHandler = {
          load: async () =>
            ({
              modelTopology: bundle.modelTopology,
              weightSpecs: bundle.weightSpecs,
              weightData,
            }) as TF.io.ModelArtifacts,
        };
        const loaded = await tf.loadLayersModel(handler);
        const teachable = await tm.createTeachable({ labels: bundle.labels ?? classNames });
        (teachable as unknown as { model: TF.LayersModel }).model = loaded;
        teachableRef.current = teachable;
        setClassNames(bundle.labels ?? classNames);
        setCreated(true);
        setTrained(true);
        trainedRef.current = true;
        setCounts(Array(bundle.labels?.length ?? classNames.length).fill(0));
        setExportMsg('已加载模型：' + (bundle.labels ?? classNames).join(' / '));
      } catch (err) {
        setError('加载失败：' + (err as Error).message);
      } finally {
        setBusy(false);
        e.target.value = '';
      }
    },
    [classNames]
  );

  useEffect(() => () => stopLoop(), [stopLoop]);

  const maxCount = Math.max(1, ...counts);

  const setLabel = (i: number, v: string) => {
    setClassNames((prev) => prev.map((n, idx) => (idx === i ? v : n)));
    if (teachableRef.current) teachableRef.current.setLabels(classNames.map((n, idx) => (idx === i ? v : n)));
  };
  const addClass = () => {
    if (created || classNames.length >= CLASS_COLORS.length) return;
    setClassNames((prev) => [...prev, `类别 ${prev.length + 1}`]);
  };
  const removeClass = (i: number) => {
    if (created || classNames.length <= 2) return;
    setClassNames((prev) => prev.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> 返回项目选择
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <GraduationCap className="h-7 w-7 text-brand-600" />
        <h2 className="text-2xl font-bold text-slate-800">{isPose ? '姿势项目' : '图像项目'}</h2>
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
        {isPose
          ? '采集不同姿势的摄像头画面作为样本，浏览器内通过迁移学习（冻结的 MobileNet 提取视觉特征 + 顶部可训练分类头）训练出一个能区分多种姿势的分类器。这是通用的「姿势分类」入口，不仅限于小车。'
          : '采集各类别的摄像头画面作为样本，浏览器内通过迁移学习（冻结的 MobileNet 提取特征 + 顶部可训练分类头）训练出一个专属图像分类器。它是通用的图像分类入口，可训练任意你定义的类别。'}
      </p>

      {/* ① 实操区域 */}
      <SectionCard icon={<Network className="h-5 w-5" />} title="① 采集样本 / 训练 / 实时推理">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">训练类别</span>
                {!created ? (
                  <button
                    onClick={addClass}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> 添加类别
                  </button>
                ) : (
                  <span className="text-[11px] text-gray-400">（已创建，类别数已固定）</span>
                )}
              </div>
              <div className="space-y-2">
                {classNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }}
                    >
                      {i + 1}
                    </span>
                    <input
                      value={name}
                      onChange={(e) => setLabel(i, e.target.value)}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                      placeholder={`类别 ${i + 1}`}
                    />
                    {!created && classNames.length > 2 && (
                      <button onClick={() => removeClass(i)} className="text-slate-400 hover:text-rose-500" title="删除类别">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <span className="w-14 text-right text-[11px] text-slate-500">{counts[i] ?? 0} 张</span>
                    <Button size="sm" variant="ghost" onClick={() => captureExample(i)} disabled={!camReady} title="用当前画面作为该类别样本">
                      采集
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!camReady ? (
                <Button size="sm" onClick={startCamera} disabled={busy}>
                  <Camera className="mr-1 h-4 w-4" /> 开启摄像头
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={stopCamera}>
                  <Square className="mr-1 h-4 w-4" /> 关闭摄像头
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={togglePredict} disabled={!camReady || !trained}>
                <Play className="mr-1 h-4 w-4" />
                {predicting ? '停止推理' : '实时推理'}
              </Button>
              <Button size="sm" variant="ghost" onClick={resetAll} title="清空样本并重建分类器">
                <Trash2 className="mr-1 h-4 w-4" /> 重新开始
              </Button>
            </div>
            <p className="text-[11px] text-gray-400">
              点「采集」把当前画面加入对应类别；每个类别多拍几张不同角度/姿势更稳定。
            </p>
          </div>

          <div className="space-y-3">
            <FloatingPreview className="relative mx-auto w-[224px]">
              <canvas ref={canvasRef} width={224} height={224} className="rounded-lg border border-slate-200 bg-slate-100" />
              {isPose && (
                <canvas
                  ref={poseOverlayRef}
                  width={224}
                  height={224}
                  className="pointer-events-none absolute left-0 top-0 rounded-lg"
                />
              )}
              {!camReady && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                  摄像头未开启
                </div>
              )}
              {isPose && poseLoading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/40 text-xs text-white">
                  姿态模型加载中…
                </div>
              )}
            </FloatingPreview>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">实时预测</div>
              {prediction.length === 0 ? (
                <p className="text-[11px] text-gray-400">{trained ? '点「实时推理」查看分类结果' : '训练后开启实时推理'}</p>
              ) : (
                <>
                  {topPrediction && (
                    <div className="mb-2 flex items-baseline gap-2 rounded-lg bg-brand-50 px-3 py-2">
                      <span className="text-xs text-brand-700">当前预测类别</span>
                      <span className="text-base font-bold text-brand-700">{topPrediction.className}</span>
                      <span className="text-sm font-semibold text-brand-500">
                        {(topPrediction.probability * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <PredictionBars prediction={prediction} />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-slate-500">训练超参：</span>
            <LabeledNum label="轮数" value={params.epochs} min={1} max={50} onChange={(v) => setParams((p) => ({ ...p, epochs: v }))} />
            <LabeledNum label="学习率" value={params.learningRate} step={0.0005} min={0.0001} max={0.1} digits={4} onChange={(v) => setParams((p) => ({ ...p, learningRate: v }))} />
            <LabeledNum label="批大小" value={params.batchSize} min={4} max={64} step={4} onChange={(v) => setParams((p) => ({ ...p, batchSize: v }))} />
            <LabeledNum label="隐藏单元" value={params.denseUnits} min={10} max={512} step={10} onChange={(v) => setParams((p) => ({ ...p, denseUnits: v }))} />
            <Button size="sm" onClick={trainModel} disabled={training || busy}>
              <Network className="mr-1 h-4 w-4" />
              {training ? '训练中…' : '开始训练'}
            </Button>
          </div>
          {epochInfo && <p className="text-[11px] text-brand-600">{epochInfo}</p>}
          {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
        </div>
      </SectionCard>

      {/* ② 原理可视化 */}
      <SectionCard icon={<BarChart3 className="h-5 w-5" />} title="② 训练原理可视化展示">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-600">
              <b>迁移学习</b>：底座是 ImageNet 上预训练好的 MobileNet（已学会“边缘/纹理/形状”等通用视觉特征，且被
              <b>冻结</b>不再更新）；我们只在顶部叠加一个很薄的全连接分类头，用你采集的少量样本去“微调”它。
              因此几十张图就能学会一个全新任务，而无需从零训练 CNN。
            </p>
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              {['画面', '冻结 MobileNet', '特征向量', '可训练分类头', 'Softmax'].map((t, i, arr) => (
                <span key={i} className="flex items-center">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{t}</span>
                  {i < arr.length - 1 && <span className="px-1 text-slate-400">→</span>}
                </span>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-700">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{isPose ? '姿势项目用“视觉外观”区分姿势；若需要骨骼关键点，可接入 pose-detection 抽取 17 个关键点后再训练。' : '迁移学习让少量样本也能泛化到没见过的相似画面。'}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                <Boxes className="h-4 w-4" /> 各类已采集样本
              </div>
              <SampleBars counts={counts} names={classNames} />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                <BarChart3 className="h-4 w-4" /> 训练过程（损失 / 准确率）
              </div>
              {history.length === 0 ? (
                <p className="text-[11px] text-gray-400">训练后将显示 loss 下降、accuracy 上升的曲线。</p>
              ) : (
                <MiniLineChart history={history} />
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                <Cpu className="h-4 w-4" /> 当前模型输出（Softmax 概率分布）
              </div>
              {prediction.length === 0 ? (
                <p className="text-[11px] text-gray-400">开启实时推理后可观察网络对每个类别的置信度。</p>
              ) : (
                <>
                  {topPrediction && (
                    <div className="mb-2 flex items-baseline gap-2 rounded-md bg-brand-50 px-3 py-1.5">
                      <span className="text-[11px] text-brand-700">胜出类别</span>
                      <span className="text-sm font-bold text-brand-700">{topPrediction.className}</span>
                      <span className="text-xs font-semibold text-brand-500">
                        {(topPrediction.probability * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <PredictionBars prediction={prediction} />
                </>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ③ 导出 */}
      <SectionCard icon={<Download className="h-5 w-5" />} title="③ 模型导出与下载">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={exportBundle} disabled={busy || !trained}>
            <Download className="mr-1 h-4 w-4" /> 导出单文件模型 (.tm.json)
          </Button>
          <Button size="sm" variant="ghost" onClick={exportStandard} disabled={busy || !trained}>
            <Download className="mr-1 h-4 w-4" /> 导出标准格式
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-md bg-white px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
            <Upload className="mr-1 h-4 w-4" /> 加载模型 (.tm.json)
            <input type="file" accept=".json,.tm.json" className="hidden" onChange={importBundle} />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          单文件 .tm.json 把网络结构与权重打包在一起，可离线保存并在本平台一键重新加载。
        </p>
        {exportMsg && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-green-600">
            <GraduationCap className="h-3.5 w-3.5" /> {exportMsg}
          </p>
        )}
        {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
      </SectionCard>
    </div>
  );
}
