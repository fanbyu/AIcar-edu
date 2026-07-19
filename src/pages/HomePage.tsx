// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from 'react-router-dom';
import {
  Cpu,
  Zap,
  Layers,
  Bluetooth,
  ArrowRight,
  Camera,
  Brain,
  Code2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, Chip } from '@/components/ui/Card';

const values = [
  { icon: Users, title: '免费注册', desc: '打开网页即用，零门槛开始学习。' },
  { icon: Cpu, title: '有限算力直接体验', desc: '采用开源框架，本地直接体验人工智能模型训练与推理，数据不出设备。' },
  { icon: Layers, title: '梯度课程', desc: '入门 KNN → 进阶 MLP → 高级 CNN → YOLO，循序渐进。' },
  { icon: Bluetooth, title: '真实硬件联动', desc: '连接蓝牙小车到小型卡丁车。' },
];

const scenarios = [
  { title: '教室', desc: '分组采集图片、训练模型，当堂看到小车听懂指令。', emoji: '🏫' },
  { title: '操场', desc: '让小车在真实场地循迹、避障，验证算法效果。', emoji: '🏟️' },
  { title: '家庭', desc: '用手机摄像头即可训练，把学习带回家继续玩。', emoji: '🏠' },
];

const pathSteps = [
  { to: '/teaching/knn', title: '入门', desc: 'MobileNet + KNN 四分类', color: 'from-emerald-400 to-teal-500' },
  { to: '/teaching/mlp', title: '进阶', desc: 'MobileNet + MLP 调参', color: 'from-amber-400 to-orange-500' },
  { to: '/teaching/cnn', title: '高级', desc: '自定义 CNN 从零搭建', color: 'from-rose-400 to-pink-500' },
];

export function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-grid-light bg-[size:28px_28px] opacity-70" />
        <div className="container-page grid items-center gap-8 py-16 md:grid-cols-2 md:py-24">
          <div className="animate-fade-up">
            <Chip className="bg-brand-100 text-brand-700">面向高中生 · 智能驾驶 × 人工智能</Chip>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
              用一辆百元小车，<br />
              <span className="gradient-text">学懂 AI 驾驶</span>
            </h1>
            <p className="mt-4 max-w-md text-lg text-slate-600">
              在本地训练模型、仿真小车行为，再用 Web Bluetooth 把 AI 真正开上 智能小车。
              免费、端侧算力，零基础也能上手，真正入门人工智能无人驾驶。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/teaching">
                <Button>
                  开始学习 <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/knowledge">
                <Button variant="ghost">先学点 AI 知识</Button>
              </Link>
            </div>
          </div>
          <div className="relative animate-float">
            <img
              src="/pic02.jpg"
              alt="智能小车"
              className="mx-auto aspect-square w-72 rounded-3xl object-cover shadow-glow"
            />
          </div>
        </div>
      </section>

      {/* 核心价值 */}
      <section className="container-page py-10">
        <h2 className="section-title">为什么是「智驭未来」</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v) => (
            <Card key={v.title} hover>
              <v.icon className="h-8 w-8 text-brand-500" />
              <h3 className="mt-3 font-semibold text-slate-900">{v.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{v.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* 场景 */}
      <section className="container-page py-10">
        <h2 className="section-title">智能小车校园场景</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {scenarios.map((s) => (
            <Card key={s.title} hover className="text-center">
              <div className="text-4xl">{s.emoji}</div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* 学习路径 */}
      <section className="container-page py-10">
        <h2 className="section-title">学习路径：从入门到高手</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {pathSteps.map((s, i) => (
            <Link key={s.title} to={s.to}>
              <Card hover className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white`}>
                  {i + 1}
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-400">{s.title}</div>
                  <div className="font-semibold text-slate-900">{s.desc}</div>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 text-slate-300" />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* 模块入口 */}
      <section className="container-page py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { to: '/teaching', icon: Camera, t: '智能驾驶教学' },
            { to: '/knowledge', icon: Brain, t: 'AI 知识专区' },
            { to: '/playground', icon: Code2, t: '编程与仿真' },
            { to: '/community', icon: Users, t: '社区' },
          ].map((m) => (
            <Link key={m.to} to={m.to}>
              <Card hover className="flex items-center gap-3">
                <m.icon className="h-6 w-6 text-brand-500" />
                <span className="font-medium text-slate-800">{m.t}</span>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
