# Quantum Forge Runtime (CMake)

## Build on Windows x64

1. Open `x64 Native Tools Command Prompt for VS`.
2. Run `tools\\build_windows_x64.bat`.
3. Executable output: `build\\Release\\quantum_forge_runtime.exe`.

## Run

```bash
quantum_forge_runtime.exe assets/export.game
```

The runtime parses section metadata from `QGAMEFMT` files.
