@echo off
setlocal

if not exist build mkdir build
cmake -S . -B build -A x64
cmake --build build --config Release

echo.
echo Build complete: build\Release\quantum_forge_runtime.exe
