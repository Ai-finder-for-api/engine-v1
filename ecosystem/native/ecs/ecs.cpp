#include "ecs.hpp"

#include <algorithm>
#include <cstdlib>
#include <new>
#include <stdexcept>

namespace qforge {

LinearArena::LinearArena(std::size_t bytes) : base_(nullptr), capacity_(bytes), head_(0) {
  base_ = static_cast<std::byte*>(std::aligned_alloc(64, bytes));
  if (!base_) {
    throw std::bad_alloc();
  }
}

LinearArena::~LinearArena() { std::free(base_); }

void* LinearArena::Allocate(std::size_t bytes, std::size_t alignment) {
  std::size_t current = head_.load(std::memory_order_relaxed);
  while (true) {
    std::size_t aligned = (current + alignment - 1) & ~(alignment - 1);
    std::size_t next = aligned + bytes;
    if (next > capacity_) {
      throw std::runtime_error("LinearArena exhausted");
    }
    if (head_.compare_exchange_weak(current, next, std::memory_order_release, std::memory_order_relaxed)) {
      return base_ + aligned;
    }
  }
}

void LinearArena::Reset() { head_.store(0, std::memory_order_release); }

SparseSet::SparseSet(std::size_t reserve) : sparse_(reserve, kNull) {}

void SparseSet::Insert(Entity entity, std::uint32_t dense_index) {
  if (entity >= sparse_.size()) {
    sparse_.resize(entity + 1, kNull);
  }
  sparse_[entity] = dense_index;
}

void SparseSet::Erase(Entity entity) {
  if (entity < sparse_.size()) {
    sparse_[entity] = kNull;
  }
}

bool SparseSet::Contains(Entity entity) const {
  return entity < sparse_.size() && sparse_[entity] != kNull;
}

std::uint32_t SparseSet::DenseIndex(Entity entity) const {
  return Contains(entity) ? sparse_[entity] : kNull;
}

ECSWorld::ECSWorld(std::size_t reserve_entities)
    : next_entity_(1), position_map_(reserve_entities), velocity_map_(reserve_entities) {
  entities_.reserve(reserve_entities);
  positions_.reserve(reserve_entities);
  velocities_.reserve(reserve_entities);
}

Entity ECSWorld::CreateEntity() {
  Entity entity = next_entity_.fetch_add(1, std::memory_order_relaxed);
  entities_.push_back(entity);
  return entity;
}

void ECSWorld::DestroyEntity(Entity entity) {
  entities_.erase(std::remove(entities_.begin(), entities_.end(), entity), entities_.end());
  position_map_.Erase(entity);
  velocity_map_.Erase(entity);
}

void ECSWorld::AddPosition(Entity entity, const Position& position) {
  const std::uint32_t dense = static_cast<std::uint32_t>(positions_.size());
  positions_.push_back(position);
  position_map_.Insert(entity, dense);
}

void ECSWorld::AddVelocity(Entity entity, const Velocity& velocity) {
  const std::uint32_t dense = static_cast<std::uint32_t>(velocities_.size());
  velocities_.push_back(velocity);
  velocity_map_.Insert(entity, dense);
}

void ECSWorld::Integrate(float dt) {
  const std::size_t count = std::min(positions_.size(), velocities_.size());
  for (std::size_t i = 0; i < count; ++i) {
    positions_[i].x += velocities_[i].x * dt;
    positions_[i].y += velocities_[i].y * dt;
    positions_[i].z += velocities_[i].z * dt;
  }
}

std::span<const Entity> ECSWorld::Entities() const { return entities_; }

std::span<const Position> ECSWorld::Positions() const { return positions_; }

std::span<const Velocity> ECSWorld::Velocities() const { return velocities_; }

}  // namespace qforge
