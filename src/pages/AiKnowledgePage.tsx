// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { knowledgeArticles, knowledgeTiers, type KnowledgeArticle } from '@/content/aiKnowledge';
import { Card, Chip } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { ActivationWidget } from '@/components/shared/widgets/ActivationWidget';
import { ConvWidget } from '@/components/shared/widgets/ConvWidget';

export function AiKnowledgePage() {
  const [tier, setTier] = useState<string>('基础');
  const [open, setOpen] = useState<KnowledgeArticle | null>(null);
  const list = knowledgeArticles.filter((a) => a.tier === tier);

  return (
    <div className="container-page py-10">
      <Chip className="w-fit bg-brand-100 text-brand-700">AI 知识专区</Chip>
      <h1 className="mt-2 section-title">基础算法与模型讲解</h1>
      <p className="text-slate-600">按难度分层递进，点击卡片查看图文讲解与可交互演示。</p>

      <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {knowledgeTiers.map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              tier === t ? 'bg-brand-gradient text-white' : 'text-slate-600'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a) => (
          <Card key={a.id} hover onClick={() => setOpen(a)} className="cursor-pointer">
            <Chip className="bg-slate-100 text-slate-500">{a.tag}</Chip>
            <h3 className="mt-2 font-semibold text-slate-900">{a.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{a.summary}</p>
            {a.widget && <p className="mt-2 text-xs text-brand-500">含可交互演示 →</p>}
          </Card>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">{open.title}</h2>
              <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
              {open.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {open.widget === 'activation' && <ActivationWidget />}
            {open.widget === 'conv' && <ConvWidget />}
            {open.widget === 'knn' && (
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                KNN 演示：在「智能驾驶教学 → 入门 KNN」中，采集图片后模型即按最近邻投票分类。
              </p>
            )}
            {open.widget === 'mlp' && (
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                MLP 演示：在「进阶 MLP」训练器中调节学习率与隐藏层，观察训练曲线变化。
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
