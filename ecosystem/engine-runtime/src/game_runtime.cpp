#include "game_runtime.hpp"

#include <cstring>
#include <fstream>
#include <iterator>

namespace qforge {

bool GameRuntime::Load(const std::string& path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) {
    return false;
  }

  bytes_ = std::vector<std::uint8_t>(std::istreambuf_iterator<char>(file), {});
  if (bytes_.size() < 64) {
    return false;
  }
  if (std::memcmp(bytes_.data(), "QGAMEFMT", 8) != 0) {
    return false;
  }

  const auto read_u16 = [&](std::size_t off) {
    return static_cast<std::uint16_t>(bytes_[off] | (bytes_[off + 1] << 8));
  };
  const auto read_u64 = [&](std::size_t off) {
    std::uint64_t value = 0;
    for (int i = 0; i < 8; ++i) {
      value |= (std::uint64_t(bytes_[off + i]) << (8 * i));
    }
    return value;
  };

  const std::uint16_t section_count = read_u16(10);
  const std::size_t toc_offset = static_cast<std::size_t>(read_u64(16));
  sections_.clear();
  sections_.reserve(section_count);

  for (std::uint16_t i = 0; i < section_count; ++i) {
    const std::size_t base = toc_offset + (std::size_t(i) * 64);
    SectionInfo info{};
    info.type = read_u16(base);
    info.compression = bytes_[base + 2];
    info.offset = read_u64(base + 8);
    info.stored_bytes = read_u64(base + 16);
    info.raw_bytes = read_u64(base + 24);
    sections_.push_back(info);
  }
  return true;
}

const std::vector<SectionInfo>& GameRuntime::Sections() const { return sections_; }

}  // namespace qforge
