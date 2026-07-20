// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from 'react-router-dom';

export function AboutPage() {
  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-800">关于本站点</h1>
        <p className="mt-4 leading-relaxed text-slate-600">
          本站点是一个面向中小学人工智能与边缘计算教学的智能小车互动学习平台。
          所有机器学习模型均在浏览器端本地运行，无需上传任何数据，适合课堂与实验环境使用。
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-800">致谢</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-600">
            <li>太原五中范保玉老师制作</li>
            <li>本项目参考了上海松江区青少年综合实践教育中心 汤铭老师的网站、教学视频和书籍</li>
            <li>感谢学校领导、老师和同学的支持与鼓励，希望这个项目为 120 年校庆献上一份礼物</li>
            <li>感谢 microblocks 线上分享会（B站）</li>
            <li>祝贺西班牙夺冠</li>
            <li>TensorFlow.js、ONNX Runtime Web、Pyodide、CloudBase 等开源社区</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-800">相关链接</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <a
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              href="https://gitee.com/fff1969/AIcar-edu"
              target="_blank"
              rel="noopener noreferrer"
            >
              源代码（Gitee）
            </a>
            <Link
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              to="/"
            >
              返回首页
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
