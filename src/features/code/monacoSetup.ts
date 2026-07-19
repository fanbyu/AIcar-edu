// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 将 Monaco 编辑器改为本地打包（不再依赖 jsdelivr CDN），
 * 满足「纯静态托管、可离线」部署要求（教室无外网时编辑器仍可正常加载）。
 * 仅引入 JavaScript / TypeScript 语言支持，避免打包全部语言导致体积过大。
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Monaco Web Worker 环境（浏览器端语法高亮 / 类型校验）
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// 使用本地 monaco 实例，禁用默认 CDN loader
loader.config({ monaco });

export {};
