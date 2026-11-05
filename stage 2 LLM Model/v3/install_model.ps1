param(
    [string]$TargetDir = "$PSScriptRoot\model_int8"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
$url = "https://github.com/asembarhoush-dotcom/PackGuard/releases/download/v2.0-model/packguard-modernbert-v3-onnx.tar.gz"
$tmp = "$env:TEMP\packguard-modernbert-v3-onnx.tar.gz"
Write-Host "[PackGuard Stage 2 v3] Downloading model..."
Invoke-WebRequest -Uri $url -OutFile $tmp
Write-Host "[PackGuard Stage 2 v3] Extracting..."
tar -xzf $tmp -C $TargetDir
Remove-Item -Force $tmp
Write-Host "[PackGuard Stage 2 v3] Installation complete! Verifying..."
python "$PSScriptRoot\stage2_filter.py" --self-test
