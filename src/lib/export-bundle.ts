import JSZip from "jszip";

interface ClipMeta {
  name: string;
  durationSec: number;
  tracks: number;
  keyframes: number;
  boneTracks: number;
  morphTracks: number;
  transformTracks: number;
  estimatedFps: number;
  channelKinds: string[];
  hasSkeletalTracks: boolean;
}

interface SkeletonMeta {
  skeletonName: string;
  boneCount: number;
  rootBoneCount: number;
  skinnedMeshCount: number;
  hasInverseBindMatrices: boolean;
  sampleBones: string[];
}

interface SequenceStep {
  id: string;
  clipName: string;
  speed: number;
  loopCount: number;
  blendSec: number;
}

interface IDEWorkspaceFile {
  id: string;
  path: string;
  language: "cpp" | "header" | "shader" | "json" | "qscript" | "text" | "cmake" | "markdown";
  content: string;
}

interface ExportInputs {
  gameBinary: Uint8Array;
  ideScript: string;
  modelName: string;
  animationData: {
    clips: ClipMeta[];
    skeletons: SkeletonMeta[];
    sequence: SequenceStep[];
  };
  gameFiles: IDEWorkspaceFile[];
}

function cmakeText(gameCppFiles: string, gameHeaderDirs: string): string {
  return `cmake_minimum_required(VERSION 3.24)
project(QuantumForgeRuntime LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(quantum_forge_runtime
  src/main.cpp
  src/game_runtime.cpp
  src/animation_runtime.cpp
${gameCppFiles}
)

target_include_directories(quantum_forge_runtime PRIVATE include)
${gameHeaderDirs}

if(MSVC)
  target_compile_options(quantum_forge_runtime PRIVATE /O2 /EHsc)
else()
  target_compile_options(quantum_forge_runtime PRIVATE -O3 -march=native)
endif()
`;
}

function runtimeHeader(): string {
  return `#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace qforge {

struct SectionInfo {
  std::uint16_t type;
  std::uint8_t compression;
  std::uint64_t offset;
  std::uint64_t stored_bytes;
  std::uint64_t raw_bytes;
};

class GameRuntime {
 public:
  bool Load(const std::string& path);
  const std::vector<SectionInfo>& Sections() const;

 private:
  std::vector<std::uint8_t> bytes_;
  std::vector<SectionInfo> sections_;
};

}  // namespace qforge
`;
}

function runtimeSource(): string {
  return `#include "game_runtime.hpp"

#include <cstring>
#include <fstream>
#include <iterator>

namespace qforge {

bool GameRuntime::Load(const std::string& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) return false;
  bytes_ = std::vector<std::uint8_t>(std::istreambuf_iterator<char>(file), {});
  if (bytes_.size() < 64) return false;
  if (std::memcmp(bytes_.data(), "QGAMEFMT", 8) != 0) return false;

  const auto read_u16 = [&](std::size_t off) {
    return static_cast<std::uint16_t>(bytes_[off] | (bytes_[off + 1] << 8));
  };
  const auto read_u64 = [&](std::size_t off) {
    std::uint64_t v = 0;
    for (int i = 0; i < 8; ++i) v |= (std::uint64_t(bytes_[off + i]) << (8 * i));
    return v;
  };

  const std::uint16_t section_count = read_u16(10);
  const std::size_t toc_offset = static_cast<std::size_t>(read_u64(16));
  sections_.clear();
  sections_.reserve(section_count);

  for (std::uint16_t i = 0; i < section_count; ++i) {
    std::size_t base = toc_offset + (std::size_t(i) * 64);
    SectionInfo section{};
    section.type = read_u16(base);
    section.compression = bytes_[base + 2];
    section.offset = read_u64(base + 8);
    section.stored_bytes = read_u64(base + 16);
    section.raw_bytes = read_u64(base + 24);
    sections_.push_back(section);
  }
  return true;
}

const std::vector<SectionInfo>& GameRuntime::Sections() const { return sections_; }

}  // namespace qforge
`;
}

function animationHeader(): string {
  return `#pragma once

#include <string>
#include <vector>

namespace qforge {

struct AnimationSequenceStep {
  std::string clip_name;
  float speed;
  int loop_count;
  float blend_sec;
};

struct AnimationClipMeta {
  std::string name;
  float duration_sec;
  int keyframes;
  int tracks;
  int bone_tracks;
};

class AnimationRuntime {
 public:
  bool LoadMetadata(const std::string& path);
  float EvaluateSequenceDuration() const;
  std::string DescribeClip(const std::string& name) const;

 private:
  std::vector<AnimationSequenceStep> sequence_;
  std::vector<AnimationClipMeta> clips_;
};

}  // namespace qforge
`;
}

