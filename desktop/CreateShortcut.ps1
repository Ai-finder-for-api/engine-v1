$WshShell = New-Object -ComObject WScript.Shell
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$ExePath = Join-Path $PSScriptRoot "build\bin\Debug\Quantum_Forge_engine.exe"

if (!(Test-Path $ExePath)) {
  Write-Error "Executable not found: $ExePath"
  exit 1
}

$Shortcut = $WshShell.CreateShortcut("$Home\Desktop\Quantum Forge Engine.lnk")
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = Split-Path $ExePath
$Shortcut.IconLocation = "$ExePath, 0"
$Shortcut.Save()

$SmithExePath = Join-Path $PSScriptRoot "build\bin\Debug\Quantum_Smith.exe"
if (Test-Path $SmithExePath) {
  $SmithShortcut = $WshShell.CreateShortcut("$Home\Desktop\Quantum Smith IDE.lnk")
  $SmithShortcut.TargetPath = $SmithExePath
  $SmithShortcut.WorkingDirectory = Split-Path $SmithExePath
  $SmithShortcut.IconLocation = "$SmithExePath, 0"
  $SmithShortcut.Save()
}

$EdgePath = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (!(Test-Path $EdgePath)) {
  $EdgePath = "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
}

if (Test-Path $EdgePath) {
  $WebShortcut = $WshShell.CreateShortcut("$Home\Desktop\Quantum Forge Web Dev.lnk")
  $WebShortcut.TargetPath = $EdgePath
  $WebShortcut.Arguments = "--app=http://localhost:5173"
  $WebShortcut.WorkingDirectory = $ProjectRoot
  $WebShortcut.IconLocation = "$EdgePath, 0"
  $WebShortcut.Save()
}

Write-Output "Desktop shortcuts created."
