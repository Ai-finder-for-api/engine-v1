#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <span>
#include <vector>

namespace qforge {

using Entity = std::uint32_t;

struct Position {
  float x;
  float y;
  float z;
};

struct Velocity {
  float x;
  float y;
  float z;
};

class LinearArena {
 public:
  explicit LinearArena(std::size_t bytes);
  ~LinearArena();

  LinearArena(const LinearArena&) = delete;
  LinearArena& operator=(const LinearArena&) = delete;

  [[nodiscard]] void* Allocate(std::size_t bytes, std::size_t alignment);
  void Reset();

 private:
  std::byte* base_;
  std::size_t capacity_;
  std::atomic<std::size_t> head_;
};

class SparseSet {
 public:
  static constexpr std::uint32_t kNull = 0xffffffffu;

  explicit SparseSet(std::size_t reserve = 1024);
  void Insert(Entity entity, std::uint32_t dense_index);
  void Erase(Entity entity);
  [[nodiscard]] bool Contains(Entity entity) const;
  [[nodiscard]] std::uint32_t DenseIndex(Entity entity) const;

 private:
  std::vector<std::uint32_t> sparse_;
};

class ECSWorld {
 public:
  explicit ECSWorld(std::size_t reserve_entities = 1 << 16);
  Entity CreateEntity();
  void DestroyEntity(Entity entity);

  void AddPosition(Entity entity, const Position& position);
  void AddVelocity(Entity entity, const Velocity& velocity);
  void Integrate(float dt);

  [[nodiscard]] std::span<const Entity> Entities() const;
  [[nodiscard]] std::span<const Position> Positions() const;
  [[nodiscard]] std::span<const Velocity> Velocities() const;

 private:
  std::atomic<Entity> next_entity_;
  std::vector<Entity> entities_;
  std::vector<Position> positions_;
  std::vector<Velocity> velocities_;
  SparseSet position_map_;
  SparseSet velocity_map_;
};

}  // namespace qforge