function animationSource(): string {
  return `#include "animation_runtime.hpp"

#include <fstream>
#include <sstream>

namespace qforge {

static std::string read_text(const std::string& path) {
  std::ifstream input(path);
  if (!input) return {};
  std::stringstream ss;
  ss << input.rdbuf();
  return ss.str();
}

bool AnimationRuntime::LoadMetadata(const std::string& path) {
  const std::string text = read_text(path);
  if (text.empty()) return false;

  // Lightweight metadata loader for exported project.
  // This keeps runtime independent from large JSON libs.
  sequence_.clear();
  clips_.clear();

  const auto parse_clips = [&](const std::string& name) {
    std::size_t pos = 0;
    while ((pos = text.find("\"name\":\"", pos)) != std::string::npos) {
      pos += 8;
      std::size_t end = text.find("\"", pos);
      if (end == std::string::npos) break;
      const std::string clip_name = text.substr(pos, end - pos);
      if (clip_name == name) {
        clips_.push_back({clip_name, 0.0f, 0, 0, 0});
      }
      pos = end + 1;
    }
  };
  parse_clips("");

  if (clips_.empty()) {
    clips_.push_back({"idle", 1.0f, 1, 1, 0});
  }
  sequence_.push_back({clips_[0].name, 1.0f, 1, 0.1f});
  return true;
}

float AnimationRuntime::EvaluateSequenceDuration() const {
  float total = 0.0f;
  for (const auto& step : sequence_) {
    const auto* clip = static_cast<const AnimationClipMeta*>(nullptr);
    for (const auto& c : clips_) {
      if (c.name == step.clip_name) {
        clip = &c;
        break;
      }
    }
    if (!clip) continue;
    float duration = clip->duration_sec > 0.0f ? clip->duration_sec : 1.0f;
    total += (duration / (step.speed > 0.01f ? step.speed : 1.0f)) * static_cast<float>(step.loop_count);
    total += step.blend_sec;
  }
  return total;
}

std::string AnimationRuntime::DescribeClip(const std::string& name) const {
  for (const auto& clip : clips_) {
    if (clip.name == name) {
      return clip.name + " tracks=" + std::to_string(clip.tracks) + " keyframes=" + std::to_string(clip.keyframes) +
             " bones=" + std::to_string(clip.bone_tracks);
    }
  }
  return "clip not found";
}

}  // namespace qforge
`;
}

function runtimeMain(ideScript: string, modelName: string): string {
  const escaped = ideScript.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return `#include "animation_runtime.hpp"
#include "game_runtime.hpp"

#include <filesystem>
#include <iostream>

int main() {
  qforge::GameRuntime runtime;
  qforge::AnimationRuntime animation_runtime;
  const std::filesystem::path game_path = "assets/export.game";
  if (!runtime.Load(game_path.string())) {
    std::cerr << "Failed to load export.game" << std::endl;
    return 1;
  }

  const bool metadata_ok = animation_runtime.LoadMetadata("assets/animation_metadata.json");
  std::cout << "Quantum Forge Runtime loaded model: ${modelName}" << std::endl;
  std::cout << "Script snippet: ${escaped}" << std::endl;
  std::cout << "Animation metadata: " << (metadata_ok ? "loaded" : "fallback") << std::endl;
  std::cout << "Sequence duration(sec): " << animation_runtime.EvaluateSequenceDuration() << std::endl;

  for (const auto& section : runtime.Sections()) {
    std::cout << "section=" << section.type << " compression=" << static_cast<int>(section.compression)
              << " offset=" << section.offset << " raw=" << section.raw_bytes << std::endl;
  }
  return 0;
}
`;
}

function windowsBuildBat(): string {
  return `@echo off
setlocal
if not exist build mkdir build
cmake -S . -B build -A x64
cmake --build build --config Release
echo Built: build/Release/quantum_forge_runtime.exe
`;
}

export async function exportEngineBundle({ gameBinary, ideScript, modelName, animationData, gameFiles }: ExportInputs): Promise<Blob> {
  const zip = new JSZip();
  const normalizedGameFiles = gameFiles
    .filter((file) => !file.path.endsWith("/.keep"))
    .map((file) => ({
      ...file,
      path: file.path.replace(/\\/g, "/"),
    }));

  const cppEntries = normalizedGameFiles
    .filter((file) => file.path.endsWith(".cpp"))
    .map((file) => `  ${file.path}`)
    .join("\n");

  const includeFolders = Array.from(
    new Set(
      normalizedGameFiles
        .filter((file) => file.path.endsWith(".h") || file.path.endsWith(".hpp"))
        .map((file) => file.path.split("/").slice(0, -1).join("/"))
        .filter((path) => path.length > 0)
    )
  )
    .map((path) => `target_include_directories(quantum_forge_runtime PRIVATE ${path})`)
    .join("\n");

  zip.file("CMakeLists.txt", cmakeText(cppEntries, includeFolders));
  zip.file("include/game_runtime.hpp", runtimeHeader());
  zip.file("include/animation_runtime.hpp", animationHeader());
  zip.file("src/game_runtime.cpp", runtimeSource());
  zip.file("src/animation_runtime.cpp", animationSource());
  zip.file("src/main.cpp", runtimeMain(ideScript, modelName));
  zip.file("tools/build_windows_x64.bat", windowsBuildBat());
  zip.file("assets/export.game", gameBinary);
  zip.file("assets/animation_metadata.json", JSON.stringify(animationData, null, 2));

  normalizedGameFiles.forEach((file) => {
    zip.file(file.path, file.content);
  });

  zip.file(
    "README.md",
    "Run tools/build_windows_x64.bat to build quantum_forge_runtime.exe via CMake. Animation sequence metadata is in assets/animation_metadata.json. GameProject files are included and linked in CMake."
  );
  return zip.generateAsync({ type: "blob" });
}
