# Quantum Forge

**A hybrid C++ + TypeScript game engine with a built-in IDE called Quantum Smith.**

Quantum Forge is an ambitious, early-stage, passion-driven game engine that aims to blend the performance of C++ with the rapid development capabilities of modern web technologies. It is designed for developers who want low-level control, fast prototyping, and a unique workflow that doesn't force you into a massive bloated engine like Unreal or Unity.

> **Warning**: This project is in **very early development**. Expect bugs, missing features, and occasional chaos.

![Screenshot](quantum_forge.png)
![Screenshot](quantum_smith.png)

## Philosophy

Quantum Forge was born from the idea of **"Quantum"** (fast, modern, lightweight) and **"Forge"** (building something powerful from raw materials). The built-in IDE is named **Quantum Smith** — a lightweight code editor inside the engine, though we highly recommend using Visual Studio 2022 or any external IDE for serious development.

## Current Features

- **High-Performance 3D Renderer**
  - Full glTF 2.0 / GLB model support
  - Mixamo / mixamorig skeleton & animation system
  - Real-time viewport with grid, stats, and model inspection

- **Quantum Smith IDE**
  - Built-in code tabs (MainGame.cpp, GameMode.h, etc.)
  - Read-only reference view (real editing happens in external IDE or planned full editor)
  - Integrated with the renderer for live preview

- **Desktop Launcher**
  - Quantum_Smith.exe — One-click solution
  - Automatically runs 
pm install, 
pm audit fix --force, 
pm run dev
  - Opens the editor in a browserless window (Electron-style)

- **Custom Binary Format (.game)**
  - Custom packer/exporter
  - **Binary Layout Inspector** — View sections, compression, offsets, stored vs raw data
  - Designed for optimized game distribution

- **C++ First Workflow**
  - Core logic in C++ with CMake
  - Easy integration with external IDEs (VS 2022 recommended)

## Tech Stack (The Suffering Part)

- **Frontend**: TypeScript + Vite + React (or similar)
- **3D Engine**: Three.js (or custom WebGL layer)
- **Backend / Runtime**: C++17/20 + CMake
- **Build System**: CMake for desktop, npm scripts for web
- **Asset Pipeline**: glTF 2.0 focused
- **Dependencies**: A LOT (we know, it's being optimized)

## Installation & Quick Start

1. Clone the repository:
   `ash
   git clone https://github.com/Ai-finder-for-api/engine-v1.git
   cd engine-v1

Easiest way — Use the desktop launcher:
Run Quantum_Smith.exe (located in desktop folder after build)

Manual way:Bashnpm install
npm run dev
Desktop Build:Bashcd desktop
cmake -B build -S .
cmake --build build --config Release

Project Structure
textengine-v1/
├── desktop/              # C++ backend + launcher
├── src/                  # TypeScript / Frontend source
├── public/               # Static assets
├── CMakeLists.txt
├── package.json
├── .gitignore
└── README.md
Current Limitations & Known Issues

Rendering still has some bugs (working on fixes)
.game files are exported but not yet playable (no runtime execution yet)
Scene management is basic — switching models works but moving/organizing multiple models is limited
Built-in editor is minimal (use VS 2022 for heavy coding)
Lots of dependencies → slower install & larger size
Binary format is experimental

Roadmap (Future Plans)

Full playable game runtime for .game files
Better scene editor (drag & drop models, transform tools)
Physics integration (Bullet or custom)
Improved rendering pipeline + bug fixes
Scripting system (maybe Lua or custom)
Asset manager & material editor
Reduce dependency count
Better documentation & examples
Audio system
Multiplayer foundation
Packaging & distribution tools

Why Quantum Forge?
Most engines force you into their way of doing things. Quantum Forge tries to stay light, transparent, and developer-friendly while still giving you modern tools (glTF, real-time preview, binary inspection, etc.).
It's perfect if you:

Like C++ but want a nice editor
Want to experiment with custom binary formats
Enjoy building tools from scratch
Want something small and hackable

Contributing
This is a solo passion project right now, but contributions are very welcome!

Report bugs
Suggest features
Submit pull requests
Help clean up dependencies
Improve documentation

Just open an Issue or PR.

Made with ❤️ by Yash
Started in 2026 — Because why not build your own engine?
Status: Early Prototype — Expect everything to change.

