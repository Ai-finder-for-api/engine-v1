import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import EngineViewport, { type AnimationClipInfo, type AnimationSystemData, type SkeletonMeta } from "./components/EngineViewport";
import IDEPanel, { type IDEWorkspaceFile } from "./components/IDEPanel";
import { exportEngineBundle } from "./lib/export-bundle";
import { createSampleGamePayload, parseGameFile, serializeGameFile, type ParsedGameFile } from "./lib/game-format";
import { getInstalledToolchain, installToolchainOnce, type InstalledToolchain } from "./lib/toolchain-store";

type ModelStats = { meshes: number; materials: number; triangles: number };
type TexturePreview = { name: string; width: number; height: number; previewUrl: string };
type AssetPanel = "textures" | "animations";
type AnimationPanelTab = "clips" | "sequence" | "skeleton";
type ProjectAsset = { id: string; name: string; file: File; kind: "glb" | "other" };
type AnimationSequenceStep = {
  id: string;
  clipName: string;
  speed: number;
  loopCount: number;
  blendSec: number;
};

const forgeReadOnlyCode = [
  {
    path: "GameProject/Source/MainGame.cpp",
    content: [
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
    path: "GameProject/Source/GameMode.h",
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
    path: "GameProject/Source/GameMode.cpp",
    content: [
      "#include \"GameMode.h\"",
      "#include <iostream>",
      "",
      "void GameMode::Run() {",
      "  std::cout << \"Running in Unreal-style read-only viewport\" << std::endl;",
      "}",
    ].join("\n"),
  },
];

function concat(first: Uint8Array, second: Uint8Array): Uint8Array {
  const out = new Uint8Array(first.byteLength + second.byteLength);
  out.set(first, 0);
  out.set(second, first.byteLength);
  return out;
}

export default function App() {
  const appMode = useMemo(() => {
    if (typeof window === "undefined") return "forge";
    const query = new URLSearchParams(window.location.search).get("app");
    return query === "smith" ? "smith" : "forge";
  }, []);
  const isQuantumSmith = appMode === "smith";

  const [toolchain, setToolchain] = useState<InstalledToolchain | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isBuildingGame, setIsBuildingGame] = useState(false);
  const [isExportingExe, setIsExportingExe] = useState(false);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [modelStats, setModelStats] = useState<ModelStats>({ meshes: 0, materials: 0, triangles: 0 });
  const [textures, setTextures] = useState<TexturePreview[]>([]);
  const [assetPanel, setAssetPanel] = useState<AssetPanel>("textures");
  const [animationPanelTab, setAnimationPanelTab] = useState<AnimationPanelTab>("clips");
  const [animations, setAnimations] = useState<AnimationClipInfo[]>([]);
  const [skeletons, setSkeletons] = useState<SkeletonMeta[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState<string | null>(null);
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(true);
  const [scrubNormalized, setScrubNormalized] = useState(0);
  const [sequence, setSequence] = useState<AnimationSequenceStep[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<IDEWorkspaceFile[]>([]);
  const [ideBundle, setIdeBundle] = useState("");
  const [loadState, setLoadState] = useState({ isLoading: false, progress: 0, message: "Idle" });
  const [artifact, setArtifact] = useState<Uint8Array | null>(null);
  const [parsed, setParsed] = useState<ParsedGameFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modelFile = useMemo(() => {
    if (!selectedAssetId) return null;
    return projectAssets.find((asset) => asset.id === selectedAssetId)?.file ?? null;
  }, [projectAssets, selectedAssetId]);

  const [readOnlyPath, setReadOnlyPath] = useState(forgeReadOnlyCode[0].path);

  useEffect(() => {
    if (!isQuantumSmith && !ideBundle) {
      const seedBundle = forgeReadOnlyCode
        .map((file) => [`// PATH:${file.path}`, file.content].join("\n"))
        .join("\n\n");
      setIdeBundle(seedBundle);
    }
  }, [ideBundle, isQuantumSmith]);

  useEffect(() => {
    void (async () => {
      const installed = await getInstalledToolchain();
      if (installed) setToolchain(installed);
    })();
  }, []);

  const installToolchain = async () => {
    setError(null);
    setIsInstalling(true);
    try {
      const installed = await installToolchainOnce();
      setToolchain(installed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Toolchain install failed");
    } finally {
      setIsInstalling(false);
    }
  };

  const buildGameArtifact = async () => {
    setError(null);
    setIsBuildingGame(true);
    try {
      const installed = toolchain ?? (await getInstalledToolchain());
      if (!installed) throw new Error("Install x64 toolchain first.");
      if (!toolchain) setToolchain(installed);

      const sample = createSampleGamePayload();
      const encoder = new TextEncoder();
      const toolchainBytes = installed.binaries.reduce((sum, item) => sum + item.bytes.byteLength, 0);
      const manifest = encoder.encode(
        `toolchain=x64;bins=${installed.binaries.length};binBytes=${toolchainBytes};model=${modelFile?.name ?? "none"}`
      );
      const script = encoder.encode(ideBundle);
      const animationStatePayload = encoder.encode(
        JSON.stringify({
          sequence,
          clips: animations,
          skeletons,
          selectedAnimation,
        })
      );

      const enriched = {
        ...sample,
        bytecode: concat(sample.bytecode, manifest),
        ecsGraph: concat(sample.ecsGraph, script),
        vfxStateMachine: concat(sample.vfxStateMachine, animationStatePayload),
      };

      const binary = await serializeGameFile(enriched, {
        bytecode: "zstd",
        ecsGraph: "lz4",
        bvhTree: "zstd",
        voxelNaniteGeometry: "lz4",
        rawAudio: "lz4",
        vfxStateMachine: "zstd",
      });
      const parsedResult = await parseGameFile(binary);
      setArtifact(binary);
      setParsed(parsedResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Build failed");
    } finally {
      setIsBuildingGame(false);
    }
  };

  const exportCmakeProject = async () => {
    if (!artifact) {
      setError("Build a .game artifact before exporting CMake project.");
      return;
    }
    setError(null);
    setIsExportingExe(true);
    try {
      const blob = await exportEngineBundle({
        gameBinary: artifact,
        ideScript: ideBundle,
        modelName: modelFile?.name ?? "embedded_scene",
        animationData: { clips: animations, skeletons, sequence },
        gameFiles: workspaceFiles,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "quantum_forge_engine_cmake_x64.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed");
    } finally {
      setIsExportingExe(false);
    }
  };

  const onStats = useCallback((stats: ModelStats) => setModelStats(stats), []);
  const onTextures = useCallback((items: TexturePreview[]) => setTextures(items), []);
  const onAnimationData = useCallback((data: AnimationSystemData) => {
    setAnimations(data.clips);
    setSkeletons(data.skeletons);
    setSelectedAnimation(data.clips[0]?.name ?? null);
    setIsAnimationPlaying(data.clips.length > 0);
    setScrubNormalized(0);
    setSequence(
      data.clips.length > 0
        ? [
            {
              id: `seq-${Date.now()}`,
              clipName: data.clips[0].name,
              speed: 1,
              loopCount: 1,
              blendSec: 0.12,
            },
          ]
        : []
    );
  }, []);
  const onBundleChange = useCallback((bundle: string) => setIdeBundle(bundle), []);
  const onLoadState = useCallback(
    (state: { isLoading: boolean; progress: number; message: string }) => setLoadState(state),
    []
  );

  const importProjectAsset = (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const kind: ProjectAsset["kind"] = lower.endsWith(".glb") || lower.endsWith(".gltf") ? "glb" : "other";
    const asset: ProjectAsset = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: file.name,
      file,
      kind,
    };
    setProjectAssets((current) => [asset, ...current]);
    if (kind === "glb") {
      setSelectedAssetId(asset.id);
    }
  };

  const deleteAsset = (assetId: string) => {
    setProjectAssets((current) => current.filter((asset) => asset.id !== assetId));
    if (selectedAssetId === assetId) {
      setSelectedAssetId(null);
      setTextures([]);
      setAnimations([]);
      setSkeletons([]);
      setModelStats({ meshes: 0, materials: 0, triangles: 0 });
    }
  };

  const status = useMemo(() => {
    if (!toolchain) return "Toolchain missing";
    if (!artifact) return "Toolchain ready";
    return "Engine artifact ready";
  }, [toolchain, artifact]);

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative overflow-hidden border-b border-zinc-900">
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-60"
          animate={{ opacity: [0.45, 0.8, 0.45] }}
          transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        >
          <div className="hero-grid absolute inset-[-30%]" />
        </motion.div>
        <div className="relative mx-auto max-w-6xl px-6 py-14 sm:px-10 lg:px-12">
          <p className="text-sm tracking-[0.24em] text-violet-300">
            {isQuantumSmith ? "QUANTUM SMITH IDE" : "QUANTUM FORGE ENGINE"}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            {isQuantumSmith
              ? "Professional C++ Workflow and Game Scripting IDE"
              : "Renderer + GLB Importer + Mini IDE + CMake Export"}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            {isQuantumSmith
              ? "A desktop-grade coding environment for regular C++ development and game scripting, with integrated animation authoring and export pipeline tooling."
              : "Install the x64 toolchain once, inspect imported model textures in real time, author runtime script blocks, build a compressed .game package, and export a CMake project that builds an executable runtime."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={installToolchain}
              disabled={isInstalling}
              className="rounded-sm border border-zinc-500 px-4 py-2 text-sm font-semibold hover:border-zinc-200 disabled:opacity-60"
            >
              {isInstalling ? "Installing..." : "Install x64 Toolchain Once"}
            </button>
            <button
              onClick={buildGameArtifact}
              disabled={!toolchain || isBuildingGame}
              className="rounded-sm bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {isBuildingGame ? "Building .game..." : "Build export.game"}
            </button>
            <button
              onClick={exportCmakeProject}
              disabled={!artifact || isExportingExe}
              className="rounded-sm border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-60"
            >
              {isExportingExe ? "Packaging..." : "Export CMake Runtime (.zip)"}
            </button>
          </div>
          <p className="mt-4 text-xs tracking-[0.16em] text-zinc-400">STATUS: {status}</p>
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        </div>
      </section>

      {!isQuantumSmith && (
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[1.4fr_1fr] lg:px-12">
        <div>
          <h2 className="text-2xl font-semibold">Renderer + Model Importer</h2>
          <p className="mt-2 text-sm text-zinc-300">Load a .glb model, render it in real time, and inspect extracted textures.</p>
          <div className="mt-4">
            <input
              type="file"
              accept=".glb,.gltf,.png,.jpg,.jpeg,.wav,.json,.cpp,.h"
              onChange={(event) => {
                importProjectAsset(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
              className="w-full border border-zinc-700 bg-zinc-900/70 p-2 text-sm"
            />
          </div>
          <div className="mt-3 border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.14em] text-zinc-400">Project Files</p>
            <div className="max-h-40 space-y-1 overflow-auto text-xs">
              {projectAssets.length === 0 && <p className="text-zinc-500">No imported files.</p>}
              {projectAssets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-2 border border-zinc-800 px-2 py-1">
                  <button
                    onClick={() => asset.kind === "glb" && setSelectedAssetId(asset.id)}
                    className={`truncate text-left ${asset.id === selectedAssetId ? "text-white" : "text-zinc-300"}`}
                    title={asset.name}
                  >
                    {asset.name}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">{asset.kind}</span>
                    <button onClick={() => deleteAsset(asset.id)} className="border border-zinc-700 px-2 py-0.5 text-zinc-300">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <EngineViewport
              key={selectedAssetId ?? "base"}
              modelFile={modelFile}
              onStats={onStats}
              onTextures={onTextures}
              onLoadState={onLoadState}
              onAnimationData={onAnimationData}
              selectedAnimation={selectedAnimation}
              isAnimationPlaying={isAnimationPlaying}
              scrubNormalized={scrubNormalized}
              sequence={sequence}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-300">
            <p>Meshes: {modelStats.meshes}</p>
            <p>Materials: {modelStats.materials}</p>
            <p>Triangles: {modelStats.triangles.toLocaleString()}</p>
            <p>Textures: {textures.length}</p>
            <p>Animations: {animations.length}</p>
            <p>Skeletons: {skeletons.length}</p>
            <p>Active Model: {modelFile?.name ?? "none"}</p>
            <p>
              Load: {loadState.isLoading ? `${Math.floor(loadState.progress)}%` : "done"} ({loadState.message})
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold">Asset Inspector</h2>
          <p className="mt-2 text-sm text-zinc-300">Texture and animation metadata extracted from GLB.</p>
          <div className="mt-4 flex gap-2 text-xs">
            <button
              onClick={() => setAssetPanel("textures")}
              className={`px-3 py-1 ${assetPanel === "textures" ? "bg-zinc-800 text-white" : "border border-zinc-700 text-zinc-300"}`}
            >
              Textures
            </button>
            <button
              onClick={() => setAssetPanel("animations")}
              className={`px-3 py-1 ${assetPanel === "animations" ? "bg-zinc-800 text-white" : "border border-zinc-700 text-zinc-300"}`}
            >
              Animations
            </button>
          </div>

          <div className="mt-3 max-h-[500px] space-y-3 overflow-auto border border-zinc-800 bg-zinc-950/60 p-3">
            {assetPanel === "textures" && textures.length === 0 && (
              <p className="text-sm text-zinc-400">No textures extracted yet.</p>
            )}
            {assetPanel === "textures" &&
              textures.map((texture) => (
                <div key={`${texture.name}-${texture.width}-${texture.height}`} className="border border-zinc-800 p-2">
                  <img src={texture.previewUrl} alt={texture.name} className="h-24 w-full object-contain" />
                  <p className="mt-2 truncate font-mono text-xs">{texture.name}</p>
                  <p className="text-xs text-zinc-400">
                    {texture.width}x{texture.height}
                  </p>
                </div>
              ))}

            {assetPanel === "animations" && animations.length === 0 && (
              <p className="text-sm text-zinc-400">No animation clips found in this GLB.</p>
            )}
            {assetPanel === "animations" && animations.length > 0 && (
              <div className="space-y-3">
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => setAnimationPanelTab("clips")}
                    className={`px-3 py-1 ${animationPanelTab === "clips" ? "bg-zinc-800 text-white" : "border border-zinc-700 text-zinc-300"}`}
                  >
                    Clips
                  </button>
                  <button
                    onClick={() => setAnimationPanelTab("sequence")}
                    className={`px-3 py-1 ${animationPanelTab === "sequence" ? "bg-zinc-800 text-white" : "border border-zinc-700 text-zinc-300"}`}
                  >
                    Sequence
                  </button>
                  <button
                    onClick={() => setAnimationPanelTab("skeleton")}
                    className={`px-3 py-1 ${animationPanelTab === "skeleton" ? "bg-zinc-800 text-white" : "border border-zinc-700 text-zinc-300"}`}
                  >
                    Skeleton
                  </button>
                </div>

                {animationPanelTab === "clips" && (
                  <>
                    <div className="space-y-2 border border-zinc-800 p-3">
                      <label className="text-xs text-zinc-400">Active Clip</label>
                      <select
                        value={selectedAnimation ?? animations[0].name}
                        onChange={(event) => {
                          setSelectedAnimation(event.target.value);
                          setScrubNormalized(0);
                        }}
                        className="w-full border border-zinc-700 bg-black px-2 py-2 text-sm"
                      >
                        {animations.map((clip) => (
                          <option key={clip.name} value={clip.name}>
                            {clip.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsAnimationPlaying((current) => !current)}
                          className="border border-zinc-700 px-3 py-1 text-xs"
                        >
                          {isAnimationPlaying ? "Pause" : "Play"}
                        </button>
                        <button
                          onClick={() => {
                            setScrubNormalized(0);
                            setIsAnimationPlaying(false);
                          }}
                          className="border border-zinc-700 px-3 py-1 text-xs"
                        >
                          Reset
                        </button>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1000}
                        value={Math.round(scrubNormalized * 1000)}
                        onChange={(event) => {
                          setIsAnimationPlaying(false);
                          setScrubNormalized(Number(event.target.value) / 1000);
                        }}
                        className="w-full"
                      />
                    </div>

                    {animations.map((clip) => (
                      <div key={clip.name} className="border border-zinc-800 p-2 text-xs">
                        <p className="font-mono text-zinc-100">{clip.name}</p>
                        <p className="mt-1 text-zinc-400">Duration: {clip.durationSec.toFixed(2)}s</p>
                        <p className="text-zinc-400">Tracks: {clip.tracks}</p>
                        <p className="text-zinc-400">Keyframes: {clip.keyframes.toLocaleString()}</p>
                        <p className="text-zinc-400">Transform Tracks: {clip.transformTracks}</p>
                        <p className="text-zinc-400">Bone Tracks: {clip.boneTracks}</p>
                        <p className="text-zinc-400">Morph Tracks: {clip.morphTracks}</p>
                        <p className="text-zinc-400">Estimated FPS: {clip.estimatedFps.toFixed(1)}</p>
                        <p className="text-zinc-400">Channels: {clip.channelKinds.join(", ")}</p>
                        <p className="text-zinc-400">Skeletal: {clip.hasSkeletalTracks ? "yes" : "no"}</p>
                      </div>
                    ))}
                  </>
                )}

                {animationPanelTab === "sequence" && (
                  <div className="space-y-2 border border-zinc-800 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-300">Animation Sequence</p>
                      <button
                        onClick={() => {
                          if (animations.length === 0) return;
                          setSequence((current) => [
                            ...current,
                            {
                              id: `seq-${Date.now()}-${current.length}`,
                              clipName: animations[0].name,
                              speed: 1,
                              loopCount: 1,
                              blendSec: 0.1,
                            },
                          ]);
                        }}
                        className="border border-zinc-700 px-2 py-1 text-xs"
                      >
                        Add Step
                      </button>
                    </div>
                    {sequence.length === 0 && <p className="text-xs text-zinc-500">No sequence steps.</p>}
                    {sequence.map((step, index) => (
                      <div key={step.id} className="space-y-2 border border-zinc-800 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <p className="text-zinc-300">Step {index + 1}</p>
                          <button
                            onClick={() => setSequence((current) => current.filter((item) => item.id !== step.id))}
                            className="border border-zinc-700 px-2 py-0.5"
                          >
                            Remove
                          </button>
                        </div>
                        <select
                          value={step.clipName}
                          onChange={(event) =>
                            setSequence((current) =>
                              current.map((item) => (item.id === step.id ? { ...item, clipName: event.target.value } : item))
                            )
                          }
                          className="w-full border border-zinc-700 bg-black px-2 py-1"
                        >
                          {animations.map((clip) => (
                            <option key={clip.name} value={clip.name}>
                              {clip.name}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="number"
                            value={step.speed}
                            min={0.1}
                            step={0.1}
                            onChange={(event) =>
                              setSequence((current) =>
                                current.map((item) =>
                                  item.id === step.id ? { ...item, speed: Number(event.target.value) || 1 } : item
                                )
                              )
                            }
                            className="border border-zinc-700 bg-black px-2 py-1"
                            title="Speed"
                          />
                          <input
                            type="number"
                            value={step.loopCount}
                            min={1}
                            step={1}
                            onChange={(event) =>
                              setSequence((current) =>
                                current.map((item) =>
                                  item.id === step.id ? { ...item, loopCount: Math.max(1, Number(event.target.value) || 1) } : item
                                )
                              )
                            }
                            className="border border-zinc-700 bg-black px-2 py-1"
                            title="Loops"
                          />
                          <input
                            type="number"
                            value={step.blendSec}
                            min={0}
                            step={0.01}
                            onChange={(event) =>
                              setSequence((current) =>
                                current.map((item) =>
                                  item.id === step.id ? { ...item, blendSec: Math.max(0, Number(event.target.value) || 0) } : item
                                )
                              )
                            }
                            className="border border-zinc-700 bg-black px-2 py-1"
                            title="Blend Sec"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {animationPanelTab === "skeleton" && (
                  <>
                    {skeletons.length === 0 && <p className="text-xs text-zinc-500">No skeleton metadata found.</p>}
                    {skeletons.map((skeleton) => (
                      <div key={`${skeleton.skeletonName}-${skeleton.boneCount}`} className="border border-zinc-800 p-2 text-xs">
                        <p className="font-mono text-zinc-100">Skeleton: {skeleton.skeletonName}</p>
                        <p className="text-zinc-400">Bones: {skeleton.boneCount}</p>
                        <p className="text-zinc-400">Root Bones: {skeleton.rootBoneCount}</p>
                        <p className="text-zinc-400">Skinned Meshes: {skeleton.skinnedMeshCount}</p>
                        <p className="text-zinc-400">Inverse Bind Matrices: {skeleton.hasInverseBindMatrices ? "yes" : "no"}</p>
                        <p className="text-zinc-400">Sample Bones: {skeleton.sampleBones.join(", ")}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 sm:px-10 lg:px-12">
        <h2 className="text-2xl font-semibold">{isQuantumSmith ? "Quantum Smith IDE" : "IDE + Binary Layout"}</h2>
        <p className="mt-2 text-sm text-zinc-300">
          {isQuantumSmith
            ? "Edit regular C++ files, manage project folders, and run animation tooling in a desktop IDE workflow."
            : "Unreal-style read-only code reference. Edit code in Quantum Smith or your external C++ IDE."}
        </p>
        <div className="mt-4">
          {isQuantumSmith ? (
            <IDEPanel
              onBundleChange={onBundleChange}
              onWorkspaceChange={setWorkspaceFiles}
              ideName={isQuantumSmith ? "Quantum Smith" : "IDE"}
              animations={animations}
              skeletons={skeletons}
              sequence={sequence}
              onSequenceChange={setSequence}
              selectedAnimation={selectedAnimation}
              onSelectedAnimationChange={(clipName: string) => {
                setSelectedAnimation(clipName);
                setScrubNormalized(0);
              }}
              isAnimationPlaying={isAnimationPlaying}
              onToggleAnimationPlay={() => setIsAnimationPlaying((current) => !current)}
              scrubNormalized={scrubNormalized}
              onScrubChange={(normalized: number) => {
                setIsAnimationPlaying(false);
                setScrubNormalized(Math.max(0, Math.min(1, normalized)));
              }}
            />
          ) : (
            <div className="border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {forgeReadOnlyCode.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => setReadOnlyPath(file.path)}
                    className={`px-3 py-1 ${readOnlyPath === file.path ? "bg-zinc-800 text-white" : "border border-zinc-700 text-zinc-300"}`}
                  >
                    {file.path.split("/").at(-1)}
                  </button>
                ))}
              </div>
              <pre className="max-h-[520px] overflow-auto bg-black p-3 font-mono text-xs text-zinc-200">
                {forgeReadOnlyCode.find((file) => file.path === readOnlyPath)?.content ?? ""}
              </pre>
            </div>
          )}
        </div>

        <div className="mt-5 overflow-x-auto border border-zinc-800 bg-zinc-950/60 p-4">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="px-2 py-2 font-medium">Section</th>
                <th className="px-2 py-2 font-medium">Compression</th>
                <th className="px-2 py-2 font-medium">Offset</th>
                <th className="px-2 py-2 font-medium">Stored</th>
                <th className="px-2 py-2 font-medium">Raw</th>
              </tr>
            </thead>
            <tbody>
              {parsed?.sections.map((section) => (
                <tr key={`${section.type}-${section.offset}`} className="border-b border-zinc-900">
                  <td className="px-2 py-2">{section.type}</td>
                  <td className="px-2 py-2">{section.compression}</td>
                  <td className="px-2 py-2">{section.offset.toLocaleString()}</td>
                  <td className="px-2 py-2">{section.storedBytes.toLocaleString()}</td>
                  <td className="px-2 py-2">{section.rawBytes.toLocaleString()}</td>
                </tr>
              ))}
              {!parsed && (
                <tr>
                  <td className="px-2 py-3 text-zinc-400" colSpan={5}>
                    Build export.game to inspect section layout.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
