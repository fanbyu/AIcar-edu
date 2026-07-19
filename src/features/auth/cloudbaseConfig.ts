// SPDX-License-Identifier: AGPL-3.0-or-later
// CloudBase 运行配置（通过 Vite 环境变量注入，详见 .env.example）
const env = import.meta.env as unknown as Record<string, string | undefined>;

export const CLOUDBASE_ENV_ID = (env.VITE_CLOUDBASE_ENV_ID ?? '').trim();
export const CLOUDBASE_REGION = (env.VITE_CLOUDBASE_REGION ?? 'ap-shanghai').trim();
/** 微信开放平台「网站应用」AppID，用于真实扫码登录（可选） */
export const WECHAT_WEBSITE_APPID = (env.VITE_WECHAT_WEBSITE_APPID ?? '').trim();

/** 是否启用真实 CloudBase 鉴权；未配置 env 时回退到本地演示鉴权 */
export const isCloudbaseEnabled = Boolean(CLOUDBASE_ENV_ID);
