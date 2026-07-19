import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 将 node_modules/pyodide 运行时离线化：
 * - dev：通过中间件在 /pyodide 提供本地运行时（免 CDN）。
 * - build：复制整个运行时到 dist/pyodide，使产物可纯静态、离线运行。
 */
function pyodideLocalPlugin() {
  const pyoSrc = path.resolve(__dirname, 'node_modules/pyodide');
  const pyoDest = path.resolve(__dirname, 'dist/pyodide');
  const MIME: Record<string, string> = {
    '.js': 'text/javascript',
    '.wasm': 'application/wasm',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.html': 'text/html',
    '.map': 'application/json',
  };
  return {
    name: 'pyodide-local',
    configureServer(server: any) {
      server.middlewares.use('/pyodide', (req: any, res: any, next: any) => {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const filePath = path.join(pyoSrc, urlPath);
        if (!filePath.startsWith(pyoSrc)) return next();
        fs.readFile(filePath, (err, data) => {
          if (err) return next();
          const ext = path.extname(filePath);
          res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(data);
        });
      });
    },
    closeBundle() {
      fs.mkdirSync(pyoDest, { recursive: true });
      // 仅复制运行所需的运行时文件，避免 cpSync 递归大目录在 Windows 上崩溃
      const files = [
        'pyodide.js',
        'pyodide.asm.js',
        'pyodide.asm.wasm',
        'python_stdlib.zip',
        'pyodide-lock.json',
      ];
      for (const f of files) {
        fs.copyFileSync(path.join(pyoSrc, f), path.join(pyoDest, f));
      }
    },
  };
}

/**
 * 将 node_modules/onnxruntime-web 的 wasm 运行时离线化（类比 pyodide 插件）：
 * - dev：通过中间件在 /models/yolo-world/wasm 提供本地运行时（免 CDN、免手动下载脚本）。
 * - build：复制 wasm 到 dist/models/yolo-world/wasm，使产物可纯静态、离线运行。
 * 这样浏览器端加载 YOLO-World（ort-web）时无需服务器事先执行 npm run download:yolo-world。
 */
function ortWasmLocalPlugin() {
  const ortSrc = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');
  const MIME: Record<string, string> = {
    '.wasm': 'application/wasm',
    '.mjs': 'text/javascript',
    '.js': 'text/javascript',
    '.jsep': 'application/octet-stream',
  };
  return {
    name: 'ort-wasm-local',
    configureServer(server: any) {
      server.middlewares.use('/models/yolo-world/wasm', (req: any, res: any, next: any) => {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const filePath = path.join(ortSrc, urlPath);
        if (!filePath.startsWith(ortSrc)) return next();
        fs.readFile(filePath, (err, data) => {
          if (err) return next();
          const ext = path.extname(filePath);
          res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(data);
        });
      });
    },
    closeBundle() {
      if (!fs.existsSync(ortSrc)) return;
      const dest = path.resolve(__dirname, 'dist/models/yolo-world/wasm');
      fs.mkdirSync(dest, { recursive: true });
      for (const f of fs.readdirSync(ortSrc)) {
        const ext = path.extname(f);
        if (['.wasm', '.mjs', '.js', '.jsep'].includes(ext)) {
          fs.copyFileSync(path.join(ortSrc, f), path.join(dest, f));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pyodideLocalPlugin(), ortWasmLocalPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 本项目使用 MoveNet 的 tfjs 运行时，不需 mediapipe/webgpu 运行时；
      // pose-detection 仍会静态 import 它们，离线环境下用占位桩代替，避免打包/解析失败。
      '@mediapipe/pose': path.resolve(__dirname, 'src/stubs/mediapipe-pose.ts'),
      '@tensorflow/tfjs-backend-webgpu': path.resolve(__dirname, 'src/stubs/tfjs-backend-webgpu.ts'),
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom', 'zustand'],
          tfjs: ['@tensorflow/tfjs', '@tensorflow-models/mobilenet'],
          monaco: ['monaco-editor', '@monaco-editor/react'],
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
    port: 5173,
    // 避免 Windows 上监视 public/models 下大模型文件时触发 EBUSY 导致 dev 进程崩溃
    watch: {
      ignored: ['**/public/models/**'],
      usePolling: false,
    },
  },
});
