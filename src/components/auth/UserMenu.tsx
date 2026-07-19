// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/features/auth/authStore';
import { methodLabel } from '@/features/auth/types';

export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;
  const initial = user.nickname.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 py-1 pl-1 pr-3 transition hover:border-brand-200"
      >
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white',
            user.avatarColor
          )}
        >
          {initial}
        </span>
        <span className="hidden text-sm font-medium text-slate-700 sm:inline">
          {user.nickname}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 animate-fade-up rounded-2xl border border-slate-200 bg-white p-3 shadow-glow">
          <div className="flex items-center gap-3 px-1 pb-3">
            <span
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white',
                user.avatarColor
              )}
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{user.nickname}</p>
              <p className="truncate text-xs text-slate-400">
                {user.email || (user.anonymous ? '未绑定邮箱' : '微信账号')}
              </p>
            </div>
          </div>

          <div className="mb-2 flex items-center gap-1.5 px-1 text-xs text-slate-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            登录方式：{methodLabel[user.method]}
            {user.anonymous && '（数据不保存）'}
          </div>

          <button
            onClick={() => {
              logout();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> 退出登录
          </button>
        </div>
      )}
    </div>
  );
}
