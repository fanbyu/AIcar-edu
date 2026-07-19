// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from 'react-router-dom';
import { Award, Trophy, Heart, CheckCircle2 } from 'lucide-react';
import { useProgressStore } from '@/features/progress/progressStore';
import { badges, evaluateBadges } from '@/features/progress/badges';
import { showcaseItems, leaderboard } from '@/content/community';
import { courses } from '@/content/courses';
import { Card, Chip } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

function ProgressRing({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="url(#g)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 60 60)"
      />
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f83f7" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <text x="60" y="66" textAnchor="middle" className="fill-slate-800 text-xl font-bold">
        {value}%
      </text>
    </svg>
  );
}

export function CommunityPage() {
  const { completedCourses, totalMinutes, completeCourse } = useProgressStore();
  const progress = Math.round((completedCourses.length / courses.length) * 100);
  const lit = evaluateBadges({ completedCourses, totalMinutes });

  return (
    <div className="container-page py-10">
      <Chip className="w-fit bg-brand-100 text-brand-700">社区</Chip>
      <h1 className="mt-2 section-title">学习进度与成果展示</h1>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* 进度面板 */}
        <Card className="flex flex-col items-center text-center">
          <h2 className="self-start font-semibold text-slate-800">我的进度</h2>
          <ProgressRing value={progress} />
          <p className="text-sm text-slate-500">
            已完成 {completedCourses.length}/{courses.length} 门课程 · 学习 {totalMinutes} 分钟
          </p>
          <div className="mt-3 w-full space-y-2">
            {courses.map((c) => {
              const done = completedCourses.includes(c.id);
              return (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{c.title}</span>
                  {done ? (
                    <Chip className="bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 已学完
                    </Chip>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => completeCourse(c.id, c.hours * 30)}
                    >
                      标记完成
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* 徽章墙 */}
        <Card>
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <Award className="h-5 w-5 text-amber-500" /> 徽章墙
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {badges.map((b) => {
              const has = lit.includes(b.id);
              return (
                <div
                  key={b.id}
                  className={
                    'flex flex-col items-center rounded-xl p-2 text-center ' +
                    (has ? 'bg-amber-50' : 'bg-slate-50 opacity-50')
                  }
                  title={b.desc}
                >
                  <span className="text-2xl">{b.icon}</span>
                  <span className="mt-1 text-[11px] font-medium text-slate-600">{b.name}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 排行榜 */}
        <Card>
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <Trophy className="h-5 w-5 text-amber-500" /> 学习排行榜
          </div>
          <div className="mt-3 space-y-2">
            {leaderboard.map((e) => (
              <div key={e.rank} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-700">
                  {e.rank}. {e.name}
                </span>
                <span className="text-xs text-slate-500">
                  {e.minutes} 分钟 · {e.courses} 课
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 成果展示 */}
      <h2 className="mt-8 section-title">学生成果展示</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showcaseItems.map((s) => (
          <Card key={s.id} hover>
            <div className="flex items-center justify-between">
              <Chip className="bg-brand-100 text-brand-700">{s.level}</Chip>
              <span className="text-lg">{s.badge}</span>
            </div>
            <h3 className="mt-2 font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>by {s.author}</span>
              <span className="flex items-center gap-1">
                <Heart className="h-3.5 w-3.5 text-rose-400" /> {s.likes}
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 text-center">
        <Link to="/teaching">
          <Button>去完成一门课程赢取徽章</Button>
        </Link>
      </div>
    </div>
  );
}
