// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Target, Car, Lightbulb, GraduationCap } from 'lucide-react';
import { Card, Chip } from '@/components/ui/Card';
import { AI_KNOWLEDGE } from '@/content/aiKnowledge';
import { WidgetHost } from '@/components/knowledge/WidgetHost';

export function KnowledgeLessonPage() {
  const { id } = useParams<{ id: string }>();
  const article = AI_KNOWLEDGE.find((a) => a.id === id);

  if (!article) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-slate-600">未找到该知识点。</p>
        <Link to="/knowledge" className="mt-4 inline-block text-brand-600 hover:underline">
          ← 返回知识专区
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/knowledge" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> 返回 AI 知识专区
      </Link>

      <div className="mb-6 mt-4">
        <div className="mb-2 flex items-center gap-2">
          <Chip>{article.level}</Chip>
          {article.interactive && (
            <Chip className="bg-brand-50 text-brand-700">含交互实验</Chip>
          )}
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{article.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{article.summary}</p>
      </div>

      <Card className="mb-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Target className="h-4 w-4 text-brand-600" /> 学习目标
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {article.goals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </Card>

      {article.sections.map((s) => (
        <section key={s.heading} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">{s.heading}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mb-3 leading-relaxed text-slate-700">
              {p}
            </p>
          ))}
        </section>
      ))}

      {article.widget && (
        <div className="my-6">
          <WidgetHost id={article.widget} />
        </div>
      )}

      <Card className="mb-6 bg-amber-50/60">
        <div className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <div className="text-sm font-semibold text-amber-800">小车连接</div>
            <p className="mt-1 text-sm text-amber-900">{article.carLink}</p>
          </div>
        </div>
      </Card>

      {article.tip && (
        <Card className="mb-6 bg-sky-50/60">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <div>
              <div className="text-sm font-semibold text-sky-800">小贴士</div>
              <p className="mt-1 text-sm text-sky-900">{article.tip}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-10">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <GraduationCap className="h-4 w-4 text-brand-600" /> 关联教学
        </div>
        <div className="flex flex-wrap gap-2">
          {article.relatedTeaching.map((r) => {
            const rel = AI_KNOWLEDGE.find((a) => a.id === r);
            if (!rel) return null;
            return (
              <Link key={r} to={`/knowledge/${r}`}>
                <Chip className="cursor-pointer hover:bg-brand-50">{rel.title}</Chip>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-500">
        <Car className="h-4 w-4" /> 把这篇用到你的智能小车上：在「编程仿真」里写一段返回指令的代码试试。
      </div>
    </div>
  );
}
