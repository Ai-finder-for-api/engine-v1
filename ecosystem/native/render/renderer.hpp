#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace qforge {

struct Vec3 {
  float x;
  float y;
  float z;
};

struct Ray {
  Vec3 origin;
  Vec3 direction;
};

struct Material {
  Vec3 albedo;
  float roughness;
  float metalness;
};

struct Sphere {
  Vec3 center;
  float radius;
  Material material;
};

struct Reservoir {
  std::uint32_t light_index;
  float weight_sum;
  float selected_weight;
};

class PathTracer {
 public:
  explicit PathTracer(std::uint32_t seed = 1u);
  Vec3 Trace(const Ray& ray, const std::vector<Sphere>& spheres, int max_bounces) const;
  Reservoir UpdateReservoir(const Reservoir& previous, std::uint32_t candidate, float weight, float random01) const;

 private:
  std::uint32_t seed_;
};

}  // namespace qforge
