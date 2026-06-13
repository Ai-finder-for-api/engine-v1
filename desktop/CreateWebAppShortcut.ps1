$WshShell = New-Object -ComObject WScript.Shell
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$DistIndex = Join-Path $ProjectRoot "dist\index.html"

if (!(Test-Path $DistIndex)) {
  Write-Error "dist/index.html not found. Run npm run build first."
  exit 1
}

$EdgePath = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (!(Test-Path $EdgePath)) {
  $EdgePath = "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
}

if (!(Test-Path $EdgePath)) {
  Write-Error "Microsoft Edge not found."
  exit 1
}

$FileUrl = "file:///" + ($DistIndex -replace '\\','/')
$Shortcut = $WshShell.CreateShortcut("$Home\Desktop\Quantum Forge Web App.lnk")
$Shortcut.TargetPath = $EdgePath
$Shortcut.Arguments = "--app=\"$FileUrl\""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation = "$EdgePath, 0"
$Shortcut.Save()

Write-Output "Web app shortcut created on Desktop."
