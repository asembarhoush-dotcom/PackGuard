$ErrorActionPreference = "Stop"

# ==============================================================================
# PackGuard Stage 2 v2 — One-Command Model Installer & Self-Test (Windows PowerShell)
# ==============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$VenvDir = Join-Path $ScriptDir ".venv-stage2"
$ModelDir = Join-Path $ScriptDir "model_int8"
$OnnxArchive = Join-Path $ScriptDir "packguard-modernbert-v2-onnx.tar.gz"
$Part1Url = "https://n.uguu.se/zHuNPGmY"
$Part2Url = "https://d.uguu.se/wDCGaCxO"
$GofilePage = "https://gofile.io/d/w81spJ2a"

Write-Host "=================================================================="
Write-Host " PackGuard Stage 2 (ModernBERT v2 INT8) — Automated Setup"
Write-Host "=================================================================="

if (-not (Test-Path $VenvDir)) {
    Write-Host "[1/4] Creating Python virtual environment at $VenvDir ..."
    python -m venv $VenvDir
} else {
    Write-Host "[1/4] Using existing virtual environment at $VenvDir ..."
}

$PipExe = Join-Path $VenvDir "Scripts\pip.exe"
$PyExe = Join-Path $VenvDir "Scripts\python.exe"

Write-Host "[2/4] Installing lightweight CPU dependencies (onnxruntime, transformers, numpy)..."
& $PipExe install --upgrade pip -q
& $PipExe install onnxruntime transformers numpy -q

New-Item -ItemType Directory -Force -Path $ModelDir | Out-Null
$OnnxFile = Join-Path $ModelDir "packguard_modernbert_v2_int8.onnx"

if (-not (Test-Path $OnnxFile)) {
    if (-not (Test-Path $OnnxArchive)) {
        Write-Host "[3/4] Downloading pre-trained ModernBERT v2 INT8 ONNX bundle (147 MB)..."
        $P1 = "$OnnxArchive.part1"
        $P2 = "$OnnxArchive.part2"
        curl.exe -L --fail --retry 3 -o $P1 $Part1Url
        curl.exe -L --fail --retry 3 -o $P2 $Part2Url
        cmd.exe /c "copy /b `"$P1`"+`"$P2`" `"$OnnxArchive`" >nul"
        Remove-Item -Force $P1, $P2 -ErrorAction SilentlyContinue
    }
    Write-Host "      Extracting model into $ModelDir ..."
    tar -xzf $OnnxArchive -C $ModelDir
    if (-not (Test-Path $OnnxFile)) {
        Get-ChildItem -Path $ModelDir -Recurse -File | ForEach-Object {
            Move-Item -Force $_.FullName $ModelDir
        }
    }
    Remove-Item -Force $OnnxArchive -ErrorAction SilentlyContinue
} else {
    Write-Host "[3/4] Model already present at $OnnxFile"
}

Write-Host "[4/4] Running Stage 2 v2 self-test..."
& $PyExe (Join-Path $ScriptDir "stage2_filter.py") --model-dir $ModelDir --self-test

Write-Host ""
Write-Host "=================================================================="
Write-Host " Setup Complete! How to run Stage 2 v2 on Stage 1 reports:"
Write-Host "=================================================================="
Write-Host "  `"$PyExe`" `"$ScriptDir\stage2_filter.py`" --reports path\to\reports_dir"
Write-Host "=================================================================="
