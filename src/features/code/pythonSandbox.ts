// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 浏览器内 Python 安全沙箱：在 Web Worker 中通过本地 Pyodide 运行时执行用户代码，
 * 捕获 stdout / 返回值，带超时。数据全部端侧处理，不访问网络，可离线运行。
 */
import pyWorkerUrl from './pyWorker.js?url';

export interface PyRunResult {
  logs: string[];
  result: string;
  error?: string;
  status?: string;
  /** 代码通过 car.* 调用产生的最近一条小车指令 */
  carCmd?: string;
}

export function runPython(code: string, timeout = 30000): Promise<PyRunResult> {
  return new Promise((resolve) => {
    const worker = new Worker(pyWorkerUrl, { type: 'classic' });
    const logs: string[] = [];
    let settled = false;
    const finish = (r: PyRunResult) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ logs, result: '', error: `执行超时（${timeout}ms）` }),
      timeout
    );
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'status') {
        logs.push(d.value);
      } else if (d.type === 'done') {
        clearTimeout(timer);
        finish({ logs: d.logs, result: d.result, carCmd: d.carCmd });
      } else if (d.type === 'error') {
        clearTimeout(timer);
        finish({ logs, result: '', error: d.value });
      }
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      finish({ logs, result: '', error: e.message });
    };
    const indexURL = window.location.origin + '/pyodide/';
    worker.postMessage({ type: 'init', indexURL });
    worker.postMessage({ code });
  });
}
