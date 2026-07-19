# 预置 YOLO-World 开放词汇检测所需的离线资源（可选步骤）：
#   1) 默认提示词 prompts.json（与前端 YOLO-PROMPTS-DEFAULT 顺序一致）
#   2) YOLO-World ONNX 模型（由用户用官方脚本导出，或用 -ModelUrl 指定现成 ONNX）
# 说明：ort-web 的 wasm 运行时已由前端 Vite 插件自动托管（dev 中间件 + build 复制到
#   dist/models/yolo-world/wasm），无需本脚本；本脚本只负责把 ONNX 与提示词“预置”到
#   public/models/yolo-world/，方便完全离线、开箱即用。
#   页面内也可直接「上传 .onnx」或「填 URL 加载」，无需服务器执行任何命令。
param(
  [string]$ModelUrl = "",                       # 现成 ONNX 的下载地址（可选）
  [string]$OutDir = "public/models/yolo-world"  # 输出目录
)

$ErrorActionPreference = "Stop"

# ---- 0. 准备目录 ----
New-Item -ItemType Directory -Force -Path "$OutDir/wasm" | Out-Null
Write-Host "==> 目标目录: $OutDir"

# ---- 1. ort-web 的 wasm 运行时 ----
# 已由前端 Vite 插件自动托管（dev 中间件 + build 复制 dist/models/yolo-world/wasm），
# 无需手动复制。如需把 wasm 也预置进 public 目录（与 ONNX 一起离线分发），可取消下一行注释：
# Copy-Item -Path "node_modules/onnxruntime-web/dist/*" -Destination "$OutDir/wasm/" -Recurse -Force
Write-Host "==> ort-web wasm 由 Vite 自动托管，跳过手动复制。"

# ---- 2. 默认提示词（需与导出 ONNX 的 --custom-text 顺序一致） ----
$prompts = @(
  "person", "car", "bus", "truck", "motorcycle", "bicycle", "traffic light", "stop sign"
)
$prompts | ConvertTo-Json -Compress | Set-Content -Encoding utf8 "$OutDir/prompts.json"
Write-Host "==> 已写入默认提示词 $OutDir/prompts.json"

# ---- 3. YOLO-World ONNX 模型 ----
# YOLO-World 是 PyTorch 模型，需先导出为 ONNX（官方仓库提供 export_onnx.py）。
# 推荐导出方式（需先 clone https://github.com/AILab-CVC/YOLO-World 并 pip install）：
#   python tools/deploy/export_onnx.py \
#     configs/pretrain/yolo_world_v2_l_vl2real_v1.py \
#     weights/yolo_world_v2_l.pth \
#     --custom-text public/models/yolo-world/prompts.json \
#     --output public/models/yolo-world/yolo-world.onnx
# 该命令会把 prompts.json 里的文本提示“烘焙”进模型，输出单文件 ONNX（仅图像输入）。

if ($ModelUrl -ne "") {
  Write-Host "==> 从 $ModelUrl 下载 yolo-world.onnx ..."
  Invoke-WebRequest -Uri $ModelUrl -OutFile "$OutDir/yolo-world.onnx" -UseBasicParsing
  $size = (Get-Item "$OutDir/yolo-world.onnx").Length
  Write-Host "==> 已下载 yolo-world.onnx ($([math]::Round($size/1MB,1)) MB)"
} else {
  Write-Host ""
  Write-Host "!! 未提供 -ModelUrl，未下载 ONNX 模型。" -ForegroundColor Yellow
  Write-Host "   请按上方「官方导出方式」用 export_onnx.py 生成 yolo-world.onnx，"
  Write-Host "   或重新运行： .\scripts\download-yolo-world.ps1 -ModelUrl <你的ONNX地址>"
  Write-Host "   注：前端用开放词汇时，<你的ONNX地址> 对应的导出提示词需与 prompts.json 顺序一致。"
}

Write-Host ""
Write-Host "完成。前端将读取 /models/yolo-world/yolo-world.onnx 与 /models/yolo-world/wasm/。"
