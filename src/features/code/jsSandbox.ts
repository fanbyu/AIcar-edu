// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 浏览器内 JS 安全沙箱：在 Web Worker 中执行用户代码，捕获 console 输出，带超时。
 * 仅暴露安全的 console API，不访问 DOM / 网络，避免阻塞 UI 主线程。
 */
const WORKER_SRC = `
self.onmessage = (e) => {
  const { code, timeout } = e.data;
  const logs = [];
  const timer = setTimeout(() => {
    self.postMessage({ type: 'error', value: '执行超时（' + timeout + 'ms）' });
    self.close();
  }, timeout);
  const sandboxConsole = {
    log: (...a) => logs.push(a.map(fmt).join(' ')),
    info: (...a) => logs.push(a.map(fmt).join(' ')),
    warn: (...a) => logs.push('[warn] ' + a.map(fmt).join(' ')),
    error: (...a) => logs.push('[error] ' + a.map(fmt).join(' ')),
  };
  function fmt(v) {
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
    return String(v);
  }
  try {
    const fn = new Function('console', code);
    const result = fn(sandboxConsole);
    clearTimeout(timer);
    self.postMessage({ type: 'done', logs, result: result === undefined ? '' : fmt(result) });
  } catch (err) {
    clearTimeout(timer);
    self.postMessage({ type: 'error', value: err && err.message ? err.message : String(err) });
  }
  self.close();
};
`;

export interface RunResult {
  logs: string[];
  result: string;
  error?: string;
}

export function runJs(code: string, timeout = 3000): Promise<RunResult> {
  return new Promise((resolve) => {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    const done = (r: RunResult) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'done') done({ logs: d.logs, result: d.result });
      else if (d.type === 'error') done({ logs: [], result: '', error: d.value });
    };
    worker.onerror = (e) => done({ logs: [], result: '', error: e.message });
    worker.postMessage({ code, timeout });
  });
}
