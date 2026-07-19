// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type PointerEvent } from 'react';

interface Props {
  /** 预览框在正常流中的样式（尺寸/圆角/背景等），会应用到占位容器上 */
  className?: string;
  children: ReactNode;
}

const FLOAT_MAX_W = 400; // 悬浮时最大宽度，避免遮挡过大
const MARGIN = 16; // 悬浮窗与视口边缘的最小间距

/**
 * 悬浮宿主容器：挂到 React root（#root）内、且位于 .container-page 之外。
 * - 在 root 内 → React 事件委托（挂在 #root 上）能捕获到该节点的事件，拖拽/关闭正常；
 * - 不在 .container-page（带 backdrop-filter）内 → position: fixed 不会被其包含块“劫持”，真正相对视口定位。
 */
function getFloatHost(): HTMLElement {
  let host = document.getElementById('float-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'float-host';
    host.style.position = 'static';
    const root = document.getElementById('root') || document.body;
    root.appendChild(host);
  }
  return host;
}

/**
 * 摄像头/画布预览包装器：
 * - 正常时按 className 占据文档流中的原始位置；
 * - 当页面滚动导致预览滚出视口时，自动变为右下角悬浮窗，可用顶部把手拖动；
 * - 滚回视野或点击「×」收起后，恢复原位（点击把手的 × 仅在悬浮时显示）。
 *
 * 关键实现：悬浮时把预览节点物理移动到 document.body，避免被祖先的
 * backdrop-filter / transform / filter 等创建的包含块“劫持” position: fixed，
 * 从而让悬浮窗真正相对视口定位。移动的是同一个 DOM 节点，<video>/<canvas>
 * 不会被卸载，摄像头与画面持续有效。
 */
export function FloatingPreview({ className = '', children }: Props) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [floating, setFloating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const shouldFloat = floating && !dismissed;

  // 测量原始尺寸 + 监听是否滚出视口
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const ro = new ResizeObserver(() => {
      setSize({ w: anchor.offsetWidth, h: anchor.offsetHeight });
    });
    ro.observe(anchor);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // 回到视野：取消悬浮并清掉手动收起状态
          setDismissed(false);
          setFloating(false);
        } else {
          // 滚出视野：进入悬浮，重置到默认右下角
          setPos(null);
          setFloating(true);
        }
      },
      { threshold: 0 }
    );
    io.observe(anchor);

    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // 悬浮时把预览节点挂到 body，使 position: fixed 相对视口生效（绕过祖先包含块）
  useEffect(() => {
    const wrap = wrapRef.current;
    const anchor = anchorRef.current;
    if (!wrap || !anchor) return;
    if (shouldFloat) {
      const host = getFloatHost();
      if (wrap.parentElement !== host) host.appendChild(wrap);
    } else if (wrap.parentElement !== anchor) {
      anchor.appendChild(wrap);
    }
  }, [shouldFloat]);

  // 卸载时确保节点回归原祖先，避免 React 删除时报 removeChild 错误
  useEffect(() => {
    return () => {
      const wrap = wrapRef.current;
      const anchor = anchorRef.current;
      if (wrap && anchor && wrap.parentElement !== anchor) {
        anchor.appendChild(wrap);
      }
    };
  }, []);

  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const w = wrapRef.current?.offsetWidth ?? 0;
    const h = wrapRef.current?.offsetHeight ?? 0;
    let x = d.ox + (e.clientX - d.sx);
    let y = d.oy + (e.clientY - d.sy);
    x = Math.max(MARGIN, Math.min(x, window.innerWidth - w - MARGIN));
    y = Math.max(MARGIN, Math.min(y, window.innerHeight - h - MARGIN));
    setPos({ x, y });
  };
  const onHandleUp = (e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const floatW = Math.min(size.w || 300, FLOAT_MAX_W);
  const floatStyle: CSSProperties = shouldFloat
    ? {
        position: 'fixed',
        zIndex: 9999,
        width: floatW,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        ...(pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
          : { right: MARGIN, bottom: MARGIN, left: 'auto', top: 'auto' }),
      }
    : {};

  // 悬浮时给占位容器保留原始尺寸（背景透明），避免布局跳动
  const anchorStyle: CSSProperties = shouldFloat
    ? { width: size.w || undefined, height: size.h || undefined, background: 'transparent' }
    : {};

  return (
    <div ref={anchorRef} className={className} style={anchorStyle}>
      <div ref={wrapRef} style={floatStyle}>
        {shouldFloat && (
          <div
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            className="relative z-10 flex cursor-move items-center justify-between rounded-t-lg bg-slate-800 px-2 py-1 text-[11px] text-white/80 select-none"
          >
            <span>⠿ 拖拽预览</span>
            <button
              onClick={() => setDismissed(true)}
              className="rounded px-1 leading-none hover:bg-white/20"
              title="收起悬浮预览"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
