# Quantum Forge Desktop App (Native EXE)

Build commands on Windows (Visual Studio 2022 Developer Prompt):

```bat
cd desktop
cmake -S . -B build
cmake --build build --config Debug
```

Output executables:

```bat
.\build\bin\Debug\Quantum_Forge_engine.exe
.\build\bin\Debug\Quantum_Smith.exe
```

## Behavior

The desktop EXE is now a launcher for the same web IDE experience:

1. If `http://localhost:5173` is running, it opens that in browser app-mode.
2. Otherwise it opens packaged web files at `build/bin/Debug/web/index.html`.
3. If neither is available, it shows setup instructions.

## Packaged Mode Setup

From project root, build web bundle first:

```bat
npm run build
```

Then rebuild desktop target so CMake copies `../dist` to `build/bin/Debug/web`.

## Creating Desktop Shortcuts

After building, you can create a desktop shortcut easily:
1. Open PowerShell
2. Run: `.\CreateShortcut.ps1`

Optional web-file app-mode shortcut (no dev server):

```powershell
.\CreateWebAppShortcut.ps1
```

## One Command Launcher

Launch both apps:

```powershell
.\Run-QuantumSuite.ps1
```

Launch both apps and auto-start dev server:

```powershell
.\Run-QuantumSuite.ps1 -Dev
```

Batch alternative:

```bat
Run-QuantumSuite.bat
Run-QuantumSuite.bat dev
```

