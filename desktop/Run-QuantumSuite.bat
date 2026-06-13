@echo off
setlocal

set MODE=%1
set DESKTOP_DIR=%~dp0
set PROJECT_ROOT=%DESKTOP_DIR%..

if /I "%MODE%"=="dev" (
  start "Quantum Dev Server" cmd /k "cd /d "%PROJECT_ROOT%" && npm run dev"
  timeout /t 2 >nul
)

if exist "%DESKTOP_DIR%build\bin\Debug\Quantum_Forge_engine.exe" (
  start "Quantum Forge" "%DESKTOP_DIR%build\bin\Debug\Quantum_Forge_engine.exe"
) else (
  echo Quantum_Forge_engine.exe not found.
)

if exist "%DESKTOP_DIR%build\bin\Debug\Quantum_Smith.exe" (
  start "Quantum Smith" "%DESKTOP_DIR%build\bin\Debug\Quantum_Smith.exe"
) else (
  echo Quantum_Smith.exe not found.
)

endlocal
