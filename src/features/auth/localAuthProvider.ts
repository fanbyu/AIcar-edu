// SPDX-License-Identifier: AGPL-3.0-or-later
import type {
  AuthUser,
  LoginPayload,
  RegisterPayload,
  AuthResult,
  LoginMethod,
} from './types';

/**
 * 本地鉴权实现（localStorage 支撑，开箱即用，无需后端）。
 *
 * ⚠️ 仅用于前端演示：密码做了简单混淆而非加密存储，切勿用于生产。
 * 生产环境（如部署到腾讯云开发 CloudBase）请替换为真实 provider：
 *   - 邮箱登录：CloudBase 邮箱密码登录 provider
 *   - 微信扫码：微信开放平台「网站应用」+ 云函数换取 openid
 *   - 匿名登录：CloudBase 匿名登录 provider
 * 只需实现下方同名的 AuthProvider 接口即可无缝切换。
 */

const ACCOUNTS_KEY = 'smartcar-accounts';

interface StoredAccount {
  uid: string;
  email: string;
  passwordHash: string;
  nickname: string;
  createdAt: number;
}

export interface AuthProvider {
  register(p: RegisterPayload): Promise<AuthResult>;
  login(p: LoginPayload): Promise<AuthResult>;
  anonymous(): Promise<AuthResult>;
  /** ticket 为微信扫码后回传的凭证，真实环境由后端/云函数换 openid */
  wechat(ticket: string): Promise<AuthResult>;
  /** 服务端登出（清理登录态） */
  logout(): Promise<void>;
}

const avatarColors = [
  'from-sky-400 to-blue-500',
  'from-violet-400 to-purple-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-pink-400 to-rose-500',
  'from-cyan-400 to-sky-500',
];

export function pickAvatarColor(seed: string): string {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s += seed.charCodeAt(i);
  return avatarColors[s % avatarColors.length];
}

// 演示用弱混淆，绝非加密
function hash(pw: string): string {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = (h << 5) - h + pw.charCodeAt(i);
    h |= 0;
  }
  return 'h' + (h >>> 0).toString(16);
}

function readAccounts(): StoredAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]') as StoredAccount[];
  } catch {
    return [];
  }
}

function writeAccounts(a: StoredAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a));
}

function genUid(prefix = 'u'): string {
  return (
    prefix +
    '_' +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}

function toUser(a: StoredAccount, method: LoginMethod, extra?: Partial<AuthUser>): AuthUser {
  return {
    uid: a.uid,
    method,
    email: a.email || undefined,
    nickname: a.nickname,
    avatarColor: pickAvatarColor(a.uid),
    createdAt: a.createdAt,
    lastLoginAt: Date.now(),
    ...extra,
  };
}

export const localAuthProvider: AuthProvider = {
  async register(p: RegisterPayload): Promise<AuthResult> {
    const email = p.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: '邮箱格式不正确' };
    }
    if (p.password.length < 6) {
      return { ok: false, error: '密码至少 6 位' };
    }
    const accounts = readAccounts();
    if (accounts.find((a) => a.email === email)) {
      return { ok: false, error: '该邮箱已注册，请直接登录' };
    }
    const acc: StoredAccount = {
      uid: genUid(),
      email,
      passwordHash: hash(p.password),
      nickname: p.nickname?.trim() || email.split('@')[0],
      createdAt: Date.now(),
    };
    writeAccounts([...accounts, acc]);
    return { ok: true, user: toUser(acc, 'email') };
  },

  async login(p: LoginPayload): Promise<AuthResult> {
    const email = p.email.trim().toLowerCase();
    const acc = readAccounts().find((a) => a.email === email);
    if (!acc) return { ok: false, error: '账号不存在，请先注册' };
    if (acc.passwordHash !== hash(p.password)) return { ok: false, error: '密码错误' };
    return { ok: true, user: toUser(acc, 'email') };
  },

  async anonymous(): Promise<AuthResult> {
    const acc: StoredAccount = {
      uid: genUid('anon'),
      email: '',
      passwordHash: '',
      nickname: '游客' + Math.floor(Math.random() * 1000),
      createdAt: Date.now(),
    };
    return { ok: true, user: { ...toUser(acc, 'anonymous'), anonymous: true } };
  },

  // 真实环境：此处应调用云函数，用 ticket 向微信开放平台换取 access_token / openid，
  // 再据此创建或查询平台用户。这里用 ticket 直接派生一个演示账号。
  async wechat(ticket: string): Promise<AuthResult> {
    const acc: StoredAccount = {
      uid: genUid('wx'),
      email: '',
      passwordHash: '',
      nickname: '微信用户',
      createdAt: Date.now(),
    };
    return {
      ok: true,
      user: toUser(acc, 'wechat', { wxNickname: '微信用户' + ticket.slice(0, 4) }),
    };
  },

  async logout() {
    // 本地演示无需服务端登出
  },
};
