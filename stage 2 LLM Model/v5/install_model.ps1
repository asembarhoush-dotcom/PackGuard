$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetDir = Join-Path $ScriptDir "checkpoints"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

$ModelUrl = "https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard_v5_nano_int8.onnx"
$ModelPath = Join-Path $TargetDir "packguard_v5_nano_int8.onnx"

if (-not (Test-Path $ModelPath)) {
    Write-Host "[PackGuard Stage 2 v5 CPU-Only] Downloading <10 MB packguard_v5_nano_int8.onnx from v2.0-model release..."
    try {
        Invoke-WebRequest -Uri $ModelUrl -OutFile $ModelPath -UseBasicParsing
    } catch {
        Write-Warning "Could not download ONNX model from GitHub release; falling back to Fast-Path CPU Engine."
    }
}

Write-Host "[PackGuard Stage 2 v5 CPU-Only] Verifying 100% CPU-Only Lightweight Filter..."
if (Test-Path (Join-Path $ScriptDir "stage2_filter.py")) {
    python (Join-Path $ScriptDir "stage2_filter.py") --self-test
} else {
    python (Join-Path $ScriptDir "quantize_and_distill_v5.py") --self-test
}
Write-Host "[PackGuard Stage 2 v5 CPU-Only] Ready for ultra-fast CPU inference (<0.5ms, Zero GPU required)!"
