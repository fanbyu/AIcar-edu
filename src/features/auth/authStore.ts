// SPDX-License-Identifier: AGPL-3.0-or-later
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, LoginPayload, RegisterPayload } from './types';
import { localAuthProvider } from './localAuthProvider';
import { cloudbaseAuthProvider } from './cloudbaseAuthProvider';
import { isCloudbaseEnabled } from './cloudbaseConfig';

// 配置了 CloudBase 环境变量则使用真实鉴权，否则回退到本地演示鉴权
const authProvider = isCloudbaseEnabled ? cloudbaseAuthProvider : localAuthProvider;

if (import.meta.env.DEV) {
  console.info(
    isCloudbaseEnabled
      ? '[auth] 使用 CloudBase 真实鉴权'
      : '[auth] 未配置 VITE_CLOUDBASE_ENV_ID，回退到本地演示鉴权'
  );
}

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading';
  error: string | null;
  isAuthenticated: boolean;
  register: (p: RegisterPayload) => Promise<boolean>;
  login: (p: LoginPayload) => Promise<boolean>;
  loginAnonymous: () => Promise<boolean>;
  loginWechat: (ticket: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      status: 'idle',
      error: null,
      isAuthenticated: false,

      async register(p) {
        set({ status: 'loading', error: null });
        const res = await authProvider.register(p);
        if (res.ok && res.user) {
          set({ user: res.user, status: 'idle', isAuthenticated: true });
          return true;
        }
        set({ status: 'idle', error: res.error ?? '注册失败' });
        return false;
      },

      async login(p) {
        set({ status: 'loading', error: null });
        const res = await authProvider.login(p);
        if (res.ok && res.user) {
          set({ user: res.user, status: 'idle', isAuthenticated: true });
          return true;
        }
        set({ status: 'idle', error: res.error ?? '登录失败' });
        return false;
      },

      async loginAnonymous() {
        set({ status: 'loading', error: null });
        const res = await authProvider.anonymous();
        if (res.ok && res.user) {
          set({ user: res.user, status: 'idle', isAuthenticated: true });
          return true;
        }
        set({ status: 'idle', error: res.error ?? '匿名登录失败' });
        return false;
      },

      async loginWechat(ticket) {
        set({ status: 'loading', error: null });
        const res = await authProvider.wechat(ticket);
        if (res.ok && res.user) {
          set({ user: res.user, status: 'idle', isAuthenticated: true });
          return true;
        }
        set({ status: 'idle', error: res.error ?? '微信登录失败' });
        return false;
      },

      logout() {
        void authProvider.logout();
        set({ user: null, isAuthenticated: false, error: null });
      },

      clearError() {
        set({ error: null });
      },
    }),
    { name: 'smartcar-auth' }
  )
);
