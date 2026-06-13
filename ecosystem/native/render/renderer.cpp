#include "renderer.hpp"

#include <cmath>

namespace qforge {

static Vec3 Add(const Vec3& a, const Vec3& b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
static Vec3 Sub(const Vec3& a, const Vec3& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
static Vec3 Mul(const Vec3& a, float s) { return {a.x * s, a.y * s, a.z * s}; }
static float Dot(const Vec3& a, const Vec3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
static Vec3 Normalize(const Vec3& v) {
  float len = std::sqrt(Dot(v, v));
  return len > 0.0f ? Mul(v, 1.0f / len) : Vec3{0.0f, 1.0f, 0.0f};
}

static bool IntersectSphere(const Ray& ray, const Sphere& sphere, float& t) {
  const Vec3 oc = Sub(ray.origin, sphere.center);
  const float a = Dot(ray.direction, ray.direction);
  const float b = 2.0f * Dot(oc, ray.direction);
  const float c = Dot(oc, oc) - sphere.radius * sphere.radius;
  const float discriminant = b * b - 4.0f * a * c;
  if (discriminant < 0.0f) return false;
  t = (-b - std::sqrt(discriminant)) / (2.0f * a);
  return t > 0.0001f;
}

PathTracer::PathTracer(std::uint32_t seed) : seed_(seed) {}

Vec3 PathTracer::Trace(const Ray& ray, const std::vector<Sphere>& spheres, int max_bounces) const {
  Ray current = ray;
  Vec3 throughput{1.0f, 1.0f, 1.0f};
  Vec3 radiance{0.0f, 0.0f, 0.0f};

  for (int bounce = 0; bounce < max_bounces; ++bounce) {
    float nearest = 1e20f;
    const Sphere* hit = nullptr;
    for (const Sphere& sphere : spheres) {
      float t = 0.0f;
      if (IntersectSphere(current, sphere, t) && t < nearest) {
        nearest = t;
        hit = &sphere;
      }
    }
    if (!hit) {
      const float sky = 0.5f * (current.direction.y + 1.0f);
      radiance = Add(radiance, Mul(throughput, sky));
      break;
    }

    const Vec3 hit_pos = Add(current.origin, Mul(current.direction, nearest));
    const Vec3 normal = Normalize(Sub(hit_pos, hit->center));
    const Vec3 bounce_dir = Normalize(Add(normal, Vec3{0.3f, 0.8f, 0.2f}));
    throughput = {throughput.x * hit->material.albedo.x, throughput.y * hit->material.albedo.y,
                  throughput.z * hit->material.albedo.z};
    current = {Add(hit_pos, Mul(normal, 0.001f)), bounce_dir};
  }

  return radiance;
}

Reservoir PathTracer::UpdateReservoir(const Reservoir& previous, std::uint32_t candidate, float weight,
                                      float random01) const {
  Reservoir next = previous;
  next.weight_sum += weight;
  if (weight > 0.0f && random01 < (weight / next.weight_sum)) {
    next.light_index = candidate;
    next.selected_weight = weight;
  }
  return next;
}

}  // namespace qforge
