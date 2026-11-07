$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetDir = Join-Path $ScriptDir "checkpoints"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

$ModelUrl = "https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard_v4_nano_int8.onnx"
$ModelPath = Join-Path $TargetDir "packguard_v4_nano_int8.onnx"

if (-not (Test-Path $ModelPath)) {
    Write-Host "[PackGuard Stage 2 v4 CPU-Only] Downloading 11.83 MB packguard_v4_nano_int8.onnx..."
    try {
        Invoke-WebRequest -Uri $ModelUrl -OutFile $ModelPath -UseBasicParsing
    } catch {
        Write-Warning "Could not download ONNX model; falling back to Fast-Path CPU Engine."
    }
}

Write-Host "[PackGuard Stage 2 v4 CPU-Only] Verifying 100% CPU-Only Lightweight Filter..."
python (Join-Path $ScriptDir "stage2_filter.py") --self-test
Write-Host "[PackGuard Stage 2 v4 CPU-Only] Ready for ultra-fast CPU inference (Zero GPU required)!"
