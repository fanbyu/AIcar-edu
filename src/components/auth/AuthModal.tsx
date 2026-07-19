// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { Mail, QrCode, X, Loader2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/features/auth/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { WechatQr } from './WechatQr';

type Tab = 'email' | 'wechat';
type EmailMode = 'login' | 'register';

export function AuthModal() {
  const { open, closeModal } = useAuthModalStore();
  const { register, login, loginAnonymous, status, error, clearError } = useAuthStore();

  const [tab, setTab] = useState<Tab>('email');
  const [mode, setMode] = useState<EmailMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [showPw, setShowPw] = useState(false);

  if (!open) return null;

  const loading = status === 'loading';

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const ok =
      mode === 'login'
        ? await login({ email, password })
        : await register({ email, password, nickname });
    if (ok) closeModal();
  };

  const handleAnonymous = async () => {
    clearError();
    const ok = await loginAnonymous();
    if (ok) closeModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={closeModal}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-3xl border border-slate-200 bg-white p-6 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">欢迎来到智驭未来</h2>
            <p className="mt-1 text-sm text-slate-500">登录后即可保存学习进度与作品</p>
          </div>
          <button
            onClick={closeModal}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 方式切换 */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setTab('email')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
              tab === 'email' ? 'bg-white text-brand-600 shadow-soft' : 'text-slate-500'
            )}
          >
            <Mail className="h-4 w-4" /> 邮箱
          </button>
          <button
            onClick={() => setTab('wechat')}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
              tab === 'wechat' ? 'bg-white text-brand-600 shadow-soft' : 'text-slate-500'
            )}
          >
            <QrCode className="h-4 w-4" /> 微信扫码
          </button>
        </div>

        {tab === 'email' ? (
          <form onSubmit={handleEmail} className="space-y-3">
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={cn(
                  'rounded-md px-2 py-1 font-medium',
                  mode === 'login' ? 'bg-brand-50 text-brand-600' : 'text-slate-400'
                )}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={cn(
                  'rounded-md px-2 py-1 font-medium',
                  mode === 'register' ? 'bg-brand-50 text-brand-600' : 'text-slate-400'
                )}
              >
                注册
              </button>
            </div>

            {mode === 'register' && (
              <Field label="昵称">
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="可选，默认取邮箱前缀"
                  className="auth-input"
                />
              </Field>
            )}
            <Field label="邮箱">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="auth-input"
              />
            </Field>
            <Field label="密码">
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
                  className="auth-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="显示密码"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>
        ) : (
          <WechatQr />
        )}

        {/* 匿名入口：刻意弱化、低对比度、置于角落，符合「不推荐」定位 */}
        <div className="mt-5 flex items-center justify-center border-t border-slate-100 pt-4">
          <button
            onClick={handleAnonymous}
            disabled={loading}
            className="text-[11px] text-slate-300 transition hover:text-slate-400"
            title="以游客身份进入，功能与数据将不被保存"
          >
            游客模式进入（不推荐）
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
