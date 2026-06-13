param(
  [switch]$Dev
)

$DesktopDir = $PSScriptRoot
$ProjectRoot = Split-Path $DesktopDir -Parent
$EngineExe = Join-Path $DesktopDir "build\bin\Debug\Quantum_Forge_engine.exe"
$SmithExe = Join-Path $DesktopDir "build\bin\Debug\Quantum_Smith.exe"

if ($Dev) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$ProjectRoot`"; npm run dev"
  Start-Sleep -Milliseconds 1500
}

if (Test-Path $EngineExe) {
  Start-Process $EngineExe
} else {
  Write-Error "Engine exe not found: $EngineExe"
}

if (Test-Path $SmithExe) {
  Start-Process $SmithExe
} else {
  Write-Warning "Quantum Smith exe not found yet. Rebuild desktop target to generate it."
}
