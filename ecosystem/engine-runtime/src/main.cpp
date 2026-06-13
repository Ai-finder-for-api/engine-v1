#include "game_runtime.hpp"

#include <iostream>

int main(int argc, char** argv) {
  const std::string path = argc > 1 ? argv[1] : "assets/export.game";
  qforge::GameRuntime runtime;
  if (!runtime.Load(path)) {
    std::cerr << "Failed to load .game file: " << path << std::endl;
    return 1;
  }

  std::cout << "Loaded: " << path << std::endl;
  std::cout << "Section count: " << runtime.Sections().size() << std::endl;
  for (const auto& section : runtime.Sections()) {
    std::cout << "type=" << section.type << " compression=" << static_cast<int>(section.compression)
              << " raw=" << section.raw_bytes << " stored=" << section.stored_bytes << std::endl;
  }
  return 0;
}
