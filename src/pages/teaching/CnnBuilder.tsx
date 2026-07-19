// SPDX-License-Identifier: AGPL-3.0-or-later
import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Video,
  Upload,
  Play,
  Square,
  CheckCircle2,
  CameraOff,
  Trash2,
  Loader2,
  Code2,
  Download,
  Save,
  Database,
  Sparkles,
  Radio,
} from 'lucide-react';
import { useCamera } from '@/features/train/useCamera';
import { FloatingPreview } from '@/components/shared/FloatingPreview';
import {
  CnnTrainer,
  DEFAULT_CNN_CODE,
  type CnnOptions,
} from '@/features/train/cnnTrainer';
import { CLASSES, type CarClass } from '@/features/train/types';
import {
  addCnnSample,
  clearCnnSamples,
  deleteCnnSample,
  loadCnnSamples,
} from '@/features/train/datasetStore';
import { TrainingChart, type Point } from '@/features/train/trainingVis';
import { BluetoothPanel } from '@/components/shared/BluetoothPanel';
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { tf, ensureTfReady } from '@/lib/tf';
import JSZip from 'jszip';

const STEPS = ['采集', '训练', '验证', '连接小车'];

/** 推理结果展示顺序（英文标签 + 对应中文类别） */
const PROB_ORDER: { zh: CarClass; en: string }[] = [
  { zh: '停', en: 'stop' },
  { zh: '前进', en: 'go' },
  { zh: '左', en: 'left' },
  { zh: '右', en: 'right' },
];

/** 由帧/图片生成 224 原始图（导出用）与 64 缩略图（预览用） */
function makeImages(src: CanvasImageSource): { img: string; thumb: string } {
  const mk = (S: number, q: number) => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    c.getContext('2d')!.drawImage(src, 0, 0, S, S);
    return c.toDataURL('image/jpeg', q);
  };
  return { img: mk(224, 0.85), thumb: mk(64, 0.5) };
}

/** 预解码图片（用于从 dataURL/原始图缩放为张量） */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

/** 把任意可绘制源缩放为 size×size，返回 RGB 归一化 Float32Array（长度 3*size*size） */
function imageToNormArray(src: CanvasImageSource, size: number): Float32Array {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  const out = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) {
    out[i] = d[i * 4] / 255;
    out[i + size * size] = d[i * 4 + 1] / 255;
    out[i + size * size * 2] = d[i * 4 + 2] / 255;
  }
  return out;
}

