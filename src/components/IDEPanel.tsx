import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AnimationClipInfo, SkeletonMeta } from "./EngineViewport";

type SequenceStep = {
  id: string;
  clipName: string;
  speed: number;
  loopCount: number;
  blendSec: number;
};

export type IDEWorkspaceFile = {
  id: string;
  path: string;
  language: "cpp" | "header" | "shader" | "json" | "qscript" | "text" | "cmake" | "markdown";
  content: string;
};

interface IDEPanelProps {
  onBundleChange: (bundle: string) => void;
  onWorkspaceChange: (files: IDEWorkspaceFile[]) => void;
  ideName?: string;
  animations: AnimationClipInfo[];
  skeletons: SkeletonMeta[];
  sequence: SequenceStep[];
  onSequenceChange: (next: SequenceStep[]) => void;
  selectedAnimation: string | null;
  onSelectedAnimationChange: (clipName: string) => void;
  isAnimationPlaying: boolean;
  onToggleAnimationPlay: () => void;
  scrubNormalized: number;
  onScrubChange: (normalized: number) => void;
}

type TreeNode = {
  name: string;
  path: string;
  type: "folder" | "file";
  children?: TreeNode[];
};

const STORAGE_KEY = "qforge.ide.workspace.v2";

const starterFiles: IDEWorkspaceFile[] = [
  {
    id: "game-main",
    path: "GameProject/Source/MainGame.cpp",
    language: "cpp",
    content: [
      "#include \"PlayerController.h\"",
      "#include \"GameMode.h\"",
      "",
      "int main() {",
      "  GameMode mode;",
      "  mode.Run();",
      "  return 0;",
      "}",
    ].join("\n"),
  },
  {
    id: "game-mode-h",
    path: "GameProject/Source/GameMode.h",
    language: "header",
    content: [
      "#pragma once",
      "",
      "class GameMode {",
      " public:",
      "  void Run();",
      "};",
    ].join("\n"),
  },
  {
    id: "game-mode-cpp",
    path: "GameProject/Source/GameMode.cpp",
    language: "cpp",
    content: [
      "#include \"GameMode.h\"",
      "#include <iostream>",
      "",
      "void GameMode::Run() {",
      "  std::cout << \"Game loop started\" << std::endl;",
      "}",
    ].join("\n"),
  },
  {
    id: "player-h",
    path: "GameProject/Source/PlayerController.h",
    language: "header",
    content: [
      "#pragma once",
      "",
      "class PlayerController {",
      " public:",
      "  void Tick(float delta_seconds);",
      "};",
    ].join("\n"),
  },
  {
    id: "scene-qs",
    path: "GameProject/Scripts/Scene.qs",
    language: "qscript",
    content: [
      "entity Player {",
      "  transform: (0, 1, 0)",
      "  script: Tick(delta) {",
      "    rotateY(0.35 * delta)",
      "  }",
      "}",
    ].join("\n"),
  },
  {
    id: "settings-json",
    path: "GameProject/Config/GameSettings.json",
    language: "json",
    content: JSON.stringify({ backend: "D3D12/Vulkan/WebGPU", shadows: true, pathTracing: false }, null, 2),
  },
];

function toBundle(files: IDEWorkspaceFile[]): string {
  return files
    .map((file) => [`// PATH:${file.path}`, file.content].join("\n"))
    .join("\n\n");
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureGameProjectPath(input: string): string {
  const normalized = input.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
  if (!normalized) return "GameProject";
  if (normalized.startsWith("GameProject/")) return normalized;
  if (normalized === "GameProject") return normalized;
  return `GameProject/${normalized}`;
}

function buildTree(files: IDEWorkspaceFile[]): TreeNode[] {
  const root: TreeNode = { name: "root", path: "", type: "folder", children: [] };

  const ensureFolder = (base: TreeNode, folderPath: string): TreeNode => {
    if (!base.children) base.children = [];
    const existing = base.children.find((node) => node.type === "folder" && node.path === folderPath);
    if (existing) return existing;
    const folder: TreeNode = {
      name: folderPath.split("/").at(-1) ?? folderPath,
      path: folderPath,
      type: "folder",
      children: [],
    };
    base.children.push(folder);
    base.children.sort((a, b) => a.name.localeCompare(b.name));
    return folder;
  };

  files.forEach((file) => {
    const parts = file.path.split("/");
    const fileName = parts.pop() ?? file.path;
    let cursor = root;
    let currentPath = "";
    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      cursor = ensureFolder(cursor, currentPath);
    });
    if (!cursor.children) cursor.children = [];
    if (fileName !== ".keep") {
      cursor.children.push({ name: fileName, path: file.path, type: "file" });
    }
  });

  const sortDeep = (node: TreeNode) => {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortDeep);
  };
  sortDeep(root);
  return root.children ?? [];
}

