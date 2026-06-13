#pragma once

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
