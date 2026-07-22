// SPDX-License-Identifier: AGPL-3.0-or-later
import { NavLink } from 'react-router-dom';
import { Home, GraduationCap, Brain, Code2, Users, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/features/auth/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { UserMenu } from '@/components/auth/UserMenu';

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/teaching', label: '智能驾驶教学', icon: GraduationCap },
  { to: '/knowledge', label: 'AI 知识专区', icon: Brain },
  { to: '/playground', label: '编程与仿真', icon: Code2 },
  { to: '/community', label: '社区', icon: Users },
];

export function Navbar() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-soft">
            <span className="text-lg font-black">车</span>
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            智驭未来
          </span>
        </NavLink>
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
          <a
            href="https://microblocks.fun/run-pilot/microblocks.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" />
            在线编程
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <UserMenu />
          ) : (
            <button
              onClick={() => useAuthModalStore.getState().openModal()}
              className="btn-ghost hidden h-10 px-3.5 py-2 text-sm sm:inline-flex"
            >
              登录
            </button>
          )}
          <NavLink to="/teaching" className="btn-primary hidden sm:inline-flex">
            开始学习
          </NavLink>
        </div>
      </div>
      {/* 移动端底部导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/90 backdrop-blur md:hidden">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
                isActive ? 'text-brand-600' : 'text-slate-500'
              )
            }
          >
            <Icon className="h-5 w-5" />
              {label.replace('智能驾驶', '').replace('AI ', '')}
          </NavLink>
          ))}
          <a
            href="https://microblocks.fun/run-pilot/microblocks.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-slate-500"
          >
            <ExternalLink className="h-5 w-5" />
            在线编程
          </a>
        </nav>
    </header>
  );
}