/** 画一张带有类别特征的合成图片（用于「示例数据集」一键演示） */
function drawSynthetic(label: CarClass, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 224;
  c.height = 224;
  const ctx = c.getContext('2d')!;
  const rng = (n: number) => {
    const x = Math.sin((seed + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const palette: Record<string, string> = {
    前进: '#16a34a',
    左: '#2563eb',
    右: '#ea580c',
    停: '#dc2626',
  };
  ctx.fillStyle = palette[label] ?? '#64748b';
  ctx.fillRect(0, 0, 224, 224);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `hsl(${rng(i) * 360},70%,${40 + rng(i + 9) * 30}%)`;
    const w = 30 + rng(i + 3) * 80;
    const h = 30 + rng(i + 5) * 80;
    const x = rng(i + 1) * (224 - w);
    const y = rng(i + 2) * (224 - h);
    if (label === '左') ctx.fillRect(0, y, w, h);
    else if (label === '右') ctx.fillRect(224 - w, y, w, h);
    else if (label === '停') ctx.fillRect(x, y, w, h);
    else ctx.fillRect(x, y, 224 - x, h);
  }
  ctx.globalAlpha = 1;
  return c;
}

interface SampleRow {
  id: number;
  label: CarClass;
  img: string;
  thumb: string;
}

export function CnnBuilder() {
  const camera = useCamera();
  const trainer = useRef(new CnnTrainer([...CLASSES]));
  const [ready, setReady] = useState(false);
  const [activeClass, setActiveClass] = useState<CarClass>('前进');
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(CLASSES.map((c) => [c, 0]))
  );
  const [saved, setSaved] = useState<SampleRow[]>([]);
  // CNN 超参数（符合 CNN 参数要求）
  const [imgSize, setImgSize] = useState(96);
  const [lr, setLr] = useState(0.001);
  const [batchSize, setBatchSize] = useState(8);
  const [epochs, setEpochs] = useState(2);
  const [modelCode, setModelCode] = useState(DEFAULT_CNN_CODE);
  const [training, setTraining] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [chart, setChart] = useState<Point[]>([]);
  const [trained, setTrained] = useState(false);
  const [step, setStep] = useState(0);
  const [pred, setPred] = useState<{ label: CarClass; confidence: number } | null>(null);
  const [predAll, setPredAll] = useState<{ label: CarClass; confidence: number }[] | null>(null);
  const [live, setLive] = useState(false);
  const [cacheSaved, setCacheSaved] = useState(false);
  const cacheRestored = useRef(false);
  const liveTimer = useRef<number>();
  const [flash, setFlash] = useState<{ label: CarClass; url: string } | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const bt = useBluetooth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dataFileRef = useRef<HTMLInputElement | null>(null);
  const modelFileRef = useRef<HTMLInputElement | null>(null);
  const flashTimer = useRef<number>();
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // 初始化 TF 后端，并从 IndexedDB 恢复已采集样本 / 浏览器缓存模型
  useEffect(() => {
    (async () => {
      await ensureTfReady();
      setReady(true);
      const rows = await loadCnnSamples();
      if (rows.length > 0) {
        const next = Object.fromEntries(CLASSES.map((c) => [c, 0]));
        const list: SampleRow[] = [];
        for (const r of rows) {
          const label = r.label as CarClass;
          list.push({ id: r.id!, label, img: r.img, thumb: r.thumb });
          next[label] = (next[label] ?? 0) + 1;
        }
        setSaved(list);
        setCounts(next);
      }
      // 浏览器缓存恢复（仅恢复权重 + 超参 + 数据集快照，不动 datasets 之外的状态）
      if (!cacheRestored.current) {
        cacheRestored.current = true;
        const cached = localStorage.getItem('cnn-cached-model');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed?.type === 'cnn-model' && parsed.model) {
              await trainer.current.importArtifacts(parsed.model);
              if (parsed.opts) {
                setImgSize(parsed.opts.imgSize ?? imgSize);
                setLr(parsed.opts.learningRate ?? lr);
                setBatchSize(parsed.opts.batchSize ?? batchSize);
                setEpochs(parsed.opts.epochs ?? epochs);
                setModelCode(parsed.opts.modelCode ?? DEFAULT_CNN_CODE);
              }
              const ds = parsed.dataset ?? [];
              await applyDataset(ds);
              setTrained(true);
            }
          } catch {
            /* 缓存损坏则忽略 */
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (saved.length > 0) setStep((s) => Math.max(s, 1));
  }, [counts]);
  useEffect(() => {
    if (trained) setStep((s) => Math.max(s, 2));
  }, [trained]);

  /** 公共：取一帧/图片 -> 生成 224 原图 + 缩略图 -> 入库 */
  async function storeSample(
    label: CarClass,
    frame: CanvasImageSource
  ): Promise<{ id: number; imgUrl: string }> {
    const { img: imgUrl, thumb: thumbUrl } = makeImages(frame);
    const id = await addCnnSample(label, imgUrl, thumbUrl);
    setSaved((p) => [...p, { id, label, img: imgUrl, thumb: thumbUrl }]);
    setCounts((c) => ({ ...c, [label]: (c[label] ?? 0) + 1 }));
    return { id, imgUrl };
  }

  async function captureForClass(label: CarClass) {
    if (!camera.active) {
      setWarn('请先开启摄像头再采集');
      return;
    }
    const frame = camera.captureFrame();
    if (!frame) {
      setWarn('摄像头画面不可用');
      return;
    }
    try {
      const { imgUrl } = await storeSample(label, frame);
      setActiveClass(label);
      setFlash({ label, url: imgUrl });
      setWarn(null);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1500);
    } catch {
      setWarn('采集失败，请重试');
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    try {
      const { imgUrl } = await storeSample(activeClass, img);
      setFlash({ label: activeClass, url: imgUrl });
      setWarn(null);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1500);
    } catch {
      setWarn('上传采集失败，请重试');
    }
    URL.revokeObjectURL(img.src);
  }

  /** 示例数据集：为每类生成若干张合成图，便于无摄像头快速体验 */
  async function loadExampleDataset(count = 12) {
    if (!ready) {
      setWarn('模型后端初始化中，请稍候…');
      return;
    }
    setWarn('正在生成示例数据集…');
    try {
      for (const label of CLASSES) {
        for (let i = 0; i < count; i++) {
          const canvas = drawSynthetic(label, i + CLASSES.indexOf(label) * 100);
          await storeSample(label, canvas);
        }
      }
      setWarn(null);
    } catch {
      setWarn('示例数据集生成失败');
    }
  }

  async function deleteOne(id: number, label: CarClass) {
    await deleteCnnSample(id);
    setSaved((p) => p.filter((x) => x.id !== id));
    setCounts((c) => ({ ...c, [label]: Math.max(0, (c[label] ?? 1) - 1) }));
  }

  async function clearAll() {
    setLive(false);
    if (liveTimer.current) window.clearInterval(liveTimer.current);
    setSaved([]);
    setCounts(Object.fromEntries(CLASSES.map((c) => [c, 0])));
    setChart([]);
    setTrained(false);
    setPred(null);
    setPredAll(null);
    setCacheSaved(false);
    setEpoch(0);
    setStep(0);
    setFlash(null);
    setWarn(null);
    await clearCnnSamples();
  }

  /** 用一组样本（原始图）整体替换数据集，不触碰已训练模型 */
  async function applyDataset(entries: { label: string; img: string; thumb?: string }[]) {
    await clearCnnSamples();
    const next = Object.fromEntries(CLASSES.map((c) => [c, 0]));
    const list: SampleRow[] = [];
    for (const e of entries) {
      const label = e.label as CarClass;
      const thumb = e.thumb ?? e.img;
      const id = await addCnnSample(label, e.img, thumb);
      list.push({ id, label, img: e.img, thumb });
      next[label] = (next[label] ?? 0) + 1;
    }
    setSaved(list);
    setCounts(next);
    setStep(list.length > 0 ? Math.max(step, 1) : 0);
  }

  async function startTrain() {
    if (saved.length < 8) {
      setWarn(
        `样本不足：当前仅采集 ${saved.length} 张，至少需 8 张（建议每类数十张）。无摄像头可点「示例数据集」一键生成 48 张，或先「开启摄像头」采集。`
      );
      return;
    }
    setTraining(true);
    setWarn(null);
    try {
      const opts: Partial<CnnOptions> = {
        learningRate: lr,
        epochs,
        batchSize,
        imgSize,
        numClasses: CLASSES.length,
        modelCode: modelCode.trim() || undefined,
      };
      trainer.current.setOptions(opts);
      const n = saved.length;
      const data = new Float32Array(n * 3 * imgSize * imgSize);
      for (let i = 0; i < n; i++) {
        const im = await loadImage(saved[i].img);
        const arr = imageToNormArray(im, imgSize);
        data.set(arr, i * 3 * imgSize * imgSize);
      }
      const xs = tf.tensor4d(data, [n, imgSize, imgSize, 3]);
      const labels = saved.map((s) => s.label);
      await trainer.current.train(xs, labels, (e, logs) => {
        setEpoch(e + 1);
        setChart((prev) => [
          ...prev,
          {
            epoch: e + 1,
            loss: Number.isFinite(Number(logs.loss)) ? Number(logs.loss) : 0,
            acc: Number.isFinite(Number(logs.acc ?? (logs as Record<string, number>).accuracy))
              ? Number(logs.acc ?? (logs as Record<string, number>).accuracy)
              : 0,
          },
        ]);
      });
      xs.dispose();
      setTrained(true);
      setWarn('训练完成，可点「实时图像分类」开始推理');
    } catch (err) {
      console.error('[CNN] 训练失败', err);
      setWarn('训练失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTraining(false);
    }
  }

  async function runInference() {
    const frame = camera.captureFrame();
    if (!frame || !trained) return;
    const arr = imageToNormArray(frame, imgSize);
    const all = trainer.current.predictProbs(arr);
    setPredAll(all);
    const top = all.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    setPred(top);
    setStep(2);
    const map: Record<CarClass, 'F' | 'L' | 'R' | 'S'> = {
      前进: 'F',
      左: 'L',
      右: 'R',
      停: 'S',
    };
    if (bt.state === 'connected') bt.send(map[top.label], 120);
  }

  async function tickLive() {
    const frame = camera.captureFrame();
    if (!frame || !trained) return;
    const arr = imageToNormArray(frame, imgSize);
    const all = trainer.current.predictProbs(arr);
    setPredAll(all);
    const top = all.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    setPred(top);
    const map: Record<CarClass, 'F' | 'L' | 'R' | 'S'> = {
      前进: 'F',
      左: 'L',
      右: 'R',
      停: 'S',
    };
    if (bt.state === 'connected') bt.send(map[top.label], 120);
  }

  function toggleLive() {
    if (live) {
      setLive(false);
      if (liveTimer.current) window.clearInterval(liveTimer.current);
      return;
    }
    if (!trained) {
      setWarn('请先完成「训练模型」再开启实时推理');
      return;
    }
    setLive(true);
    liveTimer.current = window.setInterval(() => void tickLive(), 400);
  }

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** 保存数据集：导出按类别分文件夹的原始标注图片 ZIP */
  async function exportData() {
    const zip = new JSZip();
    const root = zip.folder('dataset')!;
    const perClass: Record<string, number> = {};
    const annotations: { file: string; label: string }[] = [];
    for (const s of saved) {
      if (!s.img) continue;
      perClass[s.label] = (perClass[s.label] ?? 0) + 1;
      const fname = `${s.label}/${String(perClass[s.label]).padStart(4, '0')}.jpg`;
      root.file(fname, s.img.split(',')[1], { base64: true });
      annotations.push({ file: fname, label: s.label });
    }
    root.file('classes.txt', CLASSES.join('\n'));
    root.file('annotations.json', JSON.stringify(annotations, null, 2));
    root.file(
      'metadata.json',
      JSON.stringify(
        {
          model: 'cnn',
          inputSize: imgSize,
          classifier: 'cnn',
          arch: { learningRate: lr, epochs, batchSize, imgSize },
          classes: CLASSES,
          count: annotations.length,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob('cnn-dataset.zip', blob);
  }

  /** 从数据集 ZIP 恢复（按文件夹名取类别） */
  async function importDatasetZip(file: File) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const annFile = zip.file('dataset/annotations.json');
    let files: { file: string; label: string }[] = [];
    if (annFile) {
      const parsedAnn = JSON.parse(await annFile.async('string'));
      files = Array.isArray(parsedAnn) ? parsedAnn : parsedAnn.annotations ?? [];
    } else {
      zip.folder('dataset')?.forEach((rel, entry) => {
        if (!entry.dir && /\.(jpe?g|png)$/i.test(rel)) {
          files.push({ file: rel, label: rel.split('/')[0] });
        }
      });
    }
    if (files.length === 0) throw new Error('empty');
    const entries: { label: string; img: string; thumb?: string }[] = [];
    for (const a of files) {
      const entry = zip.file('dataset/' + a.file);
      if (!entry) continue;
      const dataUrl = `data:image/jpeg;base64,${await entry.async('base64')}`;
      const im = new Image();
      im.src = dataUrl;
      await im.decode();
      const { img, thumb } = makeImages(im);
      entries.push({ label: a.label, img, thumb });
    }
    await applyDataset(entries);
    setWarn(null);
    setFlash(null);
  }

  /** 构建模型导出 JSON 字符串（下载 / 缓存共用） */
  async function buildModelPayload(): Promise<string | null> {
    const artifacts = await trainer.current.exportArtifacts();
    if (!artifacts) return null;
    return JSON.stringify({
      type: 'cnn-model',
      labels: CLASSES,
      opts: {
        learningRate: lr,
        epochs,
        batchSize,
        imgSize,
        modelCode: modelCode.trim() || undefined,
      },
      model: artifacts,
      exportedAt: new Date().toISOString(),
      dataset: saved.map((s) => ({ label: s.label, img: s.img, thumb: s.thumb })),
    });
  }

  /** 下载模型：导出训练好的权重 + 超参 + 数据集快照（cnn-model.json） */
  async function exportModel() {
    const payload = await buildModelPayload();
    if (!payload) {
      setWarn('模型尚未训练，请先开始训练再下载');
      return;
    }
    downloadBlob('cnn-model.json', new Blob([payload], { type: 'application/json' }));
  }

  /** 保存模型到浏览器缓存（localStorage），刷新/重开页面后会自动恢复 */
  async function saveToCache() {
    const payload = await buildModelPayload();
    if (!payload) {
      setWarn('模型尚未训练，请先开始训练再保存到缓存');
      return;
    }
    localStorage.setItem('cnn-cached-model', payload);
    setCacheSaved(true);
  }

  /** 加载数据（支持 cnn-dataset.zip） / 模型（cnn-model.json） */
  async function importFromFile(e: React.ChangeEvent<HTMLInputElement>, kind: 'data' | 'model') {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const isZip =
        kind === 'data' &&
        (file.name.toLowerCase().endsWith('.zip') ||
          file.type === 'application/zip' ||
          file.type === 'application/x-zip-compressed');
      if (isZip) {
        await importDatasetZip(file);
        return;
      }
      const parsed = JSON.parse(await file.text());
      if (kind === 'model' && parsed.type === 'cnn-model' && parsed.model) {
        await trainer.current.importArtifacts(parsed.model);
        if (parsed.opts) {
          setImgSize(parsed.opts.imgSize ?? imgSize);
          setLr(parsed.opts.learningRate ?? lr);
          setBatchSize(parsed.opts.batchSize ?? batchSize);
          setEpochs(parsed.opts.epochs ?? epochs);
          setModelCode(parsed.opts.modelCode ?? DEFAULT_CNN_CODE);
        }
        const ds = parsed.dataset ?? [];
        await applyDataset(ds);
        setTrained(true);
        setWarn(null);
        setFlash(null);
        return;
      }
      const rows = Array.isArray(parsed) ? parsed : parsed.samples ?? parsed.dataset;
      if (!Array.isArray(rows)) throw new Error('bad');
      await applyDataset(rows);
      setWarn(null);
      setFlash(null);
    } catch {
      setWarn(
        `无法解析${kind === 'data' ? '数据' : '模型'}文件，请选择导出的 cnn ${kind === 'data' ? '数据' : '模型'}文件`
      );
    }
  }

  return (
    <div className="container-page py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/teaching" className="text-sm text-brand-600 hover:underline">
            ← 返回教学
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            高级：自定义 CNN 卷积神经网络（小车自动驾驶）
          </h1>
        </div>
      </div>

      {/* 步骤条 */}
      <div className="mt-4 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                i <= step ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-500'
              )}
            >
              {i < step ? '✓' : i + 1}
            </span>
            <span className={cn('text-sm', i <= step ? 'text-slate-800' : 'text-slate-400')}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* 采集区 */}
        <Card className="lg:col-span-3">
          <h2 className="font-semibold text-slate-800">① 采集图片（每类数十张即可）</h2>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <FloatingPreview className="relative w-full shrink-0 overflow-hidden rounded-xl bg-slate-900 sm:w-80 lg:w-96">
              <div className="aspect-video">
                <video ref={camera.videoRef} className="h-full w-full object-cover" muted playsInline />
              </div>
              {camera.error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white/80">
                  <CameraOff className="h-8 w-8" />
                  <p className="mt-2 text-xs">摄像头不可用，可上传图片兜底</p>
                </div>
              )}
            </FloatingPreview>
            <div className="flex flex-1 flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CLASSES.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    onClick={() => captureForClass(c)}
                    className={
                      'flex-col gap-0 px-2 py-1 ' +
                      (flash?.label === c ? 'ring-2 ring-emerald-400' : '')
                    }
                  >
                    <span>采集「{c}」</span>
                    <span className="text-xs opacity-80">已存 {counts[c] ?? 0}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {flash && (
            <div className="mt-3 flex animate-fade-up items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <img
                src={flash.url}
                alt={flash.label}
                className="h-12 w-12 rounded-md object-cover ring-1 ring-emerald-300"
              />
              <div>
                <div className="flex items-center gap-1 font-semibold">
                  <Check className="h-4 w-4" /> 已保存并分类为「{flash.label}」
                </div>
                <div className="text-xs text-emerald-600">
                  图像已写入「{flash.label}」通道，可用于训练
                </div>
              </div>
            </div>
          )}
          {warn && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              {warn}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!camera.active ? (
              <Button size="sm" onClick={camera.start}>
                <Video className="h-4 w-4" /> 开启摄像头
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={camera.stop}>
                <Square className="h-4 w-4" /> 关闭
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> 上传图片（{activeClass}）
            </Button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={saved.length === 0}>
              <Trash2 className="h-4 w-4" /> 清空数据
            </Button>
          </div>
        </Card>

        {/* 已存图片通道（预览 + 删除） */}
        <Card className="lg:col-span-2">
          <h2 className="font-semibold text-slate-800">② 已存图片（点击 ✕ 可删除）</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CLASSES.map((c) => {
              const imgs = saved.filter((s) => s.label === c);
              return (
                <div key={c}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{c}</span>
                    <span className="text-slate-400">{imgs.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {imgs.map((s) => (
                      <div key={s.id} className="group relative">
                        {s.img || s.thumb ? (
                          <img
                            src={s.img || s.thumb}
                            alt={c}
                            className="aspect-square w-full rounded object-cover ring-1 ring-slate-200"
                          />
                        ) : (
                          <div className="aspect-square w-full rounded bg-slate-100" />
                        )}
                        <button
                          onClick={() => deleteOne(s.id, c)}
                          title="删除该图片"
                          className="absolute right-0.5 top-0.5 hidden rounded bg-rose-500 p-0.5 text-white group-hover:block"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {imgs.length === 0 && (
                      <span className="col-span-3 text-[10px] text-slate-300">暂无</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <Button variant="ghost" size="sm" onClick={exportData} disabled={saved.length === 0}>
              <Database className="h-4 w-4" /> 保存数据集
            </Button>
            <Button variant="ghost" size="sm" onClick={() => loadExampleDataset()} disabled={!ready}>
              <Sparkles className="h-4 w-4" /> 示例数据集
            </Button>
            <Button variant="ghost" size="sm" onClick={() => dataFileRef.current?.click()}>
              <Upload className="h-4 w-4" /> 上传数据集
            </Button>
            <input
              ref={dataFileRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              hidden
              onChange={(e) => importFromFile(e, 'data')}
            />
          </div>
        </Card>

        {/* 训练 + 推理 + 连接 */}
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold text-slate-800">③ 训练（模型配置与超参数）</h2>

            {/* CNN 超参数（符合 CNN 参数要求） */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                图像长宽 image_width_height：{imgSize}
                <input
                  type="range"
                  min={32}
                  max={224}
                  step={8}
                  value={imgSize}
                  onChange={(e) => setImgSize(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </label>
              <label className="text-sm text-slate-600">
                学习率 Learning Rate：{lr}
                <input
                  type="range"
                  min={0.0001}
                  max={0.01}
                  step={0.0001}
                  value={lr}
                  onChange={(e) => setLr(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </label>
              <label className="text-sm text-slate-600">
                批次大小 Batch Size：{batchSize}
                <input
                  type="range"
                  min={1}
                  max={32}
                  step={1}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </label>
              <label className="text-sm text-slate-600">
                训练轮数 Epoch：{epochs}
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={epochs}
                  onChange={(e) => setEpochs(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              修改「图像长宽」会改变网络输入形状，需重新训练生效。
            </p>

            <Button
              className="mt-3 w-full"
              onClick={startTrain}
              disabled={training || !ready}
              title={
                !ready
                  ? '模型后端初始化中…'
                  : saved.length < 8
                    ? '请先采集至少 8 张样本'
                    : undefined
              }
            >
              {training ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 训练中… Epoch {epoch}
                </>
              ) : (
                <>训练模型（{saved.length} 样本{saved.length < 8 ? ' · 不足' : ''}）</>
              )}
            </Button>

            {/* 神经网络代码（学生可编辑） */}
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                  <Code2 className="h-4 w-4 text-brand-500" /> 神经网络代码（自定义，留空则用默认 CNN）
                </span>
                <Button variant="ghost" size="sm" onClick={() => setModelCode(DEFAULT_CNN_CODE)}>
                  重置为默认
                </Button>
              </div>
              <textarea
                value={modelCode}
                onChange={(e) => setModelCode(e.target.value)}
                rows={11}
                spellCheck={false}
                placeholder={DEFAULT_CNN_CODE}
                className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-emerald-300"
              />
              <p className="mt-1 text-xs text-slate-400">
                定义{' '}
                <code className="rounded bg-slate-100 px-1">model = tf.sequential()</code>{' '}
                并通过{' '}
                <code className="rounded bg-slate-100 px-1">
                  initializeModel(model, tf, numClasses, img_width_height)
                </code>{' '}
                注册并编译模型；可用变量：<code className="rounded bg-slate-100 px-1">tf</code> /{' '}
                <code className="rounded bg-slate-100 px-1">numClasses</code> /{' '}
                <code className="rounded bg-slate-100 px-1">img_width_height</code>（当前 {imgSize}）。
              </p>
            </div>

            <div className="mt-3">
              <TrainingChart data={chart} />
            </div>

            {/* 模型管理 */}
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <Button variant="ghost" size="sm" onClick={exportModel} disabled={!trained}>
                <Download className="h-4 w-4" /> 下载模型
              </Button>
              <Button variant="ghost" size="sm" onClick={saveToCache} disabled={!trained}>
                <Save className="h-4 w-4" /> 保存模型到缓存
              </Button>
              <Button variant="ghost" size="sm" onClick={() => modelFileRef.current?.click()}>
                <Upload className="h-4 w-4" /> 上传模型
              </Button>
              <input
                ref={modelFileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => importFromFile(e, 'model')}
              />
            </div>
            {cacheSaved && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                <Check className="h-3.5 w-3.5" /> 模型已保存在浏览器缓存
              </div>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold text-slate-800">④ 推理验证（实时图像分类）</h2>
            <p className="mt-1 text-sm text-slate-600">人工智能小车自动驾驶程序</p>
            <p className="text-xs text-slate-400">实时图像分类</p>
            {ready && trained ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> CNN模型、小车自动驾驶模型已加载成功。
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-600">请先完成「训练模型」再开启实时推理</p>
            )}

            <div className="mt-3 flex gap-2">
              <Button className="flex-1" onClick={toggleLive} disabled={!ready || !trained}>
                <Radio className="h-4 w-4" /> {live ? '停止实时' : '实时图像分类'}
              </Button>
              <Button variant="ghost" size="sm" onClick={runInference} disabled={!ready || !trained}>
                <Play className="h-4 w-4" /> 单张推理
              </Button>
            </div>

            {predAll && (
              <div className="mt-3">
                <div className="text-xs text-slate-500">推理结果如下：</div>
                {PROB_ORDER.map(({ zh, en }) => {
                  const p = predAll.find((x) => x.label === zh)?.confidence ?? 0;
                  return (
                    <div key={en} className="mt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600">{en}</span>
                        <span className="tabular-nums text-slate-500">
                          {en}，概率：{(p * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100">
                        <div
                          className="h-full rounded bg-brand-500 transition-all duration-200"
                          style={{ width: `${Math.max(2, p * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {pred && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold text-brand-600">
                  <CheckCircle2 className="h-4 w-4" /> 预测：{pred.label}
                  <span className="text-xs font-normal text-slate-500">
                    （{(pred.confidence * 100).toFixed(1)}%）
                  </span>
                </div>
              </div>
            )}
          </Card>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">⑤ 连接真实小车（Web Bluetooth）</p>
            <BluetoothPanel compact />
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-400">
        提示：CNN 直接从原始图像 [image_width_height, image_width_height, 3] 学习特征，无需 MobileNet；
        采集足够图片（无摄像头可点「示例数据集」）后点「训练模型」，训练完成后即可「实时图像分类」；连接小车后，推理结果会自动经蓝牙下发给 ESP32。
      </p>
    </div>
  );
}
