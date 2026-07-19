// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 训练数据集持久化（IndexedDB）。
 * 采集到的 MobileNet 特征向量 / CNN 原图像素持久保存，
 * 刷新或重开浏览器后自动恢复，学生无需重复采集，
 * 符合「端侧、免后端、纯静态」的教学场景。
 */
import { openDB, type IDBPDatabase } from 'idb';

export type TrainerId = 'knn' | 'mlp' | 'cnn';

/** KNN / MLP 样本：MobileNet 特征向量 */
export interface StoredSample {
  id?: number;
  trainer: TrainerId;
  label: string;
  vec: number[];
  /** 缩略图（KNN 通道预览用），可选 */
  thumb?: string;
  /** 原始标注图片（224×224 JPEG dataURL，数据集导出用），可选 */
  img?: string;
}

/** CNN 样本：原始图像像素（224×224×3） */
export interface StoredImage {
  id?: number;
  label: string;
  w: number;
  h: number;
  pixels: number[];
}

const DB_NAME = 'smart-car-datasets';
const STORE = 'samples';
const STORE_IMG = 'cnnImages';
/** CNN 自定义训练：以原始标注图（dataURL）存储，训练/推理时再缩放到 img_width_height */
const STORE_CNN = 'cnnSamples';

let dbp: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, 3, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('trainer', 'trainer');
        }
        if (!db.objectStoreNames.contains(STORE_IMG)) {
          db.createObjectStore(STORE_IMG, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_CNN)) {
          db.createObjectStore(STORE_CNN, { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbp;
}

/* ---------- KNN / MLP：特征向量 ---------- */

/** 读取某训练器的全部样本 */
export async function loadSamples(trainer: TrainerId): Promise<StoredSample[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE, 'trainer', trainer);
}

/** 追加一条样本（特征向量以 number[] 存储，不存 Tensor）。返回新记录 id */
export async function addSample(
  trainer: TrainerId,
  label: string,
  vec: Float32Array,
  thumb?: string,
  img?: string
): Promise<number> {
  const db = await getDB();
  return (await db.add(STORE, { trainer, label, vec: Array.from(vec), thumb, img } as StoredSample)) as number;
}

/** 删除单条样本（按 id） */
export async function deleteSample(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

/** 更新某条样本的特征向量（MobileNet 配置变更后用新模型重新提取） */
export async function updateSampleVec(id: number, vec: number[]): Promise<void> {
  const db = await getDB();
  const rec = (await db.get(STORE, id)) as StoredSample | undefined;
  if (!rec) return;
  rec.vec = vec;
  await db.put(STORE, rec);
}

/** 清空某训练器的全部样本 */
export async function clearSamples(trainer: TrainerId): Promise<void> {
  const db = await getDB();
  const keys = await db.getAllKeysFromIndex(STORE, 'trainer', trainer);
  const tx = db.transaction(STORE, 'readwrite');
  await Promise.all(keys.map((k) => tx.store.delete(k)));
  await tx.done;
}

/* ---------- CNN：原始图像像素 ---------- */

/** 读取全部 CNN 样本像素 */
export async function loadCnnImages(): Promise<StoredImage[]> {
  const db = await getDB();
  return db.getAll(STORE_IMG);
}

/** 追加一条 CNN 样本（RGBA 像素展平为 number[]） */
export async function saveCnnImage(label: string, w: number, h: number, pixels: number[]): Promise<void> {
  const db = await getDB();
  await db.add(STORE_IMG, { label, w, h, pixels } as StoredImage);
}

/** 清空全部 CNN 样本 */
export async function clearCnnImages(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_IMG);
}

/* ---------- CNN 自定义训练：原始标注图（dataURL） ---------- */

/** CNN 样本：保存原始标注图与缩略图，训练时按当前 img_width_height 动态缩放 */
export interface CnnSampleRow {
  id?: number;
  label: string;
  /** 原始标注图 dataURL（建议 224×224，缩放更稳） */
  img: string;
  /** 缩略图 dataURL，通道预览用 */
  thumb: string;
}

/** 读取全部 CNN 样本 */
export async function loadCnnSamples(): Promise<CnnSampleRow[]> {
  const db = await getDB();
  return db.getAll(STORE_CNN);
}

/** 追加一条 CNN 样本（原始图 + 缩略图） */
export async function addCnnSample(label: string, img: string, thumb: string): Promise<number> {
  const db = await getDB();
  return (await db.add(STORE_CNN, { label, img, thumb } as CnnSampleRow)) as number;
}

/** 删除单条 CNN 样本 */
export async function deleteCnnSample(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_CNN, id);
}

/** 清空全部 CNN 样本 */
export async function clearCnnSamples(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_CNN);
}
