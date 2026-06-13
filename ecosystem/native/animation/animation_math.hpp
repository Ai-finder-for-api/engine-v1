#pragma once

#include <array>
#include <cmath>
#include <cstdint>

#if defined(__AVX512F__)
#include <immintrin.h>
#endif

namespace qforge {

struct Vec4 {
  float x;
  float y;
  float z;
  float w;
};

struct DualQuat {
  Vec4 real;
  Vec4 dual;
};

inline Vec4 Normalize(const Vec4& q) {
  float inv = 1.0f / std::sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return {q.x * inv, q.y * inv, q.z * inv, q.w * inv};
}

inline DualQuat Blend(const DualQuat& a, const DualQuat& b, float t) {
  DualQuat out{};
  out.real = Normalize({a.real.x + (b.real.x - a.real.x) * t, a.real.y + (b.real.y - a.real.y) * t,
                        a.real.z + (b.real.z - a.real.z) * t, a.real.w + (b.real.w - a.real.w) * t});
  out.dual = {a.dual.x + (b.dual.x - a.dual.x) * t, a.dual.y + (b.dual.y - a.dual.y) * t,
              a.dual.z + (b.dual.z - a.dual.z) * t, a.dual.w + (b.dual.w - a.dual.w) * t};
  return out;
}

inline std::array<float, 16> SolveTwoBoneIK(float upper_len, float lower_len, float target_dist) {
  float clamped = std::fmax(0.001f, std::fmin(target_dist, upper_len + lower_len - 0.001f));
  float cos_knee = (upper_len * upper_len + lower_len * lower_len - clamped * clamped) /
                   (2.0f * upper_len * lower_len);
  float knee_angle = std::acos(cos_knee);
  float cos_shoulder = (upper_len * upper_len + clamped * clamped - lower_len * lower_len) /
                       (2.0f * upper_len * clamped);
  float shoulder_angle = std::acos(cos_shoulder);

  return {
      shoulder_angle,
      knee_angle,
      0.0f,
      0.0f,
      0.0f,
      1.0f,
      0.0f,
      0.0f,
      0.0f,
      0.0f,
      1.0f,
      0.0f,
      0.0f,
      0.0f,
      0.0f,
      1.0f,
  };
}

#if defined(__AVX512F__)
inline void AddVectorsAVX512(const float* a, const float* b, float* out) {
  __m512 va = _mm512_loadu_ps(a);
  __m512 vb = _mm512_loadu_ps(b);
  __m512 vc = _mm512_add_ps(va, vb);
  _mm512_storeu_ps(out, vc);
}
#endif

}  // namespace qforge
