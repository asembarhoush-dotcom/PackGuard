$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$expected = "2A5C8029DC360F2F91327A280034B1EC4875814ED0103E245766781365529792"
$out = "packguard-modernbert-v2-onnx.tar.gz"
$o = [IO.File]::Create((Join-Path $PSScriptRoot $out))
foreach ($p in (Get-ChildItem "$out.part*" | Sort-Object Name)) {
    $b = [IO.File]::ReadAllBytes($p.FullName)
    $o.Write($b, 0, $b.Length)
}
$o.Close()
$actual = (Get-FileHash $out -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw "SHA-256 mismatch: got $actual" }
New-Item -ItemType Directory -Force ..\onnx | Out-Null
tar -xzf $out -C ..\onnx
Remove-Item $out
Write-Host "OK: model extracted to $(Resolve-Path ..\onnx)"
Get-ChildItem ..\onnx
