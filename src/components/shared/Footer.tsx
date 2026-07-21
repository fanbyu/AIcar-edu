// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200/60 bg-white/60">
      <div className="container-page flex flex-col items-center justify-between gap-3 py-8 text-sm text-slate-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient text-white">
            车
          </span>
          <span>太原五中范保玉老师制作</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            className="hover:text-brand-600"
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            开源协议
          </a>
          <a
            className="hover:text-brand-600"
            href="#"
          >
            源代码
          </a>
          <a
            className="hover:text-brand-600"
            href="#"
          >
            使用文档
          </a>
          <Link className="hover:text-brand-600" to="/about">
            致谢
          </Link>
        </div>
      </div>
    </footer>
  );
}
