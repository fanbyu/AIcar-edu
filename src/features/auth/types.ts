// SPDX-License-Identifier: AGPL-3.0-or-later
export type LoginMethod = 'email' | 'wechat' | 'anonymous';

export interface AuthUser {
  uid: string;
  method: LoginMethod;
  email?: string;
  nickname: string;
  /** 生成的头像渐变色（Tailwind 类名） */
  avatarColor: string;
  createdAt: number;
  lastLoginAt: number;
  /** 微信相关（真实环境由微信开放平台返回） */
  wxNickname?: string;
  wxAvatar?: string;
  /** 是否为匿名（游客）账号 */
  anonymous?: boolean;
}

export interface RegisterPayload {
  email: string;
  password: string;
  nickname?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

export const methodLabel: Record<LoginMethod, string> = {
  email: '邮箱',
  wechat: '微信',
  anonymous: '游客',
};
