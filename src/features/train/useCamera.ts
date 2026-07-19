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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 224, height: 224 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法访问摄像头');
      setActive(false);
    }
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
