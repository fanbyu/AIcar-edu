// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from 'react';
import { QrCode, CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { useAuthStore } from '@/features/auth/authStore';
import { useAuthModalStore } from '@/features/auth/authModalStore';

type ScanPhase = 'waiting' | 'scanned' | 'authorized';

/** 由字符串确定性生成类二维码矩阵（仅用于演示视觉，非真实可扫码） */
function buildQrMatrix(seed: string, size = 25): boolean[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const m: boolean[] = [];
  for (let i = 0; i < size * size; i++) m.push(rand() > 0.5);

  const placeFinder = (r: number, c: number) => {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const rr = r + i;
        const cc = c + j;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        let v = false;
        const li = i < 0 ? 0 : i > 6 ? 6 : i;
        const lj = j < 0 ? 0 : j > 6 ? 6 : j;
        const edge = li === 0 || li === 6 || lj === 0 || lj === 6;
        const inner = li >= 2 && li <= 4 && lj >= 2 && lj <= 4;
        if (i >= 0 && i <= 6 && j >= 0 && j <= 6) v = edge || inner;
        m[rr * size + cc] = v;
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);
  return m;
}

export function WechatQr() {
  const loginWechat = useAuthStore((s) => s.loginWechat);
  const closeModal = useAuthModalStore((s) => s.closeModal);
  const ticket = useMemo(
    () => Math.random().toString(36).slice(2) + Date.now().toString(36),
    []
  );
  const matrix = useMemo(() => buildQrMatrix(ticket), [ticket]);
  const [phase, setPhase] = useState<ScanPhase>('waiting');
  const doneRef = useRef(false);

  const finish = async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('authorized');
    await loginWechat(ticket);
    setTimeout(() => closeModal(), 600);
  };

  // 演示：模拟用户扫码 -> 确认 -> 登录（真实环境由微信回调驱动）
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('scanned'), 4000);
    const t2 = setTimeout(() => void finish(), 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const size = 25;
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="relative rounded-2xl border border-slate-200 bg-white p-3 shadow-soft">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44">
          <rect width={size} height={size} fill="#fff" />
          {matrix.map((on, i) =>
            on ? (
              <rect
                key={i}
                x={i % size}
                y={Math.floor(i / size)}
                width={1}
                height={1}
                fill="#1a3c80"
              />
            ) : null
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#07c160] text-white shadow">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M9 4C4.9 4 1.5 6.9 1.5 10.4c0 1.9 1 3.6 2.7 4.8L3.3 17l2.4-1.2c.9.3 1.9.4 2.9.4h.6a5.6 5.6 0 0 1-.2-1.5c0-3.2 3-5.7 6.7-5.7h.6C15.6 6.2 12.6 4 9 4Zm-2.4 3.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4.8 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              <path d="M22.5 15.6c0-2.8-2.8-5.1-6.2-5.1s-6.2 2.3-6.2 5.1 2.8 5.1 6.2 5.1c.7 0 1.4-.1 2.1-.3l1.9 1-.5-1.7c1.6-.9 2.7-2.3 2.7-4.1Zm-8.2-.9a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm4 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {phase === 'waiting' && (
          <span className="flex items-center gap-1.5 text-slate-500">
            <QrCode className="h-4 w-4" /> 请使用微信扫一扫
          </span>
        )}
        {phase === 'scanned' && (
          <span className="flex items-center gap-1.5 text-[#07c160]">
            <Smartphone className="h-4 w-4" /> 已扫码，请在手机上确认
          </span>
        )}
        {phase === 'authorized' && (
          <span className="flex items-center gap-1.5 font-medium text-[#07c160]">
            <CheckCircle2 className="h-4 w-4" /> 登录成功，正在进入…
          </span>
        )}
      </div>

      <p className="text-center text-xs leading-relaxed text-slate-400">
        演示环境：扫码后将自动模拟确认。
        <br />
        生产环境需对接微信开放平台「网站应用」扫码登录，由云函数签发自定义登录
        ticket 后传入 CloudBase 的 signInWithCustomTicket 完成登录。
      </p>

      {/* 演示快捷入口：真实环境无需此按钮 */}
      <button
        onClick={() => void finish()}
        disabled={phase === 'authorized'}
        className="btn-ghost px-3 py-1.5 text-xs"
      >
        {phase === 'authorized' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          '模拟扫码成功'
        )}
      </button>
    </div>
  );
}
