// SPDX-License-Identifier: AGPL-3.0-or-later
import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Video, Upload, Play, Square, CheckCircle2, CameraOff, Trash2 } from 'lucide-react';
import { useCamera } from '@/features/train/useCamera';
import { FloatingPreview } from '@/components/shared/FloatingPreview';
import { useMobileNet } from '@/features/train/useMobileNet';
import { KnnClassifier } from '@/features/train/knnClassifier';
import { CLASSES, type CarClass } from '@/features/train/types';
import { addSample, clearSamples, deleteSample, loadSamples } from '@/features/train/datasetStore';
import JSZip from 'jszip';
import { BluetoothPanel } from '@/components/shared/BluetoothPanel';
import AiTrainingPlatform from './AiTrainingPlatform';
import { useBluetooth } from '@/features/bluetooth/useBluetooth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const STEPS = ['采集', '训练', '验证', '连接小车'];

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

export function KnnTrainer() {
  const camera = useCamera();
  const { ready, error: tfError, infer } = useMobileNet();
  const classifier = useRef(new KnnClassifier([...CLASSES]));
  const [activeClass, setActiveClass] = useState<CarClass>('前进');
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(CLASSES.map((c) => [c, 0]))
  );
  const [step, setStep] = useState(0);
  const [predicting, setPredicting] = useState(false);
  const [pred, setPred] = useState<{
    label: CarClass;
    confidence: number;
    neighbors: { label: CarClass; dist: number }[];
    k: number;
  } | null>(null);
  // K 值（近邻个数）：学生可调，用于理解 k 对分类结果的影响
  const [k, setK] = useState(3);
  const lastVecRef = useRef<Float32Array | null>(null);
  const [kScan, setKScan] = useState<{ k: number; label: CarClass; confidence: number }[]>([]);
  const bt = useBluetooth();
  const fileRef = useRef<HTMLInputElement | null>(null);
  // 数据 / 模型 导入的隐藏文件输入框
  const dataFileRef = useRef<HTMLInputElement | null>(null);
  const modelFileRef = useRef<HTMLInputElement | null>(null);
  // 采集反馈与提示
  const [flash, setFlash] = useState<{ label: CarClass; url: string } | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  // 已持久化的样本（含缩略图与原始图），用于通道预览与删除
  const [saved, setSaved] = useState<{ id: number; label: CarClass; thumb: string; img: string }[]>([]);
  // 实时预览帧的余弦相似度 Top 4
  const [liveSim, setLiveSim] = useState<{ label: CarClass; sim: number }[]>([]);
  const flashTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // 启动时从 IndexedDB 恢复已采集样本
  useEffect(() => {
    loadSamples('knn').then((rows) => {
      const next = { ...Object.fromEntries(CLASSES.map((c) => [c, 0])) };
      const list: { id: number; label: CarClass; thumb: string; img: string }[] = [];
      for (const r of rows) {
        const id = r.id!;
        const label = r.label as CarClass;
        classifier.current.addSample(Float32Array.from(r.vec), label, id);
        next[label] = (next[label] ?? 0) + 1;
        list.push({ id, label, thumb: r.thumb ?? r.img ?? '', img: r.img ?? r.thumb ?? '' });
      }
      setCounts(next);
      setSaved(list);
    });
  }, []);

  // 实时余弦相似度：摄像头开启且模型就绪时，持续把当前帧与已存样本比较
  useEffect(() => {
    if (!camera.active || !ready) {
      setLiveSim([]);
      return;
    }
    let active = true;
    let timer = 0;
    const tick = async () => {
      if (!active) return;
      const frame = camera.captureFrame();
      if (frame) {
        try {
          const vec = await infer(frame);
          if (active) setLiveSim(classifier.current.nearest(vec, 4));
        } catch {
          /* ignore */
        }
      }
      if (active) timer = window.setTimeout(tick, 600);
    };
    timer = window.setTimeout(tick, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [camera.active, ready]);

  // 训练即完成（KNN 无需训练过程）
  useEffect(() => {
    if (classifier.current.size > 0) setStep((s) => Math.max(s, 1));
  }, [counts]);

  async function captureForClass(label: CarClass) {
    if (!camera.active) { setWarn('请先开启摄像头再采集'); return; }
    if (!ready) { setWarn('MobileNet 模型加载中，请稍候…'); return; }
    const frame = camera.captureFrame();
    if (!frame) { setWarn('摄像头画面不可用'); return; }
    try {
      const vec = await infer(frame);
      const { img: imgUrl, thumb: thumbUrl } = makeImages(frame);
      const id = await addSample('knn', label, vec, thumbUrl, imgUrl);
      classifier.current.addSample(vec, label, id);
      setActiveClass(label);
      setCounts((c) => ({ ...c, [label]: (c[label] ?? 0) + 1 }));
      setSaved((s) => [...s, { id, label, thumb: thumbUrl, img: imgUrl }]);
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
    const vec = await infer(img);
    const { img: imgUrl, thumb: thumbUrl } = makeImages(img);
    const id = await addSample('knn', activeClass, vec, thumbUrl, imgUrl);
    classifier.current.addSample(vec, activeClass, id);
    setCounts((c) => ({ ...c, [activeClass]: (c[activeClass] ?? 0) + 1 }));
    setSaved((s) => [...s, { id, label: activeClass, thumb: thumbUrl, img: imgUrl }]);
    setFlash({ label: activeClass, url: imgUrl });
    setWarn(null);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1500);
    URL.revokeObjectURL(img.src);
  }

  async function deleteOne(id: number, label: CarClass) {
    classifier.current.removeById(id);
    await deleteSample(id);
    setSaved((s) => s.filter((x) => x.id !== id));
    setCounts((c) => ({ ...c, [label]: Math.max(0, (c[label] ?? 1) - 1) }));
  }

  async function clearAll() {
    classifier.current.clear();
    setCounts(Object.fromEntries(CLASSES.map((c) => [c, 0])));
    setPred(null);
    setFlash(null);
    setWarn(null);
    setSaved([]);
    setStep(0);
    setKScan([]);
    await clearSamples('knn');
  }

  /** 设定 K 值：同步给分类器，并在已有最近一次帧时重算「不同 K 的投票结果」 */
  function applyK(v: number) {
    const kv = Math.max(1, Math.min(15, Math.round(v)));
    classifier.current.k = kv;
    setK(kv);
    if (lastVecRef.current && classifier.current.size > 0) {
      const ks = [1, 3, 5, 7, 9].filter((x) => x <= classifier.current.size);
      setKScan(
        ks.map((x) => {
          const r = classifier.current.predict(lastVecRef.current!, x);
          return { k: x, label: r.label, confidence: r.confidence };
        })
      );
    } else {
      setKScan([]);
    }
  }

  /** 将一组样本（含特征向量、可选原始图/缩略图）整体写入，替换当前数据集 */
  async function applyImported(
    rows: { label: string; vec: number[]; thumb?: string; img?: string }[]
  ) {
    classifier.current.clear();
    await clearSamples('knn');
    const next = Object.fromEntries(CLASSES.map((c) => [c, 0]));
    const list: { id: number; label: CarClass; thumb: string; img: string }[] = [];
    for (const r of rows) {
      const label = r.label as CarClass;
      const vec = Float32Array.from(r.vec);
      const thumb = r.thumb ?? r.img ?? '';
      const img = r.img ?? r.thumb ?? '';
      const id = await addSample('knn', label, vec, thumb || undefined, img || undefined);
      classifier.current.addSample(vec, label, id);
      next[label] = (next[label] ?? 0) + 1;
      list.push({ id, label, thumb, img });
    }
    setCounts(next);
    setSaved(list);
    setStep(list.length > 0 ? Math.max(step, 1) : 0);
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
          k: classifier.current.k,
          classes: CLASSES,
          count: annotations.length,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob('knn-dataset.zip', blob);
  }

  /** 从数据集 ZIP 重新提取特征并恢复（需 MobileNet 就绪） */
  async function importDatasetZip(file: File) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const annFile = zip.file('dataset/annotations.json');
    let files: { file: string; label: string }[] = [];
    if (annFile) {
      // annotations.json 既可能是数组，也可能是 { annotations: [...] }
      const parsedAnn = JSON.parse(await annFile.async('string'));
      files = Array.isArray(parsedAnn) ? parsedAnn : parsedAnn.annotations ?? [];
    } else {
      // 兜底：按 data/<类别>/xxx.jpg 推断
      zip.folder('dataset')?.forEach((rel, entry) => {
        if (!entry.dir && /\.(jpe?g|png)$/i.test(rel)) {
          files.push({ file: rel, label: rel.split('/')[0] });
        }
      });
    }
    if (files.length === 0) throw new Error('empty');
    classifier.current.clear();
    await clearSamples('knn');
    const next = Object.fromEntries(CLASSES.map((c) => [c, 0]));
    const list: { id: number; label: CarClass; thumb: string; img: string }[] = [];
    for (const a of files) {
      const entry = zip.file('dataset/' + a.file);
      if (!entry) continue;
      const dataUrl = `data:image/jpeg;base64,${await entry.async('base64')}`;
      const im = new Image();
      im.src = dataUrl;
      await im.decode();
      const vec = await infer(im);
      const { img: imgUrl, thumb: thumbUrl } = makeImages(im);
      const id = await addSample('knn', a.label as CarClass, vec, thumbUrl, imgUrl);
      classifier.current.addSample(vec, a.label as CarClass, id);
      next[a.label] = (next[a.label] ?? 0) + 1;
      list.push({ id, label: a.label as CarClass, thumb: thumbUrl, img: imgUrl });
    }
    setCounts(next);
    setSaved(list);
    setStep(list.length > 0 ? Math.max(step, 1) : 0);
  }

  /** 保存模型：导出训练结果（特征向量，体积更小）为 knn-model.json */
  async function exportModel() {
    const rows = await loadSamples('knn');
    downloadBlob(
      'knn-model.json',
      new Blob(
        [
          JSON.stringify({
            type: 'knn-model',
            k: classifier.current.k,
            labels: CLASSES,
            exportedAt: new Date().toISOString(),
            samples: rows.map((r) => ({ label: r.label, vec: r.vec })),
          }),
        ],
        { type: 'application/json' }
      )
    );
  }

  /** 加载数据（支持 knn-dataset.zip 或旧版 JSON）/ 模型（knn-model.json） */
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
        setWarn(null);
        setFlash(null);
        return;
      }
      const parsed = JSON.parse(await file.text());
      const rows = Array.isArray(parsed) ? parsed : parsed.samples;
      if (!Array.isArray(rows)) throw new Error('bad');
      await applyImported(rows);
      if (typeof parsed.k === 'number') applyK(parsed.k);
      setWarn(null);
      setFlash(null);
    } catch {
      setWarn(
        `无法解析${kind === 'data' ? '数据' : '模型'}文件，请选择导出的 knn ${kind === 'data' ? '数据' : '模型'}文件`
      );
    }
  }


  async function runInference() {
    const frame = camera.captureFrame();
    if (!frame || !ready) return;
    setPredicting(true);
    const vec = await infer(frame);
    const r = classifier.current.predict(vec);
    setPred(r);
    lastVecRef.current = vec;
    // 同一张图在不同 K 下的预测，帮助学生对比挑选合适的 K
    const ks = [1, 3, 5, 7, 9].filter((x) => x <= classifier.current.size);
    setKScan(
      ks.map((x) => {
        const rr = classifier.current.predict(vec, x);
        return { k: x, label: rr.label, confidence: rr.confidence };
      })
    );
    setPredicting(false);
    setStep(2);
    // 联动真实小车（若已连接）
    const map: Record<CarClass, 'F' | 'L' | 'R' | 'S'> = {
      前进: 'F',
      左: 'L',
      右: 'R',
      停: 'S',
    };
    if (bt.state === 'connected') bt.send(map[r.label], 120);
  }

  return (
    <div className="container-page py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/teaching" className="text-sm text-brand-600 hover:underline">
            ← 返回教学
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">入门：MobileNet + KNN 四分类</h1>
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">实时余弦相似度 · Top 4</div>
                {liveSim.length === 0 ? (
                  <div className="mt-2 text-xs text-slate-400">
                    开启摄像头并采集样本后，这里显示当前画面与已存样本的最近邻
                  </div>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {liveSim.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-4 text-slate-400">{i + 1}</span>
                        <span className="w-10 font-medium text-slate-700">{s.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
                          <div
                            className="h-full rounded bg-brand-500 transition-all"
                            style={{ width: `${Math.max(0, Math.min(1, s.sim)) * 100}%` }}
                          />
                        </div>
                        <span className="w-12 text-right tabular-nums text-slate-500">
                          {(s.sim * 100).toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
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
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={classifier.current.size === 0}>
              <Trash2 className="h-4 w-4" /> 清空数据
            </Button>
          </div>
          {tfError && <p className="mt-2 text-xs text-rose-500">模型错误：{tfError}</p>}
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
            <Button variant="ghost" size="sm" onClick={exportData} disabled={classifier.current.size === 0}>
              保存数据
            </Button>
            <Button variant="ghost" size="sm" onClick={() => dataFileRef.current?.click()}>
              加载数据
            </Button>
            <input
              ref={dataFileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => importFromFile(e, 'data')}
            />
            <Button variant="ghost" size="sm" onClick={exportModel} disabled={classifier.current.size === 0}>
              保存模型
            </Button>
            <Button variant="ghost" size="sm" onClick={() => modelFileRef.current?.click()}>
              加载模型
            </Button>
            <input
              ref={modelFileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => importFromFile(e, 'model')}
            />
          </div>
        </Card>

        {/* 推理 + 连接 */}
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold text-slate-800">③ 推理验证</h2>

            {/* K 值设置：帮助学生理解 k 对分类的影响 */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">K 值（近邻个数）</span>
                <span className="rounded bg-brand-500 px-2 py-0.5 text-xs font-bold text-white">{k}</span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={k}
                onChange={(e) => applyK(Number(e.target.value))}
                className="mt-2 w-full accent-brand-500"
                disabled={classifier.current.size === 0}
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>1（敏感）</span>
                <span>15（平滑）</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                K 越小越「敏感」，易被个别异常样本带偏；K 越大越「平滑」，类别边界更稳但可能模糊分界。
                建议取奇数以避免平票，并用下方「不同 K 的投票结果」对比挑选。
              </p>
            </div>

            <Button
              className="mt-3 w-full"
              onClick={runInference}
              disabled={!ready || predicting || classifier.current.size === 0}
            >
              <Play className="h-4 w-4" /> {predicting ? '推理中…' : '实时推理'}
            </Button>
            {classifier.current.size === 0 && (
              <p className="mt-2 text-xs text-slate-400">请先采集样本再推理</p>
            )}
            {pred && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold text-brand-600">
                  <CheckCircle2 className="h-4 w-4" /> 预测：{pred.label}
                </div>
                <div className="mt-1 text-slate-500">置信度 {(pred.confidence * 100).toFixed(1)}%</div>
                <div className="mt-2 text-xs font-medium text-slate-500">
                  最近的 {pred.k} 个邻居（距离越小越接近）
                </div>
                <ul className="mt-1 space-y-1">
                  {pred.neighbors.map((nb, i) => {
                    const maxD = Math.max(...pred.neighbors.map((n) => n.dist), 1e-6);
                    return (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-4 text-slate-400">{i + 1}</span>
                        <span className="w-10 font-medium text-slate-700">{nb.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
                          <div
                            className="h-full rounded bg-emerald-500"
                            style={{ width: `${Math.max(3, (1 - nb.dist / maxD) * 100)}%` }}
                          />
                        </div>
                        <span className="w-14 text-right tabular-nums text-slate-500">
                          {nb.dist.toFixed(2)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {kScan.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-medium text-slate-500">不同 K 下的投票结果（同一张图）</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {kScan.map((s) => (
                    <div
                      key={s.k}
                      className={cn(
                        'flex items-center gap-1 rounded-lg px-2 py-1 text-xs',
                        s.label === pred?.label ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      <span className="font-semibold">K={s.k}</span>
                      <span>{s.label}</span>
                      <span className="tabular-nums opacity-70">{(s.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  高亮表示与当前 K={k} 一致的预测。若随 K 增大预测类别频繁切换，说明边界样本较多，可适当增加每类样本量或选择居中的 K。
                </p>
              </div>
            )}
          </Card>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">④ 连接真实小车（Web Bluetooth）</p>
            <BluetoothPanel />
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-400">
        提示：KNN「训练」即记忆样本，采集足够图片后即可推理；连接小车后，推理结果会自动经蓝牙下发给 ESP32。
      </p>
      <AiTrainingPlatform />
    </div>
  );
}
