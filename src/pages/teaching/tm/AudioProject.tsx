// SPDX-License-Identifier: AGPL-3.0-or-later
// 音乐 / 声音项目：纯前端、零额外模型依赖。
// 用麦克风采集声音 → 用 Web Audio AnalyserNode 取频谱特征 → 训练一个轻量
// tf.js 全连接分类头（迁移学习思想的简化版：用你采集的少量声音样本微调）。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
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
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ensureTfReady } from '@/lib/tf';
import type * as TF from '@tensorflow/tfjs';
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AudioProject({ onBack }: { onBack: () => void }) {
  const [classNames, setClassNames] = useState<string[]>(['声音 1', '声音 2']);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samplesRef = useRef<Float32Array[][]>([[], []]);
  const modelRef = useRef<TF.LayersModel | null>(null);
  const predictTimer = useRef<number | null>(null);
  const predictingRef = useRef(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [micReady, setMicReady] = useState(false);
  const [featDim, setFeatDim] = useState(512);
  const [counts, setCounts] = useState<number[]>([]);
  const [training, setTraining] = useState(false);
  const [trained, setTrained] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<Prediction[]>([]);
  // 当前置信度最高的类别（实时识别时用于醒目展示“胜出类别”）
  const topPrediction = prediction.length
    ? prediction.reduce((best, p) => (p.probability > best.probability ? p : best), prediction[0])
    : null;
  const [epochInfo, setEpochInfo] = useState('');
  const [history, setHistory] = useState<{ epoch: number; loss: number; acc: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const [params, setParams] = useState({ epochs: 12, learningRate: 0.001, batchSize: 8, denseUnits: 64 });

  const refreshCounts = useCallback(() => {
    setCounts(samplesRef.current.map((s) => s.length));
  }, []);

  // 类别数量变化时，保持 samplesRef 与 classNames 同长（尽量保留已采集样本），
  // 否则新增类别的 samples[idx] 为 undefined，采集时 .push 会报错
  useEffect(() => {
    if (!micReady) return;
    samplesRef.current = classNames.map((_, i) => samplesRef.current[i] ?? []);
    refreshCounts();
    setTrained(false);
    setPrediction([]);
    setExportMsg('');
  }, [classNames, micReady, refreshCounts]);

  // 实时频谱预览：麦克风开启时持续把当前声音频谱画到画布上，采集时也能直观看到声音
  useEffect(() => {
    if (!micReady) return;
    const analyser = analyserRef.current;
    const canvas = previewCanvasRef.current;
    if (!analyser || !canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(buf);
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.fillStyle = '#f1f5f9';
      ctx2d.fillRect(0, 0, w, h);
      const bins = buf.length;
      const barW = w / bins;
      for (let i = 0; i < bins; i++) {
        const v = buf[i] / 255;
        const barH = Math.max(1, v * h);
        const hue = 210 + (i / bins) * 70;
        ctx2d.fillStyle = `hsl(${hue}, 78%, ${60 - v * 12}%)`;
        ctx2d.fillRect(i * barW, h - barH, Math.max(1, barW - 0.6), barH);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [micReady]);


  const startMic = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持麦克风采集');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      streamRef.current = stream;
      samplesRef.current = classNames.map(() => []);
      setFeatDim(analyser.frequencyBinCount);
      setMicReady(true);
      refreshCounts();
    } catch (e) {
      setError('麦克风初始化失败：' + (e as Error).message);
    }
  }, [classNames, refreshCounts]);

  const stopMic = useCallback(() => {
    predictTimer.current && clearInterval(predictTimer.current);
    predictTimer.current = null;
    predictingRef.current = false;
    setPredicting(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    setMicReady(false);
  }, []);

  const captureExample = useCallback(
    async (idx: number) => {
      const analyser = analyserRef.current;
      if (!analyser) return setError('请先开启麦克风');
      setCapturing(true);
      try {
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const frames: number[][] = [];
        const start = performance.now();
        while (performance.now() - start < 1000) {
          analyser.getByteFrequencyData(buf);
          frames.push(Array.from(buf));
          await sleep(50);
        }
        const n = frames.length;
        const dim = frames[0].length;
        const avg = new Float32Array(dim);
        for (const f of frames) for (let i = 0; i < dim; i++) avg[i] += f[i] / 255 / n;
        samplesRef.current[idx].push(avg);
        setCounts(samplesRef.current.map((s) => s.length));
      } catch (e) {
        setError('采集失败：' + (e as Error).message);
      } finally {
        setCapturing(false);
      }
    },
    []
  );

  const stopPredict = useCallback(() => {
    predictTimer.current && clearInterval(predictTimer.current);
    predictTimer.current = null;
    predictingRef.current = false;
    setPredicting(false);
    setPrediction([]);
  }, []);

  const togglePredict = useCallback(() => {
    if (predictingRef.current) {
      stopPredict();
      return;
    }
    const analyser = analyserRef.current;
    const model = modelRef.current;
    if (!analyser || !model) return;
    predictingRef.current = true;
    setPredicting(true);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    predictTimer.current = window.setInterval(() => {
      analyser.getByteFrequencyData(buf);
      const vec = new Float32Array(buf.length);
      for (let i = 0; i < buf.length; i++) vec[i] = buf[i] / 255;
      void import('@tensorflow/tfjs').then((TFmod) => {
        const xs = TFmod.tensor2d([Array.from(vec)], [1, buf.length]);
        const out = model.predict(xs) as TF.Tensor;
        void out.data().then((data) => {
          setPrediction(
            classNames.map((name, i) => ({ className: name, probability: data[i] })).sort((a, b) => b.probability - a.probability)
          );
          xs.dispose();
          out.dispose();
        });
      });
    }, 120);
  }, [classNames, stopPredict]);

  const trainModel = useCallback(async () => {
    const analyser = analyserRef.current;
    if (!analyser) return setError('请先开启麦克风并采集样本');
    const total = samplesRef.current.reduce((a, s) => a + s.length, 0);
    if (total < classNames.length) return setError('每个类别至少需要 1 个样本才能训练');
    setError('');
    setTraining(true);
    setHistory([]);
    try {
      await ensureTfReady();
      const TF = await import('@tensorflow/tfjs');
      const dim = analyser.frequencyBinCount;
      const xs: number[][] = [];
      const ys: number[][] = [];
      samplesRef.current.forEach((samples, ci) => {
        samples.forEach((s) => {
          xs.push(Array.from(s));
          const onehot = classNames.map((_, i) => (i === ci ? 1 : 0));
          ys.push(onehot);
        });
      });
      const model = TF.sequential();
      model.add(TF.layers.dense({ inputShape: [dim], units: params.denseUnits, activation: 'relu' }));
      model.add(TF.layers.dense({ units: classNames.length, activation: 'softmax' }));
      model.compile({ optimizer: TF.train.adam(params.learningRate), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
      const tx = TF.tensor2d(xs, [xs.length, dim]);
      const ty = TF.tensor2d(ys, [ys.length, classNames.length]);
      await model.fit(tx, ty, {
        epochs: params.epochs,
        batchSize: Math.min(params.batchSize, xs.length),
        callbacks: {
          onEpochEnd: (epoch: number, logs: Record<string, number> | undefined) => {
            const loss = logs?.loss ?? 0;
            const acc = logs?.acc ?? logs?.accuracy ?? 0;
            setEpochInfo(`第 ${epoch + 1}/${params.epochs} 轮 · loss=${loss.toFixed(3)} · acc=${(acc * 100).toFixed(1)}%`);
            setHistory((h) => [...h, { epoch: epoch + 1, loss, acc }]);
          },
        },
      });
      tx.dispose();
      ty.dispose();
      modelRef.current = model;
      setTrained(true);
    } catch (e) {
      setError('训练失败：' + (e as Error).message);
    } finally {
      setTraining(false);
    }
  }, [classNames.length, params]);

  const resetAll = useCallback(() => {
    stopMic();
    modelRef.current?.dispose();
    modelRef.current = null;
    samplesRef.current = classNames.map(() => []);
    setTrained(false);
    setCounts([]);
    setPrediction([]);
    setHistory([]);
    setEpochInfo('');
    setExportMsg('');
    setError('');
  }, [stopMic, classNames]);

  const exportBundle = useCallback(async () => {
    const model = modelRef.current;
    if (!model) return setError('请先训练模型');
    setBusy(true);
    setExportMsg('');
    try {
      const TF = await import('@tensorflow/tfjs');
      let artifacts: TF.io.ModelArtifacts | null = null;
      await model.save(
        TF.io.withSaveHandler(async (a) => {
          artifacts = a;
          return { modelArtifactsInfo: { dateSaved: new Date() } as TF.io.ModelArtifactsInfo };
        })
      );
      const bundle = {
        format: 'ai-training-platform-audio/v1',
        name: 'ai-training-platform-audio',
        labels: classNames,
        featDim,
        timeStamp: new Date().toISOString(),
        modelTopology: artifacts!.modelTopology,
        weightSpecs: artifacts!.weightSpecs,
        weightData: arrayBufferToBase64(artifacts!.weightData as ArrayBuffer),
      };
      downloadBlob(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), 'ai-training-platform-audio.tm.json');
      setExportMsg('已导出单文件声音模型（可在本平台重新加载）');
    } catch (e) {
      setError('导出失败：' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [classNames, featDim]);

  const importBundle = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setBusy(true);
      setError('');
      try {
        const TF = await import('@tensorflow/tfjs');
        const bundle = JSON.parse(await file.text());
        if (bundle.format !== 'ai-training-platform-audio/v1') throw new Error('文件格式不匹配');
        const weightData = base64ToArrayBuffer(bundle.weightData);
        const handler: TF.io.IOHandler = {
          load: async () =>
            ({ modelTopology: bundle.modelTopology, weightSpecs: bundle.weightSpecs, weightData }) as TF.io.ModelArtifacts,
        };
        const loaded = await TF.loadLayersModel(handler);
        modelRef.current = loaded;
        setClassNames(bundle.labels ?? classNames);
        setFeatDim(bundle.featDim ?? 512);
        setTrained(true);
        setCounts(Array(bundle.labels?.length ?? classNames.length).fill(0));
        setExportMsg('已加载声音模型：' + (bundle.labels ?? classNames).join(' / '));
      } catch (err) {
        setError('加载失败：' + (err as Error).message);
      } finally {
        setBusy(false);
        e.target.value = '';
      }
    },
    [classNames]
  );

  useEffect(() => () => stopMic(), [stopMic]);

  const maxCount = Math.max(1, ...counts);

  const setLabel = (i: number, v: string) => setClassNames((prev) => prev.map((n, idx) => (idx === i ? v : n)));
  const addClass = () => {
    if (micReady || classNames.length >= CLASS_COLORS.length) return;
    setClassNames((prev) => [...prev, `声音 ${prev.length + 1}`]);
  };
  const removeClass = (i: number) => {
    if (micReady || classNames.length <= 2) return;
    setClassNames((prev) => prev.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> 返回项目选择
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <Mic className="h-7 w-7 text-brand-600" />
        <h2 className="text-2xl font-bold text-slate-800">音乐项目</h2>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">纯前端 · 零额外模型</span>
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
        用麦克风采集各种声音（说话、乐器、环境音…）作为样本，浏览器内用频谱特征训练一个轻量分类器。
        它是通用的「声音分类」入口，可训练任意你定义的声音类别。
      </p>

      <SectionCard icon={<Network className="h-5 w-5" />} title="① 采集样本 / 训练 / 实时识别">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">声音类别</span>
                {!micReady ? (
                  <button onClick={addClass} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                    <Plus className="h-3.5 w-3.5" /> 添加类别
                  </button>
                ) : (
                  <span className="text-[11px] text-gray-400">（已开启麦克风，类别数已固定）</span>
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
                      placeholder={`声音 ${i + 1}`}
                    />
                    {!micReady && classNames.length > 2 && (
                      <button onClick={() => removeClass(i)} className="text-slate-400 hover:text-rose-500" title="删除类别">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <span className="w-14 text-right text-[11px] text-slate-500">{counts[i] ?? 0} 段</span>
                    <Button size="sm" variant="ghost" onClick={() => captureExample(i)} disabled={!micReady} title="录制约 1 秒作为该类别样本">
                      采集
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!micReady ? (
                <Button size="sm" onClick={startMic} disabled={busy}>
                  <Mic className="mr-1 h-4 w-4" /> 开启麦克风
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={stopMic}>
                  <Square className="mr-1 h-4 w-4" /> 关闭麦克风
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={togglePredict} disabled={!micReady || !trained}>
                <Play className="mr-1 h-4 w-4" />
                {predicting ? '停止识别' : '实时识别'}
              </Button>
              <Button size="sm" variant="ghost" onClick={resetAll} title="清空样本并重置">
                <Trash2 className="mr-1 h-4 w-4" /> 重新开始
              </Button>
            </div>
            <p className="text-[11px] text-gray-400">
              点「采集」录制约 1 秒声音作为该类别样本；每个类别多录几段不同音量/距离更稳定。
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative mx-auto h-[224px] w-[224px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <canvas ref={previewCanvasRef} width={224} height={224} className="h-[224px] w-[224px]" />
              {!micReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs text-slate-400">麦克风未开启</span>
                </div>
              )}
              {micReady && capturing && (
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-rose-500/90 px-2 py-0.5 text-[11px] font-medium text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> 录制中
                </div>
              )}
            </div>
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">实时识别</div>
                {prediction.length === 0 ? (
                  <p className="text-[11px] text-gray-400">{trained ? '点「实时识别」查看声音分类结果' : '训练后开启实时识别'}</p>
                ) : (
                  <>
                    {topPrediction && (
                      <div className="mb-2 flex items-baseline gap-2 rounded-lg bg-brand-50 px-3 py-2">
                        <span className="text-xs text-brand-700">当前识别类别</span>
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
            <LabeledNum label="轮数" value={params.epochs} min={1} max={80} onChange={(v) => setParams((p) => ({ ...p, epochs: v }))} />
            <LabeledNum label="学习率" value={params.learningRate} step={0.0005} min={0.0001} max={0.1} digits={4} onChange={(v) => setParams((p) => ({ ...p, learningRate: v }))} />
            <LabeledNum label="批大小" value={params.batchSize} min={2} max={32} step={2} onChange={(v) => setParams((p) => ({ ...p, batchSize: v }))} />
            <LabeledNum label="隐藏单元" value={params.denseUnits} min={10} max={256} step={10} onChange={(v) => setParams((p) => ({ ...p, denseUnits: v }))} />
            <Button size="sm" onClick={trainModel} disabled={training || busy}>
              <Network className="mr-1 h-4 w-4" />
              {training ? '训练中…' : '开始训练'}
            </Button>
          </div>
          {epochInfo && <p className="text-[11px] text-brand-600">{epochInfo}</p>}
          {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
        </div>
      </SectionCard>

      <SectionCard icon={<BarChart3 className="h-5 w-5" />} title="② 训练原理可视化展示">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-600">
              <b>声音特征提取</b>：用 Web Audio 的 AnalyserNode 把麦克风信号转成频谱（频率维度上的能量分布），
              再训练一个轻量全连接分类头去区分不同声音。这是迁移学习思想的简化版——用你采集的少量声音样本微调。
            </p>
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              {['麦克风', '频谱特征', '特征向量', '可训练分类头', 'Softmax'].map((t, i, arr) => (
                <span key={i} className="flex items-center">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{t}</span>
                  {i < arr.length - 1 && <span className="px-1 text-slate-400">→</span>}
                </span>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-700">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              <span>声音分类对音量/环境较敏感，采集时尽量贴近真实使用场景、保持各类别样本量均衡。</span>
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
                <p className="text-[11px] text-gray-400">开启实时识别后可观察模型对每个类别的置信度。</p>
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

      <SectionCard icon={<Download className="h-5 w-4" />} title="③ 模型导出与下载">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={exportBundle} disabled={busy || !trained}>
            <Download className="mr-1 h-4 w-4" /> 导出声音模型 (.tm.json)
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
