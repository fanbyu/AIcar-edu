// SPDX-License-Identifier: AGPL-3.0-or-later
import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Video, Upload, Play, Square, CheckCircle2, CameraOff, Trash2, Loader2, Code2, Download, Save, Database, Sparkles, Radio } from 'lucide-react';
import { useCamera } from '@/features/train/useCamera';
import { FloatingPreview } from '@/components/shared/FloatingPreview';
import { useMobileNet } from '@/features/train/useMobileNet';
import { MlpTrainer as Mlp } from '@/features/train/mlpTrainer';
import { CLASSES, type CarClass } from '@/features/train/types';
import {
  addSample,
  clearSamples,
  deleteSample,
  loadSamples,
  updateSampleVec,
} from '@/features/train/datasetStore';
import { TrainingChart, type Point } from '@/features/train/trainingVis';
import { BluetoothPanel } from '@/components/shared/BluetoothPanel';
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import { driveCommandToLabel, encodeLabel } from '@/features/bluetooth/esp32Protocol';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import JSZip from 'jszip';

const STEPS = ['采集', '训练', '验证', '连接小车'];

/** 推理结果展示顺序（英文标签 + 对应中文类别） */
const PROB_ORDER: { zh: CarClass; en: string }[] = [
  { zh: '停', en: 'stop' },
  { zh: '前进', en: 'go' },
  { zh: '左', en: 'left' },
  { zh: '右', en: 'right' },
];

/** 可选的 MobileNet 版本（version + alpha） */
const MN_VERSIONS = [
  { label: 'mobilenet_v1_0.25_224', version: 1, alpha: 0.25 },
  { label: 'mobilenet_v1_0.50_224', version: 1, alpha: 0.5 },
  { label: 'mobilenet_v1_1.0_224', version: 1, alpha: 1.0 },
  { label: 'mobilenet_v2_1.0_224', version: 2, alpha: 1.0 },
] as const;

/** 神经网络代码的默认模板（学生可在此基础上修改） —— Teachable Machine 迁移学习风格 */
const DEFAULT_MLP_CODE = `let model = tf.sequential();
model.add(tf.layers.flatten({
    inputShape: truncatedMobileNet.outputs[0].shape.slice(1)// 自动获取当前选择的截断层输出形状
})); // 输入层，扁平化层

model.add(tf.layers.dense({
    units: denseUnits,
    activation: 'relu',
    kernelInitializer: 'varianceScaling',
    useBias: true
})); // 隐藏层，全连接层1

model.add(tf.layers.dense({
    units: numClasses,
    kernelInitializer: 'varianceScaling',
    useBias: false,
    activation: 'softmax'
})); // 输出层，全连接层2

initializeModel(model, tf, truncatedMobileNet, numClasses, denseUnits); // 初始化模型，不要修改这一行`;

/** 由帧/图片生成 224 原始图（导出用）与 112 缩略图（预览用） */
function makeImages(src: CanvasImageSource): { img: string; thumb: string } {
  const mk = (S: number, q: number) => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    c.getContext('2d')!.drawImage(src, 0, 0, S, S);
    return c.toDataURL('image/jpeg', q);
  };
  return { img: mk(224, 0.85), thumb: mk(112, 0.5) };
}

interface FeatureRow {
  id: number;
  vec: Float32Array;
  label: CarClass;
}