export default function IDEPanel({
  onBundleChange,
  onWorkspaceChange,
  ideName = "IDE",
  animations,
  skeletons,
  sequence,
  onSequenceChange,
  selectedAnimation,
  onSelectedAnimationChange,
  isAnimationPlaying,
  onToggleAnimationPlay,
  scrubNormalized,
  onScrubChange,
}: IDEPanelProps) {
  const [mainTab, setMainTab] = useState<"code" | "animation">("code");
  const [viewerScope, setViewerScope] = useState<"project" | "activeFolder" | "activeFile">("project");
  const [files, setFiles] = useState<IDEWorkspaceFile[]>(starterFiles);
  const [activePath, setActivePath] = useState(starterFiles[0].path);
  const [openTabs, setOpenTabs] = useState<string[]>([starterFiles[0].path]);
  const [search, setSearch] = useState("");
  const [replace, setReplace] = useState("");
  const [newFolderPath, setNewFolderPath] = useState("GameProject/Source");
  const [newFolderName, setNewFolderName] = useState("NewFolder");
  const [newFileName, setNewFileName] = useState("NewClass");
  const [newFileExt, setNewFileExt] = useState<"cpp" | "h" | "hpp" | "c" | "txt" | "md" | "cmake" | "json">("cpp");
  const [consoleLines, setConsoleLines] = useState<string[]>(["[IDE] VS-style workspace booted"]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [contextTarget, setContextTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveFolder, setMoveFolder] = useState("GameProject/Source");
  const [loopRange, setLoopRange] = useState({ start: 0, end: 1 });
  const [eventMarkers, setEventMarkers] = useState<Array<{ id: string; time: number; label: string }>>([
    { id: "ev-foot-l", time: 0.2, label: "FootstepL" },
    { id: "ev-foot-r", time: 0.7, label: "FootstepR" },
  ]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [bottomTab, setBottomTab] = useState<"Error List" | "Output" | "Find Results" | "Diagnostic Tools">("Error List");
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as IDEWorkspaceFile[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setFiles(parsed);
        setActivePath(parsed[0].path);
        setOpenTabs([parsed[0].path]);
      }
    } catch {
      setConsoleLines((prev) => [...prev, "[IDE] failed to restore workspace"]);
    }
  }, []);

  useEffect(() => {
    onBundleChange(toBundle(files));
    onWorkspaceChange(files);
  }, [files, onBundleChange, onWorkspaceChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setShowCommandPalette(true);
      }
      if (event.key === "Escape" && showCommandPalette) {
        setShowCommandPalette(false);
        setCommandQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCommandPalette]);

  const activeFile = useMemo(() => files.find((file) => file.path === activePath) ?? files[0], [activePath, files]);
  const targetPath = contextTarget ?? activePath;
  const visibleFiles = useMemo(() => {
    if (viewerScope === "project") {
      return files.filter((file) => file.path.startsWith("GameProject/"));
    }
    if (viewerScope === "activeFolder") {
      const parts = activeFile.path.split("/");
      parts.pop();
      const folder = parts.join("/");
      return files.filter((file) => file.path.startsWith(`${folder}/`));
    }
    return files.filter((file) => file.path === activeFile.path);
  }, [activeFile.path, files, viewerScope]);
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);
  const folderOptions = useMemo(() => {
    const set = new Set<string>(["GameProject", "GameProject/Source", "GameProject/Scripts", "GameProject/Config"]);
    files.forEach((file) => {
      const parts = file.path.split("/");
      parts.pop();
      if (parts.length > 0) {
        set.add(parts.join("/"));
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const lineCount = useMemo(() => activeFile.content.split("\n").length, [activeFile.content]);

  const updateActiveContent = (content: string) => {
    setFiles((prev) => prev.map((file) => (file.path === activeFile.path ? { ...file, content } : file)));
  };

  const symbolOutline = useMemo(() => {
    const lines = activeFile.content.split("\n");
    const symbols: Array<{ name: string; line: number }> = [];
    lines.forEach((line, index) => {
      const classMatch = line.match(/\b(class|struct)\s+([A-Za-z_]\w*)/);
      if (classMatch) {
        symbols.push({ name: `${classMatch[1]} ${classMatch[2]}`, line: index + 1 });
        return;
      }
      const fnMatch = line.match(/\b([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/);
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], line: index + 1 });
      }
    });
    return symbols;
  }, [activeFile.content]);

  const saveWorkspace = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    setConsoleLines((prev) => [...prev, `[IDE] saved ${files.length} game files`]);
  };

  const formatCurrent = () => {
    const lines = activeFile.content.split("\n");
    const formatted = lines.map((line) => line.replace(/\t/g, "  ")).join("\n");
    updateActiveContent(formatted);
  };

  const runDiagnostics = () => {
    const text = activeFile.content;
    const issues: string[] = [];
    const open = (text.match(/\{/g) ?? []).length;
    const close = (text.match(/\}/g) ?? []).length;
    if (open !== close) issues.push(`Brace mismatch in ${activeFile.path}`);
    if (activeFile.language === "header" && !text.includes("#pragma once")) {
      issues.push("Header missing #pragma once");
    }
    if (issues.length === 0) issues.push("No issues found");
    setDiagnostics(issues);
  };

  const findNext = () => {
    if (!editorRef.current || !search) return;
    const start = editorRef.current.selectionEnd;
    const index = activeFile.content.indexOf(search, start);
    if (index < 0) return;
    editorRef.current.focus();
    editorRef.current.selectionStart = index;
    editorRef.current.selectionEnd = index + search.length;
  };

  const replaceAll = () => {
    if (!search) return;
    updateActiveContent(activeFile.content.replace(new RegExp(escapeRegex(search), "g"), replace));
  };

  useEffect(() => {
    setContextTarget(activePath);
    setRenameValue(activePath.split("/").at(-1) ?? "");
  }, [activePath]);

  const createGameFolder = () => {
    const folderBase = ensureGameProjectPath(newFolderPath);
    const folderLeaf = newFolderName.trim().replace(/\\/g, "/").replace(/\/+/g, "").replace(/^\./, "");
    if (!folderLeaf) {
      setConsoleLines((prev) => [...prev, "[IDE] folder name is required"]);
      return;
    }
    let candidateLeaf = folderLeaf;
    let normalized = `${folderBase}/${candidateLeaf}`;
    let marker = `${normalized}/.keep`;
    let counter = 1;
    while (files.some((file) => file.path === marker)) {
      candidateLeaf = `${folderLeaf}_${counter}`;
      normalized = `${folderBase}/${candidateLeaf}`;
      marker = `${normalized}/.keep`;
      counter += 1;
    }
    setFiles((prev) => [
      ...prev,
      { id: `keep-${Date.now()}`, path: marker, language: "json", content: "{}" },
    ]);
    setViewerScope("project");
    setMoveFolder(normalized);
    setNewFolderName(candidateLeaf);
    setConsoleLines((prev) => [...prev, `[IDE] folder created ${normalized}`]);
  };

  const createGameFile = () => {
    const safeName = newFileName.trim();
    if (!safeName) return;
    const normalizedFolder = ensureGameProjectPath(newFolderPath);
    const fullPath = `${normalizedFolder}/${safeName}.${newFileExt}`;
    if (files.some((file) => file.path === fullPath)) return;

    const language: IDEWorkspaceFile["language"] =
      newFileExt === "cpp"
        ? "cpp"
        : newFileExt === "h" || newFileExt === "hpp"
          ? "header"
          : newFileExt === "cmake"
            ? "cmake"
            : newFileExt === "md"
              ? "markdown"
              : newFileExt === "json"
                ? "json"
                : "text";
    const contentByExt: Record<string, string> = {
      cpp: [`#include \"${safeName}.h\"`, "", `void ${safeName}Update(float delta_seconds) {`, "}", ""].join("\n"),
      c: [`#include <stdio.h>`, "", `void ${safeName}_update(float delta_seconds) {`, "}", ""].join("\n"),
      h: ["#pragma once", "", `void ${safeName}Update(float delta_seconds);`, ""].join("\n"),
      hpp: ["#pragma once", "", `void ${safeName}Update(float delta_seconds);`, ""].join("\n"),
      cmake: ["cmake_minimum_required(VERSION 3.24)", `project(${safeName} LANGUAGES CXX)`, ""].join("\n"),
      json: JSON.stringify({ name: safeName, enabled: true }, null, 2),
      md: [`# ${safeName}`, "", "Project notes."].join("\n"),
      txt: `${safeName} notes`,
    };
    const content = contentByExt[newFileExt] ?? "";

    setFiles((prev) => [...prev, { id: `file-${Date.now()}`, path: fullPath, language, content }]);
    setOpenTabs((prev) => (prev.includes(fullPath) ? prev : [...prev, fullPath]));
    setActivePath(fullPath);
    setViewerScope("project");
    setMoveFolder(normalizedFolder);
    setConsoleLines((prev) => [...prev, `[IDE] file added ${fullPath}`]);
  };

  const openFile = (path: string) => {
    setActivePath(path);
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
  };

  const deleteTarget = () => {
    if (!targetPath) return;
    if (targetPath.endsWith("/.keep")) {
      setFiles((prev) => prev.filter((file) => file.path !== targetPath));
    } else {
      setFiles((prev) => prev.filter((file) => file.path !== targetPath));
      setOpenTabs((prev) => prev.filter((tab) => tab !== targetPath));
      if (activePath === targetPath && files.length > 1) {
        const fallback = files.find((file) => file.path !== targetPath);
        if (fallback) setActivePath(fallback.path);
      }
    }
  };

  const duplicateTarget = () => {
    if (!targetPath) return;
    const target = files.find((file) => file.path === targetPath);
    if (!target) return;
    const dot = target.path.lastIndexOf(".");
    const stem = dot > 0 ? target.path.slice(0, dot) : target.path;
    const ext = dot > 0 ? target.path.slice(dot) : "";
    const nextPath = `${stem}_Copy${ext}`;
    if (files.some((file) => file.path === nextPath)) return;
    setFiles((prev) => [...prev, { ...target, id: `dup-${Date.now()}`, path: nextPath }]);
  };

  const renameTarget = () => {
    if (!targetPath || !renameValue.trim()) return;
    const currentName = targetPath.split("/").at(-1) ?? targetPath;
    const renamed = targetPath.replace(currentName, renameValue.trim());
    setFiles((prev) => prev.map((file) => (file.path === targetPath ? { ...file, path: renamed } : file)));
    setOpenTabs((prev) => prev.map((tab) => (tab === targetPath ? renamed : tab)));
    if (activePath === targetPath) setActivePath(renamed);
    setContextTarget(renamed);
  };

  const moveTarget = () => {
    if (!targetPath || !moveFolder.trim()) return;
    const name = targetPath.split("/").at(-1) ?? targetPath;
    const folder = ensureGameProjectPath(moveFolder);
    const nextPath = `${folder}/${name}`;
    setFiles((prev) => prev.map((file) => (file.path === targetPath ? { ...file, path: nextPath } : file)));
    setOpenTabs((prev) => prev.map((tab) => (tab === targetPath ? nextPath : tab)));
    if (activePath === targetPath) setActivePath(nextPath);
    setContextTarget(nextPath);
    setMoveFolder(folder);
  };

  const closeTab = (path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((item) => item !== path);
      if (activePath === path && next.length > 0) {
        setActivePath(next[next.length - 1]);
      }
      return next.length > 0 ? next : [activePath];
    });
  };

  const renderTree = (nodes: TreeNode[], depth: number): ReactNode[] => {
    return nodes.flatMap((node) => {
      if (node.type === "folder") {
        return [
          <div key={node.path} className="truncate px-2 py-1 text-xs text-zinc-400" style={{ paddingLeft: `${8 + depth * 14}px` }}>
            {node.name}
          </div>,
          ...(node.children ? renderTree(node.children, depth + 1) : []),
        ];
      }
      return [
        <button
          key={node.path}
          onClick={() => openFile(node.path)}
          className={`block w-full truncate py-1 text-left text-xs ${
            node.path === activePath ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-900"
          }`}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
        >
          {node.name}
        </button>,
      ];
    });
  };

  return (
    <div className="border border-zinc-800 bg-[#1e1e1e] text-zinc-100">
      <div className="border-b border-zinc-700 bg-[#3c3c3c] px-3 py-1 text-xs text-zinc-100">
        Quantum Smith 2026 Professional - [Main.cpp]
      </div>
      <div className="border-b border-zinc-800 bg-[#2d2d30] px-3 py-1 text-xs text-zinc-300">
        File Edit View Git Project Build Debug Test Tools Window Help
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-[#252526] px-3 py-2 text-xs">
        <span className="font-semibold tracking-[0.14em] text-violet-200">{ideName} Professional</span>
        <button className="border border-zinc-700 px-2 py-1">New File</button>
        <button className="border border-zinc-700 px-2 py-1">Open</button>
        <button onClick={saveWorkspace} className="border border-zinc-700 px-2 py-1">Save All</button>
        <button className="border border-zinc-700 px-2 py-1">Undo</button>
        <button className="border border-zinc-700 px-2 py-1">Redo</button>
        <select className="border border-zinc-700 bg-black px-2 py-1">
          <option>Debug | x64</option>
          <option>Release | x64</option>
        </select>
        <button className="rounded-sm border border-emerald-600 bg-emerald-700 px-3 py-1 font-semibold text-white">
          Start Debugging
        </button>
        <select className="border border-zinc-700 bg-black px-2 py-1">
          <option>QuantumSmithEngine</option>
          <option>QuantumSmithTools</option>
        </select>
        <button onClick={() => setMainTab("code")} className={`px-2 py-1 ${mainTab === "code" ? "bg-zinc-700" : "border border-zinc-700"}`}>
          Code
        </button>
        <button onClick={() => setMainTab("animation")} className={`px-2 py-1 ${mainTab === "animation" ? "bg-zinc-700" : "border border-zinc-700"}`}>
          Animation
        </button>
        <button onClick={() => setShowCommandPalette(true)} className="ml-auto border border-zinc-700 px-2 py-1">
          Command Palette
        </button>
      </div>

      {mainTab === "code" && (
        <div className="grid min-h-[720px] grid-cols-[260px_1fr_260px]">
          <aside className="border-r border-zinc-800 bg-[#252526] p-2">
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-zinc-400">Solution Explorer</p>
            <select
              value={viewerScope}
              onChange={(event) => setViewerScope(event.target.value as "project" | "activeFolder" | "activeFile")}
              className="mb-2 w-full border border-zinc-700 bg-black px-2 py-1 text-xs"
            >
              <option value="project">View: Project Folder</option>
              <option value="activeFolder">View: Active Script Folder</option>
              <option value="activeFile">View: Selected Script Only</option>
            </select>
            <div className="mb-2 space-y-1 border border-zinc-800 p-2 text-xs">
              <input
                value={newFolderPath}
                onChange={(event) => setNewFolderPath(event.target.value)}
                className="w-full border border-zinc-700 bg-black px-2 py-1"
                placeholder="Parent folder (e.g. GameProject/Source)"
              />
              <input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                className="w-full border border-zinc-700 bg-black px-2 py-1"
                placeholder="New folder name"
              />
              <div className="flex gap-1">
                <input
                  value={newFileName}
                  onChange={(event) => setNewFileName(event.target.value)}
                  className="w-full border border-zinc-700 bg-black px-2 py-1"
                  placeholder="File name"
                />
                <select
                  value={newFileExt}
                  onChange={(event) =>
                    setNewFileExt(event.target.value as "cpp" | "h" | "hpp" | "c" | "txt" | "md" | "cmake" | "json")
                  }
                  className="border border-zinc-700 bg-black px-2 py-1"
                >
                  <option value="cpp">.cpp</option>
                  <option value="h">.h</option>
                  <option value="hpp">.hpp</option>
                  <option value="c">.c</option>
                  <option value="cmake">.cmake</option>
                  <option value="json">.json</option>
                  <option value="md">.md</option>
                  <option value="txt">.txt</option>
                </select>
              </div>
              <div className="flex gap-1">
                <button onClick={createGameFolder} className="border border-zinc-700 px-2 py-1">Add Folder</button>
                <button onClick={createGameFile} className="border border-zinc-700 px-2 py-1">Add File</button>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto border border-zinc-800 bg-[#1f1f1f] p-1">{renderTree(tree, 0)}</div>
          </aside>

          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-1 border-b border-zinc-800 bg-[#2d2d30] px-2 py-1 text-xs">
              {openTabs.map((path) => {
                const title = path.split("/").at(-1) ?? path;
                return (
                  <div key={path} className={`flex items-center gap-2 px-2 py-1 ${activePath === path ? "bg-[#1e1e1e]" : "bg-[#333337]"}`}>
                    <button onClick={() => openFile(path)}>{title}</button>
                    <button onClick={() => closeTab(path)} className="text-zinc-400 hover:text-zinc-200">x</button>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-2 py-2 text-xs">
              <button onClick={saveWorkspace} className="border border-zinc-700 px-2 py-1">Save All</button>
              <button onClick={formatCurrent} className="border border-zinc-700 px-2 py-1">Format</button>
              <button onClick={runDiagnostics} className="border border-zinc-700 px-2 py-1">Analyze</button>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find" className="border border-zinc-700 bg-black px-2 py-1" />
              <input value={replace} onChange={(event) => setReplace(event.target.value)} placeholder="Replace" className="border border-zinc-700 bg-black px-2 py-1" />
              <button onClick={findNext} className="border border-zinc-700 px-2 py-1">Find Next</button>
              <button onClick={replaceAll} className="border border-zinc-700 px-2 py-1">Replace All</button>
              <span className="ml-auto text-zinc-400">{activeFile.path}</span>
            </div>

            <div className="relative grid min-h-0 flex-1 grid-cols-[72px_1fr]">
              <div className="overflow-hidden border-r border-zinc-800 bg-[#252526] p-1 font-mono text-xs leading-6 text-zinc-500">
                {Array.from({ length: lineCount }, (_, index) => {
                  const line = index + 1;
                  return (
                    <div key={line} className="relative pr-2 text-right">
                      {line === 24 && <span className="absolute left-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
                      {line >= 19 && line <= 28 && <span className="absolute left-4 top-0 h-6 w-[2px] bg-yellow-400/80" />}
                      {line}
                    </div>
                  );
                })}
              </div>
              <textarea
                ref={editorRef}
                value={activeFile.content}
                onChange={(event) => updateActiveContent(event.target.value)}
                onSelect={(event) => {
                  const upto = event.currentTarget.value.slice(0, event.currentTarget.selectionStart);
                  const lines = upto.split("\n");
                  setCursor({ line: lines.length, column: lines[lines.length - 1].length + 1 });
                }}
                spellCheck={false}
                className="h-full min-h-[360px] w-full resize-none bg-[#1e1e1e] p-2 font-mono text-sm leading-6 text-zinc-100 outline-none"
              />
              <div className="pointer-events-none absolute right-8 top-36 border border-zinc-700 bg-[#2a2a2c] px-2 py-1 font-mono text-xs text-zinc-200 shadow-lg">
                struct QuantumState | size: 64 bytes
              </div>
            </div>

            <div className="border-t border-zinc-800 bg-[#252526]">
              <div className="flex gap-2 border-b border-zinc-800 px-2 py-1 text-xs">
                {(["Error List", "Output", "Find Results", "Diagnostic Tools"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setBottomTab(tab)}
                    className={`px-2 py-1 ${bottomTab === tab ? "bg-zinc-700 text-white" : "text-zinc-300"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {bottomTab === "Error List" && (
                <div className="p-2 text-xs">
                  <p className="mb-2 text-zinc-300">0 Errors | 2 Warnings | 0 Messages</p>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-700 text-zinc-400">
                        <th className="px-2 py-1">Severity</th>
                        <th className="px-2 py-1">Code</th>
                        <th className="px-2 py-1">Description</th>
                        <th className="px-2 py-1">Project</th>
                        <th className="px-2 py-1">File</th>
                        <th className="px-2 py-1">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-zinc-800">
                        <td className="px-2 py-1">Warning</td>
                        <td className="px-2 py-1">C4834</td>
                        <td className="px-2 py-1">discarded return value from [[nodiscard]] function</td>
                        <td className="px-2 py-1">QuantumSmithEngine</td>
                        <td className="px-2 py-1">Main.cpp</td>
                        <td className="px-2 py-1">18</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1">Warning</td>
                        <td className="px-2 py-1">C26495</td>
                        <td className="px-2 py-1">member variable is uninitialized</td>
                        <td className="px-2 py-1">QuantumSmithEngine</td>
                        <td className="px-2 py-1">QuantumCore.cpp</td>
                        <td className="px-2 py-1">31</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {bottomTab === "Output" && (
                <div className="max-h-32 overflow-auto p-2 text-xs text-zinc-300">
                  <p className="mb-1 text-zinc-400">Diagnostics: {diagnostics.length}</p>
                  {consoleLines.slice(-8).map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>
              )}
              {bottomTab === "Find Results" && (
                <div className="max-h-32 overflow-auto p-2 text-xs text-zinc-300">
                  <p>{search ? `Searching for '${search}' in ${activeFile.path}` : "No active search query."}</p>
                </div>
              )}
              {bottomTab === "Diagnostic Tools" && (
                <div className="p-2 text-xs text-zinc-300">
                  <p className="mb-2">CPU / Memory Usage</p>
                  <div className="flex h-16 items-end gap-1">
                    {[12, 25, 18, 30, 40, 32, 45, 38, 42, 28, 36, 34].map((value, index) => (
                      <div key={index} className="w-3 bg-violet-500/70" style={{ height: `${value}%` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="border-l border-zinc-800 bg-[#252526] p-2 text-xs">
            <div className="space-y-2 border border-zinc-800 p-2">
              <p className="uppercase tracking-[0.15em] text-zinc-400">Class View</p>
              <div className="space-y-1 text-zinc-300">
                <p>QuantumCore</p>
                <p className="pl-3 text-zinc-400">Initialize()</p>
                <p className="pl-3 text-zinc-400">UpdateFrame()</p>
                <p>MainGame</p>
                <p className="pl-3 text-zinc-400">Run()</p>
              </div>
            </div>

            <div className="mt-3 space-y-2 border border-zinc-800 p-2">
              <p className="uppercase tracking-[0.15em] text-zinc-400">Properties</p>
              <p>Configuration: Debug</p>
              <p>Platform: x64</p>
              <p>Optimization: Disabled</p>
              <p>File: {activeFile.path.split("/").at(-1)}</p>
              <p>Language: {activeFile.language}</p>
              <p>Cursor: Ln {cursor.line}, Col {cursor.column}</p>
            </div>

            <p className="mb-2 mt-4 uppercase tracking-[0.15em] text-zinc-400">Symbols</p>
            <div className="max-h-28 space-y-1 overflow-auto border border-zinc-800 p-2">
              {symbolOutline.length === 0 && <p className="text-zinc-500">No symbols</p>}
              {symbolOutline.map((symbol) => (
                <button
                  key={`${symbol.name}-${symbol.line}`}
                  onClick={() => {
                    if (!editorRef.current) return;
                    const lines = activeFile.content.split("\n");
                    const offset = lines.slice(0, symbol.line - 1).join("\n").length + (symbol.line > 1 ? 1 : 0);
                    editorRef.current.focus();
                    editorRef.current.selectionStart = offset;
                    editorRef.current.selectionEnd = offset;
                  }}
                  className="block w-full truncate border border-zinc-800 px-1 py-1 text-left hover:border-zinc-600"
                >
                  {symbol.name} : {symbol.line}
                </button>
              ))}
            </div>

            <p className="mb-2 mt-4 uppercase tracking-[0.15em] text-zinc-400">File Ops</p>
            <div className="space-y-2 border border-zinc-800 p-2">
              <select
                value={targetPath}
                onChange={(event) => {
                  setContextTarget(event.target.value);
                  setRenameValue(event.target.value.split("/").at(-1) ?? "");
                }}
                className="w-full border border-zinc-700 bg-black px-2 py-1"
              >
                {visibleFiles.map((file) => (
                  <option key={file.path} value={file.path}>
                    {file.path}
                  </option>
                ))}
              </select>
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder="Rename"
                className="w-full border border-zinc-700 bg-black px-2 py-1"
              />
              <div className="flex gap-1">
                <button onClick={renameTarget} className="border border-zinc-700 px-2 py-1">Rename</button>
                <button onClick={duplicateTarget} className="border border-zinc-700 px-2 py-1">Duplicate</button>
                <button onClick={deleteTarget} className="border border-zinc-700 px-2 py-1">Delete</button>
              </div>
              <select
                value={moveFolder}
                onChange={(event) => setMoveFolder(event.target.value)}
                className="w-full border border-zinc-700 bg-black px-2 py-1"
              >
                {folderOptions.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
              <button onClick={moveTarget} className="w-full border border-zinc-700 px-2 py-1">Move</button>
            </div>
          </aside>
        </div>
      )}

      {mainTab === "animation" && (
        <div className="grid gap-3 p-3 text-xs md:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="space-y-2 border border-zinc-800 p-3">
              <p className="text-zinc-400">Playback</p>
              <select
                value={selectedAnimation ?? animations[0]?.name ?? ""}
                onChange={(event) => onSelectedAnimationChange(event.target.value)}
                className="w-full border border-zinc-700 bg-black px-2 py-1"
              >
                {animations.map((clip) => (
                  <option key={clip.name} value={clip.name}>{clip.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={onToggleAnimationPlay} className="border border-zinc-700 px-2 py-1">
                  {isAnimationPlaying ? "Pause" : "Play"}
                </button>
                <button onClick={() => onScrubChange(0)} className="border border-zinc-700 px-2 py-1">Reset</button>
              </div>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(scrubNormalized * 1000)}
                onChange={(event) => onScrubChange(Number(event.target.value) / 1000)}
                className="w-full"
              />
              <div className="space-y-1 text-[11px] text-zinc-400">
                <p>Loop Region</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={loopRange.start}
                    onChange={(event) => setLoopRange((current) => ({ ...current, start: Math.max(0, Math.min(1, Number(event.target.value) || 0)) }))}
                    className="border border-zinc-700 bg-black px-2 py-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={loopRange.end}
                    onChange={(event) => setLoopRange((current) => ({ ...current, end: Math.max(0, Math.min(1, Number(event.target.value) || 1)) }))}
                    className="border border-zinc-700 bg-black px-2 py-1"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 border border-zinc-800 p-3">
              <div className="flex items-center justify-between">
                <p className="text-zinc-400">Sequence</p>
                <button
                  onClick={() => {
                    if (animations.length === 0) return;
                    onSequenceChange([
                      ...sequence,
                      {
                        id: `seq-${Date.now()}-${sequence.length}`,
                        clipName: animations[0].name,
                        speed: 1,
                        loopCount: 1,
                        blendSec: 0.1,
                      },
                    ]);
                  }}
                  className="border border-zinc-700 px-2 py-1"
                >
                  Add Step
                </button>
              </div>
              {sequence.map((step) => (
                <div key={step.id} className="space-y-2 border border-zinc-800 p-2">
                  <select
                    value={step.clipName}
                    onChange={(event) =>
                      onSequenceChange(sequence.map((item) => (item.id === step.id ? { ...item, clipName: event.target.value } : item)))
                    }
                    className="w-full border border-zinc-700 bg-black px-2 py-1"
                  >
                    {animations.map((clip) => (
                      <option key={clip.name} value={clip.name}>{clip.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={step.speed}
                      onChange={(event) =>
                        onSequenceChange(sequence.map((item) => (item.id === step.id ? { ...item, speed: Number(event.target.value) || 1 } : item)))
                      }
                      className="border border-zinc-700 bg-black px-2 py-1"
                    />
                    <input
                      type="number"
                      value={step.loopCount}
                      onChange={(event) =>
                        onSequenceChange(
                          sequence.map((item) =>
                            item.id === step.id ? { ...item, loopCount: Math.max(1, Number(event.target.value) || 1) } : item
                          )
                        )
                      }
                      className="border border-zinc-700 bg-black px-2 py-1"
                    />
                    <input
                      type="number"
                      value={step.blendSec}
                      onChange={(event) =>
                        onSequenceChange(
                          sequence.map((item) =>
                            item.id === step.id ? { ...item, blendSec: Math.max(0, Number(event.target.value) || 0) } : item
                          )
                        )
                      }
                      className="border border-zinc-700 bg-black px-2 py-1"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500">Crossfade preview uses Blend Sec between this and next step.</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 border border-zinc-800 p-3">
              <div className="flex items-center justify-between">
                <p className="text-zinc-400">Event Markers</p>
                <button
                  onClick={() =>
                    setEventMarkers((current) => [
                      ...current,
                      { id: `ev-${Date.now()}`, time: Number(scrubNormalized.toFixed(2)), label: "Event" },
                    ])
                  }
                  className="border border-zinc-700 px-2 py-1"
                >
                  Add Marker @ Scrub
                </button>
              </div>
              {eventMarkers.map((marker) => (
                <div key={marker.id} className="grid grid-cols-[1fr_70px_22px] gap-2">
                  <input
                    value={marker.label}
                    onChange={(event) =>
                      setEventMarkers((current) =>
                        current.map((item) => (item.id === marker.id ? { ...item, label: event.target.value } : item))
                      )
                    }
                    className="border border-zinc-700 bg-black px-2 py-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={marker.time}
                    onChange={(event) =>
                      setEventMarkers((current) =>
                        current.map((item) =>
                          item.id === marker.id ? { ...item, time: Math.max(0, Math.min(1, Number(event.target.value) || 0)) } : item
                        )
                      )
                    }
                    className="border border-zinc-700 bg-black px-2 py-1"
                  />
                  <button
                    onClick={() => setEventMarkers((current) => current.filter((item) => item.id !== marker.id))}
                    className="border border-zinc-700"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2 border border-zinc-800 p-3">
              <p className="text-zinc-400">Clips</p>
              {animations.map((clip) => (
                <div key={clip.name} className="border border-zinc-800 p-2">
                  <p className="font-mono text-zinc-100">{clip.name}</p>
                  <p>Dur: {clip.durationSec.toFixed(2)}s | Tracks: {clip.tracks} | Keys: {clip.keyframes}</p>
                  <p>Bone: {clip.boneTracks} | Morph: {clip.morphTracks} | FPS: {clip.estimatedFps.toFixed(1)}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 border border-zinc-800 p-3">
              <p className="text-zinc-400">Skeletons</p>
              {skeletons.map((skeleton) => (
                <div key={`${skeleton.skeletonName}-${skeleton.boneCount}`} className="border border-zinc-800 p-2">
                  <p className="font-mono text-zinc-100">{skeleton.skeletonName}</p>
                  <p>Bones: {skeleton.boneCount} | Roots: {skeleton.rootBoneCount}</p>
                  <p>Skinned Meshes: {skeleton.skinnedMeshCount}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCommandPalette && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-24">
          <div className="w-[680px] border border-zinc-700 bg-[#1f1f21] p-3 shadow-2xl">
            <input
              autoFocus
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              placeholder="Type a command (Save All, Analyze, Add File, Add Folder, Toggle Animation Tab)"
              className="w-full border border-zinc-600 bg-black px-3 py-2 text-sm"
            />
            <div className="mt-2 space-y-1 text-xs">
              {[
                "Save All",
                "Analyze Active File",
                "Add File",
                "Add Folder",
                "Toggle Animation Tab",
                "Format Active File",
              ]
                .filter((item) => item.toLowerCase().includes(commandQuery.toLowerCase()))
                .map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      if (item === "Save All") saveWorkspace();
                      if (item === "Analyze Active File") runDiagnostics();
                      if (item === "Add File") createGameFile();
                      if (item === "Add Folder") createGameFolder();
                      if (item === "Toggle Animation Tab") setMainTab((tab) => (tab === "code" ? "animation" : "code"));
                      if (item === "Format Active File") formatCurrent();
                      setShowCommandPalette(false);
                      setCommandQuery("");
                    }}
                    className="block w-full border border-zinc-800 px-2 py-2 text-left hover:border-zinc-600"
                  >
                    {item}
                  </button>
                ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  setShowCommandPalette(false);
                  setCommandQuery("");
                }}
                className="border border-zinc-700 px-3 py-1 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
