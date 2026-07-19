// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/features/auth/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { Button } from '@/components/ui/Button';

/**
 * 路由守卫：未登录时展示登录引导（打开登录弹窗），而非直接跳转。
 * 用法：
 *   <RequireAuth>
 *     <SensitivePage />
 *   </RequireAuth>
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openModal = useAuthModalStore((s) => s.openModal);

  if (isAuthenticated) return <>{children}</>;

  return (
    <div className="container-page flex flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Lock className="h-7 w-7" />
      </span>
      <div>
        <h2 className="text-xl font-bold text-slate-900">需要登录后访问</h2>
        <p className="mt-1 text-sm text-slate-500">登录即可使用完整功能并保存你的进度</p>
      </div>
      <Button onClick={openModal}>立即登录</Button>
    </div>
  );
}
