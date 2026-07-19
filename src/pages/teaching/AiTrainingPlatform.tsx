// SPDX-License-Identifier: AGPL-3.0-or-later
// AI 训练平台（入门阶段 · 通用浏览器内训练界面）
//
// 与「MobileNet + KNN 四分类」只针对小车四分类不同，本页面是一个「通用可训练」界面：
// 先选择项目类型（图像 / 音乐 / 姿势），再进入对应的采集-训练-推理工作区。
//   - 图像项目 / 姿势项目：基于 @teachablemachine/image 的迁移学习
//   - 音乐项目：纯前端麦克风频谱 + tf.js 分类头（零额外模型依赖）
import { useState } from 'react';
import { Image as ImageIcon, Music, Activity, GraduationCap, ArrowRight } from 'lucide-react';
import { ImageProject } from './tm/ImageProject';
import { AudioProject } from './tm/AudioProject';

type ProjectType = 'image' | 'audio' | 'pose' | null;

const PROJECTS: {
  type: Exclude<ProjectType, null>;
  icon: typeof ImageIcon;
  title: string;
  desc: string;
  tag: string;
}[] = [
  {
    type: 'image',
    icon: ImageIcon,
    title: '图像项目',
    desc: '用摄像头采集图像样本，训练一个能区分多种物体的图像分类器。',
    tag: 'MobileNet 迁移学习',
  },
  {
    type: 'audio',
    icon: Music,
    title: '音乐项目',
    desc: '用麦克风采集声音样本，训练一个能识别不同声音的声音分类器。',
    tag: '纯前端频谱分类',
  },
  {
    type: 'pose',
    icon: Activity,
    title: '姿势项目',
    desc: '用摄像头采集不同姿势的画面，训练一个能区分多种姿势的分类器。',
    tag: '视觉迁移学习',
  },
];

export default function AiTrainingPlatform() {
  const [project, setProject] = useState<ProjectType>(null);

  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <GraduationCap className="h-7 w-7 text-brand-600" />
        <h2 className="text-2xl font-bold text-slate-800">AI训练平台</h2>
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-600">
        无需写代码也能训练模型：选一个项目类型，采集少量样本，浏览器内完成训练，再实时推理。
        它和「MobileNet + KNN 四分类」互补——这里靠“真正训练一个小网络”学习决策边界，且不限小车场景，可训练任意你定义的类别。
      </p>

      {project === null ? (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-slate-800">创建一个新项目</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROJECTS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.type}
                  onClick={() => setProject(p.type)}
                  className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-glow"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-100">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-base font-semibold text-slate-800">{p.title}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{p.tag}</span>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-slate-500">{p.desc}</p>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                    开始 <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : project === 'audio' ? (
        <AudioProject onBack={() => setProject(null)} />
      ) : (
        <ImageProject variant={project} onBack={() => setProject(null)} />
      )}
    </section>
  );
}
