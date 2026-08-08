// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * 摄像头采集 Hook：getUserMedia 抽帧，权限被拒时返回错误以触发上传兜底。
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前环境不支持摄像头（需 HTTPS 或 localhost）');
      setActive(false);
      return;
    }
    // 多层约束兜底：依次放宽，避免「environment / 固定 224×224」在桌面或某些设备上
    // 直接抛 OverconstrainedError / NotFoundError 导致摄像头完全打不开。
    // 用 ideal 而非 exact：浏览器会尽量满足但不强制，兼容性最好。
    const constraintsList: MediaStreamConstraints[] = [
      { video: { facingMode: 'environment', width: { ideal: 224 }, height: { ideal: 224 } }, audio: false },
      { video: { width: { ideal: 224 }, height: { ideal: 224 } }, audio: false },
      { video: true, audio: false },
    ];
    for (const constraints of constraintsList) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // play() 在某些浏览器返回 rejected promise（如自动播放策略），容错处理
          try {
            await videoRef.current.play();
          } catch {
            /* 忽略：video 元素已绑定 srcObject，后续仍能抽帧 */
          }
        }
        setActive(true);
        setError(null);
        return;
      } catch (e) {
        // 该层约束失败，尝试下一层更宽松的约束
        console.warn('[useCamera] getUserMedia 失败，尝试更宽松约束：', e);
      }
    }
    // 所有约束层都失败
    setError('无法访问摄像头（权限被拒或没有可用摄像头），可用「上传图片」代替。');
    setActive(false);
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  /** 从视频帧抽一张图返回 ImageData/画笔用的源 */
  const captureFrame = useCallback((): HTMLVideoElement | null => {
    return videoRef.current;
  }, []);

  return { videoRef, start, stop, error, active, captureFrame };
}
