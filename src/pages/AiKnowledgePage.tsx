// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Sparkles, ArrowRight, BookOpen } from 'lucide-react';
import { Card, Chip } from '@/components/ui/Card';
import { AI_KNOWLEDGE, KNOWLEDGE_LEVELS, type KnowledgeLevel } from '@/content/aiKnowledge';

export function AiKnowledgePage() {
  const [level, setLevel] = useState<KnowledgeLevel | '全部'>('全部');

  const list = useMemo(
    () => (level === '全部' ? AI_KNOWLEDGE : AI_KNOWLEDGE.filter((a) => a.level === level)),
    [level]
  );

  const counts = useMemo(() => {
    const m: Record<string, number> = { 全部: AI_KNOWLEDGE.length };
    for (const lv of KNOWLEDGE_LEVELS) m[lv] = AI_KNOWLEDGE.filter((a) => a.level === lv).length;
    return m;
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          <BookOpen className="h-4 w-4" /> AI 知识专区
        </div>
        <h1 className="text-2xl font-bold text-slate-900">AI 知识专区</h1>
        <p className="mt-2 text-sm text-slate-600">
          从「一个神经元」到「小车上的 AI」：每篇配可交互小组件，边读边玩。
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(['全部', ...KNOWLEDGE_LEVELS] as const).map((lv) => (
          <Chip
            key={lv}
            active={level === lv}
            onClick={() => setLevel(lv)}
            className="cursor-pointer"
          >
            {lv} ({counts[lv]})
          </Chip>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((a) => (
          <Link key={a.id} to={`/knowledge/${a.id}`} className="block">
            <Card hover className="h-full">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{a.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Chip>{a.level}</Chip>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {a.minutes} 分钟
                    </span>
                    {a.interactive && (
                      <span className="inline-flex items-center gap-1 text-brand-600">
                        <Sparkles className="h-3.5 w-3.5" /> 含交互实验
                      </span>
                    )}
                    {a.hasGraphic && (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <span className="text-[11px]">图文精讲</span>
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
              </div>
              <p className="mt-3 text-sm text-slate-600">{a.summary}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
        <h2 className="mb-2 text-base font-semibold text-slate-900">推荐学习路径</h2>
        <p className="mb-3 text-sm text-slate-600">
          按难度从低到高：先搞懂「单个神经元」，再学「怎么组合成网络」，最后看「怎么在小车上跑起来」。
        </p>
        <ol className="space-y-2 text-sm text-slate-700">
          <li>
            1. <Link className="text-brand-600 hover:underline" to="/knowledge/ai-basics">AI 与机器学习概述</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/activation">激活函数</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/step">阶跃函数</Link>
          </li>
          <li>
            2. <Link className="text-brand-600 hover:underline" to="/knowledge/perceptron">感知机</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/xor">XOR 难题</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/conv">卷积</Link>
          </li>
          <li>
            3. <Link className="text-brand-600 hover:underline" to="/knowledge/knn">KNN</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/cosine">余弦相似度</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/regression">回归 vs 分类</Link>
          </li>
          <li>
            4. <Link className="text-brand-600 hover:underline" to="/knowledge/lane">巡线决策</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/softmax">Softmax</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/mlp">MLP 训练</Link>
            {' · '}
            <Link className="text-brand-600 hover:underline" to="/knowledge/yolo">YOLO 检测</Link>
          </li>
        </ol>
      </div>
    </div>
  );
}
