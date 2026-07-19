// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Cpu, ArrowRight, Clock } from 'lucide-react';
import { courses, difficultyColor, type Difficulty } from '@/content/courses';
import { Card, Chip } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

const tabs: Difficulty[] = ['入门', '进阶', '高级', '拓展'];

export function TeachingPage() {
  const [tab, setTab] = useState<Difficulty>('入门');
  const list = courses.filter((c) => c.difficulty === tab);

  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-2">
        <Chip className="w-fit bg-brand-100 text-brand-700">智能驾驶教学</Chip>
        <h1 className="section-title">分阶课程与实操</h1>
        <p className="text-slate-600">
          四档难度递进：入门用 KNN 即可上手，进阶调 MLP 超参，高级从零搭建 CNN，拓展关关联 YOLO 做实时目标检测与自动驾驶决策。每档都可真实训练并连接小车。
        </p>
      </div>

      {/* 难度 Tabs */}
      <div className="mt-6 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              tab === t ? 'bg-brand-gradient text-white shadow-soft' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {list.map((c) => (
          <Card key={c.id} hover className="flex flex-col">
            <div className="flex items-center justify-between">
              <span className={cn('chip', difficultyColor[c.difficulty])}>{c.difficulty}</span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" /> {c.hours} 课时
              </span>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-slate-900">{c.title}</h3>
            <p className="mt-1 flex-1 text-sm text-slate-600">{c.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.highlights.map((h) => (
                <span key={h} className="chip bg-slate-100 text-slate-500">
                  {h}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5" /> 算力：{c.gpu}
              </span>
              <span>样本≥{c.minSamples}/类</span>
            </div>
            <Link to={`/teaching/${c.id}`} className="mt-4">
              <span className="btn-primary w-full">
                <Camera className="h-4 w-4" /> 开始实操 <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