export function MlpTrainer() {
  const camera = useCamera();
  // MobileNet 特征提取器配置
  const [mnVersion, setMnVersion] = useState<1 | 2>(1);
  const [mnAlpha, setMnAlpha] = useState(0.25);
  const [truncLayer, setTruncLayer] = useState('conv_pw_13_relu');
  const { ready, error, infer, featureDim, truncatedMobileNet } = useMobileNet({
    version: mnVersion,
    alpha: mnAlpha,
    truncationLayer: truncLayer.trim() || undefined,
  });
  const trainer = useRef(new Mlp([...CLASSES]));
  const [activeClass, setActiveClass] = useState<CarClass>('前进');
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(CLASSES.map((c) => [c, 0]))
  );
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [saved, setSaved] = useState<{ id: number; label: CarClass; thumb: string; img: string }[]>([]);
  const [lr, setLr] = useState(0.0001);
  const [hidden, setHidden] = useState(50);
  const [batchSize, setBatchSize] = useState(64);
  const [epochs, setEpochs] = useState(20);
  const [modelCode, setModelCode] = useState(DEFAULT_MLP_CODE);
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
  // 采集反馈与提示
  const [flash, setFlash] = useState<{ label: CarClass; url: string } | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const bt = useBluetooth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  // 数据 / 模型 导入的隐藏文件输入框
  const dataFileRef = useRef<HTMLInputElement | null>(null);
  const modelFileRef = useRef<HTMLInputElement | null>(null);
  const flashTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  // 最新 infer / saved 引用，避免重提取 effect 拿到过期闭包
  const inferRef = useRef(infer);
  inferRef.current = infer;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  // 启动时从 IndexedDB 恢复已采集样本（含原始图 / 缩略图）
  useEffect(() => {
    loadSamples('mlp').then((rows) => {
      if (rows.length === 0) return;
      const feats: FeatureRow[] = [];
      const list: { id: number; label: CarClass; thumb: string; img: string }[] = [];
      const next = { ...Object.fromEntries(CLASSES.map((c) => [c, 0])) };
      for (const r of rows) {
        const id = r.id!;
        const label = r.label as CarClass;
        feats.push({ id, vec: Float32Array.from(r.vec), label });
        list.push({ id, label, thumb: r.thumb ?? r.img ?? '', img: r.img ?? r.thumb ?? '' });
        next[label] = (next[label] ?? 0) + 1;
      }
      setFeatures(feats);
      setSaved(list);
      setCounts(next);
    });
  }, []);

  useEffect(() => {
    if (features.length > 0) setStep((s) => Math.max(s, 1));
  }, [counts]);
  useEffect(() => {
    if (trained) setStep((s) => Math.max(s, 2));
  }, [trained]);

  // MobileNet 版本 / 截断层变更后，用新模型重新提取已采集图片的特征
  const lastCfgKey = useRef('');
  useEffect(() => {
    if (!ready) return;
    const key = `${mnVersion}|${mnAlpha}|${truncLayer}`;
    if (lastCfgKey.current === '') {
      lastCfgKey.current = key;
      return;
    }
    if (lastCfgKey.current === key) return;
    lastCfgKey.current = key;
    const list = savedRef.current;
    if (list.length === 0) return;
    (async () => {
      try {
        setWarn('MobileNet 配置已变更，正在用新模型重新提取所有样本特征…');
        const feats: FeatureRow[] = [];
        for (const s of list) {
          if (!s.img) {
            const old = features.find((f) => f.id === s.id);
            if (old) feats.push(old);
            continue;
          }
          const im = new Image();
          im.src = s.img;
          await im.decode();
          const vec = await inferRef.current(im);
          await updateSampleVec(s.id, Array.from(vec));
          feats.push({ id: s.id, vec, label: s.label });
        }
        setFeatures(feats);
        setWarn(null);
      } catch (e) {
        setWarn('重新提取特征失败：' + (e instanceof Error ? e.message : String(e)));
      }
    })();
  }, [ready, mnVersion, mnAlpha, truncLayer]);

  /** 公共：取一帧/图片 -> 提取特征 -> 入库 + 更新状态，返回样本信息 */
  async function storeSample(
    label: CarClass,
    frame: CanvasImageSource
  ): Promise<{ id: number; imgUrl: string }> {
    const vec = await infer(frame as never);
    const { img: imgUrl, thumb: thumbUrl } = makeImages(frame);
    const id = await addSample('mlp', label, vec, thumbUrl, imgUrl);
    setFeatures((p) => [...p, { id, vec, label }]);
    setCounts((c) => ({ ...c, [label]: (c[label] ?? 0) + 1 }));
    setSaved((s) => [...s, { id, label, thumb: thumbUrl, img: imgUrl }]);
    return { id, imgUrl };
  }

  async function captureForClass(label: CarClass) {
    if (!camera.active) { setWarn('请先开启摄像头再采集'); return; }
    if (!ready) { setWarn('MobileNet 模型加载中，请稍候…'); return; }
    const frame = camera.captureFrame();
    if (!frame) { setWarn('摄像头画面不可用'); return; }
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
    if (!ready) { setWarn('MobileNet 模型加载中，暂无法提取特征'); return; }
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

  /** 示例数据集：为每类生成若干张合成图片并提取特征，便于无摄像头快速体验 */
  async function loadExampleDataset(count = 12) {
    if (!ready) { setWarn('MobileNet 模型加载中，请稍候…'); return; }
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
    await deleteSample(id);
    setFeatures((p) => p.filter((x) => x.id !== id));
    setSaved((s) => s.filter((x) => x.id !== id));
    setCounts((c) => ({ ...c, [label]: Math.max(0, (c[label] ?? 1) - 1) }));
  }

  async function clearAll() {
    setLive(false);
    if (liveTimer.current) window.clearInterval(liveTimer.current);
    setFeatures([]);
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
    await clearSamples('mlp');
  }

  /** 用一组样本（含特征向量、可选原始图/缩略图）整体替换数据集，不触碰已训练模型 */
  async function applyDataset(
    entries: { label: string; vec: number[]; thumb?: string; img?: string }[]
  ) {
    await clearSamples('mlp');
    const next = Object.fromEntries(CLASSES.map((c) => [c, 0]));
    const feats: FeatureRow[] = [];
    const list: { id: number; label: CarClass; thumb: string; img: string }[] = [];
    for (const e of entries) {
      const label = e.label as CarClass;
      const vec = Float32Array.from(e.vec);
      const thumb = e.thumb ?? e.img ?? '';
      const img = e.img ?? e.thumb ?? '';
      const id = await addSample('mlp', label, vec, thumb || undefined, img || undefined);
      feats.push({ id, vec, label });
      list.push({ id, label, thumb, img });
      next[label] = (next[label] ?? 0) + 1;
    }
    setFeatures(feats);
    setSaved(list);
    setCounts(next);
    setStep(list.length > 0 ? Math.max(step, 1) : 0);
  }

  /** 用当前 MobileNet 重新提取所有已存样本特征，返回新 FeatureRow[]；失败返回 null */
  async function reExtractFeatures(): Promise<FeatureRow[] | null> {
    const list = savedRef.current;
    if (list.length === 0) {
      setWarn('特征与当前模型不匹配，且缺少原始图片无法重新提取，请重新采集或清空数据后重试。');
      return null;
    }
    const feats: FeatureRow[] = [];
    try {
      for (const s of list) {
        if (!s.img) {
          // 没有原始图片则保留旧特征（仍可能不匹配，仅作兜底）
          const old = features.find((x) => x.id === s.id);
          if (old) feats.push(old);
          continue;
        }
        const im = new Image();
        im.src = s.img;
        await im.decode();
        const vec = await inferRef.current(im);
        await updateSampleVec(s.id, Array.from(vec));
        feats.push({ id: s.id, vec, label: s.label });
      }
      setFeatures(feats);
      return feats;
    } catch (e) {
      setWarn('重新提取特征失败：' + (e instanceof Error ? e.message : String(e)));
      return null;
    }
  }

  async function startTrain() {
    // 样本不足：给出明确提示而非静默无反应
    if (features.length < 8) {
      setWarn(
        `样本不足：当前仅采集 ${features.length} 张，至少需 8 张（建议每类数十张）。无摄像头可点「示例数据集」一键生成 48 张，或先「开启摄像头」采集。`
      );
      return;
    }
    if (!ready) {
      setWarn('MobileNet 模型尚未就绪，请稍候…');
      return;
    }
    setTraining(true);
    setWarn(null);
    try {
      // 切换 MobileNet 版本/截断层后，已存特征维度可能与当前模型输入不一致，
      // 训练前先自检：不一致则用当前模型对所有已存图片重新提取，避免形状不匹配报错。
      let feats = features;
      if (features.length > 0 && featureDim > 0 && features[0].vec.length !== featureDim) {
        setWarn('特征维度与当前 MobileNet 配置不一致，正在重新提取所有样本特征…');
        const re = await reExtractFeatures();
        if (!re) {
          setTraining(false);
          return;
        }
        feats = re;
        setWarn(null);
      }
      // 切换超参/代码会重置模型，按当前配置重建
      trainer.current.setOptions({
        learningRate: lr,
        hiddenUnits: hidden,
        epochs,
        batchSize,
        modelCode: modelCode.trim() || undefined,
        truncatedMobileNet: truncatedMobileNet ?? undefined,
      });
      const f = feats.map((x) => x.vec);
      const lbl = feats.map((x) => x.label);
      await trainer.current.train(f, lbl, (e, logs) => {
        setEpoch(e + 1);
        setChart((prev) => [
          ...prev,
          {
            epoch: e + 1,
            // tfjs 准确率日志键名为 acc（部分版本为 accuracy），此处兼容两种
            loss: Number.isFinite(Number(logs.loss)) ? Number(logs.loss) : 0,
            acc: Number.isFinite(Number(logs.acc ?? (logs as Record<string, number>).accuracy))
              ? Number(logs.acc ?? (logs as Record<string, number>).accuracy)
              : 0,
          },
        ]);
      });
      setTrained(true);
      setWarn('训练完成，可点「实时图像分类」开始推理');
    } catch (err) {
      console.error('[MLP] 训练失败', err);
      setWarn('训练失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTraining(false);
    }
  }

  async function runInference() {
    const frame = camera.captureFrame();
    if (!frame || !ready || !trained) return;
    const vec = await infer(frame);
    const r = trainer.current.predict(vec);
    const all = trainer.current.predictProbs(vec);
    setPred(r);
    setPredAll(all);
    setStep(2);
    const map: Record<CarClass, 'F' | 'L' | 'R' | 'S'> = {
      前进: 'F',
      左: 'L',
      右: 'R',
      停: 'S',
    };
    if (bt.state === 'connected') {
      bt.send(map[r.label], 120);
      bt.sendText(encodeLabel(driveCommandToLabel(map[r.label])));
    }
  }

  /** 实时图像分类：定时抓取摄像头帧并推理，更新四类概率 */
  async function tickLive() {
    const frame = camera.captureFrame();
    if (!frame || !ready || !trained) return;
    const vec = await infer(frame);
    const all = trainer.current.predictProbs(vec);
    setPredAll(all);
    const top = all.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    setPred(top);
    const map: Record<CarClass, 'F' | 'L' | 'R' | 'S'> = {
      前进: 'F',
      左: 'L',
      右: 'R',
      停: 'S',
    };
    if (bt.state === 'connected') {
      bt.send(map[top.label], 120);
      bt.sendText(encodeLabel(driveCommandToLabel(map[top.label])));
    }
  }

  function toggleLive() {
    if (live) {
      setLive(false);
      if (liveTimer.current) window.clearInterval(liveTimer.current);
      return;
    }
    if (!ready || !trained) { setWarn('请先完成训练再开启实时推理'); return; }
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

  /** 保存数据：导出标准图像分类数据集（按类别分文件夹的原始标注图片 + JSON） */
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
          model: 'mobilenet',
          inputSize: 224,
          classifier: 'mlp',
          arch: { hiddenUnits: hidden, learningRate: lr },
          classes: CLASSES,
          count: annotations.length,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob('mlp-dataset.zip', blob);
  }

  /** 从数据集 ZIP 重新提取特征并恢复（需 MobileNet 就绪） */
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
    const entries: { label: string; vec: number[]; thumb?: string; img?: string }[] = [];
    for (const a of files) {
      const entry = zip.file('dataset/' + a.file);
      if (!entry) continue;
      const dataUrl = `data:image/jpeg;base64,${await entry.async('base64')}`;
      const im = new Image();
      im.src = dataUrl;
      await im.decode();
      const vec = await infer(im);
      const { img: imgUrl, thumb: thumbUrl } = makeImages(im);
      entries.push({ label: a.label, vec: Array.from(vec), thumb: thumbUrl, img: imgUrl });
    }
    await applyDataset(entries);
    setWarn(null);
    setFlash(null);
  }

  /** 构建模型导出 JSON 字符串（下载 / 缓存共用） */
  async function buildModelPayload(): Promise<string | null> {
    const artifacts = await trainer.current.exportArtifacts();
    if (!artifacts) return null;
    const rows = await loadSamples('mlp');
    return JSON.stringify({
      type: 'mlp-model',
      labels: CLASSES,
      opts: {
        learningRate: lr,
        hiddenUnits: hidden,
        epochs,
        batchSize,
        modelCode: modelCode.trim() || undefined,
        mobilenet: {
          version: mnVersion,
          alpha: mnAlpha,
          truncationLayer: truncLayer.trim() || undefined,
        },
      },
      model: artifacts,
      exportedAt: new Date().toISOString(),
      dataset: rows.map((r) => ({ label: r.label, vec: r.vec, img: r.img, thumb: r.thumb })),
    });
  }

  /** 下载模型：导出训练好的权重 + 超参 + 数据集快照（mlp-model.json） */
  async function exportModel() {
    const payload = await buildModelPayload();
    if (!payload) { setWarn('模型尚未训练，请先开始训练再保存'); return; }
    downloadBlob('mlp-model.json', new Blob([payload], { type: 'application/json' }));
  }

  /** 保存模型到浏览器缓存（localStorage），刷新/重开页面后会自动恢复 */
  async function saveToCache() {
    const payload = await buildModelPayload();
    if (!payload) { setWarn('模型尚未训练，请先开始训练再保存到缓存'); return; }
    localStorage.setItem('mlp-cached-model', payload);
    setCacheSaved(true);
  }

  /** 页面初始化后，若浏览器缓存中有模型则自动恢复（仅恢复权重，不动数据集） */
  useEffect(() => {
    if (!ready || cacheRestored.current) return;
    cacheRestored.current = true;
    const cached = localStorage.getItem('mlp-cached-model');
    if (!cached) return;
    (async () => {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.type === 'mlp-model' && parsed.model) {
          await trainer.current.importArtifacts(parsed.model);
          if (parsed.opts?.mobilenet) {
            setMnVersion(parsed.opts.mobilenet.version ?? mnVersion);
            setMnAlpha(parsed.opts.mobilenet.alpha ?? mnAlpha);
            setTruncLayer(parsed.opts.mobilenet.truncationLayer ?? '');
          }
          setTrained(true);
        }
      } catch {
        /* 缓存损坏则忽略 */
      }
    })();
  }, [ready]);

  /** 加载数据（支持 mlp-dataset.zip 或旧版 JSON）/ 模型（mlp-model.json） */
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
        if (!ready) {
          setWarn('MobileNet 模型加载中，加载数据需重新提取特征，请稍候…');
          return;
        }
        await importDatasetZip(file);
        return;
      }
      const parsed = JSON.parse(await file.text());
      if (kind === 'model' && parsed.type === 'mlp-model' && parsed.model) {
        if (!ready) {
          setWarn('MobileNet 已就绪即可恢复模型，请稍候…');
        }
        await trainer.current.importArtifacts(parsed.model);
        setLr(parsed.opts?.learningRate ?? lr);
        setHidden(parsed.opts?.hiddenUnits ?? hidden);
        setEpochs(parsed.opts?.epochs ?? epochs);
        setBatchSize(parsed.opts?.batchSize ?? batchSize);
        setModelCode(parsed.opts?.modelCode ?? '');
        const mn = parsed.opts?.mobilenet;
        if (mn) {
          setMnVersion(mn.version ?? mnVersion);
          setMnAlpha(mn.alpha ?? mnAlpha);
          setTruncLayer(mn.truncationLayer ?? '');
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
        `无法解析${kind === 'data' ? '数据' : '模型'}文件，请选择导出的 mlp ${kind === 'data' ? '数据' : '模型'}文件`
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
          <h1 className="mt-1 text-2xl font-bold text-slate-900">进阶：MobileNet + MLP 多层感知机</h1>
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
          {error && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              MobileNet 加载失败：{error}
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
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={features.length === 0}>
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
            <Button variant="ghost" size="sm" onClick={exportData} disabled={features.length === 0}>
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

            {/* MobileNet 特征提取器配置 */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">MobileNet 特征提取器</div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-600">
                  MobileNet 版本
                  <select
                    value={`${mnVersion}_${mnAlpha}`}
                    onChange={(e) => {
                      const [v, a] = e.target.value.split('_');
                      setMnVersion(Number(v) as 1 | 2);
                      setMnAlpha(Number(a));
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {MN_VERSIONS.map((v) => (
                      <option key={v.label} value={`${v.version}_${v.alpha}`}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  MobileNet 截断层
                  <input
                    type="text"
                    value={truncLayer}
                    onChange={(e) => setTruncLayer(e.target.value)}
                    placeholder="conv_pw_13_relu（留空=全局平均池化嵌入）"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                当前特征维度：{featureDim > 0 ? featureDim : '加载中…'}
                （变更版本 / 截断层后，会自动用新模型重新提取已采集图片的特征）
              </p>
            </div>

            {/* 超参数 */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                隐藏层神经元 Dense units：{hidden}
                <input
                  type="range"
                  min={8}
                  max={256}
                  step={2}
                  value={hidden}
                  onChange={(e) => setHidden(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </label>
              <label className="text-sm text-slate-600">
                批次大小 Batch Size：{batchSize}
                <input
                  type="range"
                  min={8}
                  max={128}
                  step={8}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </label>
              <label className="text-sm text-slate-600">
                训练轮数 Epoch：{epochs}
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={epochs}
                  onChange={(e) => setEpochs(Number(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </label>
            </div>

            <Button
              className="mt-3 w-full"
              onClick={startTrain}
              disabled={training || !ready}
              title={!ready ? 'MobileNet 模型加载中…' : features.length < 8 ? '请先采集至少 8 张样本' : undefined}
            >
              {training ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 训练中… Epoch {epoch}
                </>
              ) : (
                <>训练模型（{features.length} 样本{features.length < 8 ? ' · 不足' : ''}）</>
              )}
            </Button>

            {/* 神经网络代码（学生可编辑） */}
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                  <Code2 className="h-4 w-4 text-brand-500" /> 神经网络代码（自定义，留空则用默认 MLP）
                </span>
                <Button variant="ghost" size="sm" onClick={() => setModelCode(DEFAULT_MLP_CODE)}>
                  重置为默认
                </Button>
              </div>
              <textarea
                value={modelCode}
                onChange={(e) => setModelCode(e.target.value)}
                rows={9}
                spellCheck={false}
                placeholder={DEFAULT_MLP_CODE}
                className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-emerald-300"
              />
              <p className="mt-1 text-xs text-slate-400">
                用 <code className="rounded bg-slate-100 px-1">tf</code> 逐层搭建模型，可用变量：
                <code className="rounded bg-slate-100 px-1">truncatedMobileNet</code>
                （<code className="rounded bg-slate-100 px-1">outputs[0].shape.slice(1)</code> 即输入形状）、
                <code className="rounded bg-slate-100 px-1">numClasses</code>、
                <code className="rounded bg-slate-100 px-1">denseUnits</code>；末尾调用{' '}
                <code className="rounded bg-slate-100 px-1">
                  initializeModel(model, tf, truncatedMobileNet, numClasses, denseUnits)
                </code>{' '}
                注册并自动编译（此行勿改），学习率取上方滑块值。
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
                <Check className="h-3.5 w-3.5" /> 模型已保存在浏览器缓存（刷新页面会自动恢复）
              </div>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold text-slate-800">④ 推理验证（实时图像分类）</h2>
            <p className="mt-1 text-sm text-slate-600">人工智能小车自动驾驶程序</p>
            <p className="text-xs text-slate-400">实时图像分类</p>
            {ready && trained ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> MobileNet模型、小车自动驾驶模型已加载成功。
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
                        <span className="tabular-nums text-slate-500">{(p * 100).toFixed(1)}%</span>
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
        提示：MLP 在 MobileNet 特征之上叠加一层隐藏层做分类；采集足够图片（无摄像头可点「示例数据集」）后点「训练模型」，训练完成后即可「实时图像分类」；连接小车后，推理结果会自动经蓝牙下发给 ESP32。
      </p>
    </div>
  );
}
