// SPDX-License-Identifier: AGPL-3.0-or-later
import cloudbase from '@cloudbase/js-sdk';
import type {
  AuthResult,
  AuthUser,
  LoginMethod,
  LoginPayload,
  RegisterPayload,
} from './types';
import type { AuthProvider } from './localAuthProvider';
import { pickAvatarColor } from './localAuthProvider';
import { CLOUDBASE_ENV_ID, CLOUDBASE_REGION, WECHAT_WEBSITE_APPID } from './cloudbaseConfig';

/** CloudBase 用户对象的子集（避免直接依赖 SDK 嵌套类型名） */
interface RawUser {
  uid?: string;
  customUserId?: string;
  email?: string;
  nickName?: string;
  displayName?: string;
  name?: string;
  loginType?: string;
}

type ApiResult = { error?: { code?: string; message?: string } };

function apiError(r: unknown): string | null {
  const e = (r as ApiResult)?.error;
  return e ? e.message || e.code || '操作失败' : null;
}

function msg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message?: unknown }).message);
  }
  return '操作失败，请稍后重试';
}

let app: ReturnType<typeof cloudbase.init> | null = null;

function getAuth() {
  if (!CLOUDBASE_ENV_ID) {
    throw new Error('未配置 CloudBase 环境 ID，请在 .env 中设置 VITE_CLOUDBASE_ENV_ID');
  }
  if (!app) {
    app = cloudbase.init({ env: CLOUDBASE_ENV_ID, region: CLOUDBASE_REGION });
  }
  return app.auth();
}

function mapUser(u: RawUser | null, method: LoginMethod): AuthUser {
  const uid = u?.uid || u?.customUserId || '';
  const nickname =
    u?.nickName || u?.displayName || u?.name || (u?.email ? String(u.email).split('@')[0] : '用户');
  return {
    uid,
    method,
    email: u?.email || undefined,
    nickname,
    avatarColor: pickAvatarColor(uid || nickname),
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    anonymous: method === 'anonymous' || u?.loginType === 'ANONYMOUS',
    ...(method === 'wechat' ? { wxNickname: u?.nickName || nickname } : {}),
  };
}

/**
 * 基于腾讯云开发 CloudBase 的真实鉴权实现。
 * 使用 @cloudbase/js-sdk v3 API：
 *   - 邮箱注册：auth.signUp
 *   - 邮箱登录：auth.signInWithPassword
 *   - 匿名登录：auth.signInAnonymously
 *   - 微信扫码：auth.signInWithCustomTicket（ticket 由微信开放平台网站应用 + 云函数签发）
 *   - 登出：auth.signOut
 *
 * 前置条件（在云开发控制台开启）：登录授权 → 匿名登录、邮箱密码登录；
 * 微信扫码还需在微信开放平台注册「网站应用」并配置自定义登录。
 */
export const cloudbaseAuthProvider: AuthProvider = {
  async register(p: RegisterPayload): Promise<AuthResult> {
    try {
      const auth = getAuth();
      const email = p.email.trim().toLowerCase();
      const signup = await auth.signUp({ email, password: p.password } as never);
      const err = apiError(signup);
      if (err) return { ok: false, error: err };
      // 注册成功后自动登录
      return this.login({ email, password: p.password });
    } catch (e) {
      return { ok: false, error: msg(e) };
    }
  },

  async login(p: LoginPayload): Promise<AuthResult> {
    try {
      const auth = getAuth();
      const res = await auth.signInWithPassword({
        email: p.email.trim().toLowerCase(),
        password: p.password,
      } as never);
      const err = apiError(res);
      if (err) return { ok: false, error: err };
      const u = await auth.getCurrentUser();
      if (!u) return { ok: false, error: '登录失败，未获取到用户信息' };
      return { ok: true, user: mapUser(u, 'email') };
    } catch (e) {
      return { ok: false, error: msg(e) };
    }
  },

  async anonymous(): Promise<AuthResult> {
    try {
      const auth = getAuth();
      const res = await auth.signInAnonymously();
      const err = apiError(res);
      if (err) return { ok: false, error: err };
      const u = await auth.getCurrentUser();
      if (!u) return { ok: false, error: '匿名登录失败' };
      return { ok: true, user: mapUser(u, 'anonymous') };
    } catch (e) {
      return { ok: false, error: msg(e) };
    }
  },

  // 真实微信扫码登录：通过微信开放平台「网站应用」授权拿到 code，
  // 由云函数（自定义登录）换取 ticket 后传入本方法。
  async wechat(ticket: string): Promise<AuthResult> {
    try {
      const auth = getAuth();
      await auth.signInWithCustomTicket(
        (() => Promise.resolve(ticket)) as unknown as Parameters<
          typeof auth.signInWithCustomTicket
        >[0]
      );
      const u = await auth.getCurrentUser();
      if (!u) return { ok: false, error: '微信登录失败' };
      return { ok: true, user: mapUser(u, 'wechat') };
    } catch (e) {
      return { ok: false, error: msg(e) };
    }
  },

  async logout(): Promise<void> {
    try {
      await getAuth().signOut();
    } catch {
      /* 忽略登出异常 */
    }
  },
};

export { WECHAT_WEBSITE_APPID };
