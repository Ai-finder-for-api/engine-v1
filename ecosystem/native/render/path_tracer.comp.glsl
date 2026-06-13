#version 460

layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

layout(binding = 0, rgba16f) uniform image2D accumulation_target;

struct Reservoir {
  uint light_index;
  float weight_sum;
  float selected_weight;
  float padding;
};

layout(std430, binding = 1) buffer ReservoirBuffer {
  Reservoir reservoirs[];
};

float rand(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 microfacet_brdf(vec3 n, vec3 v, vec3 l, vec3 albedo, float roughness, float metalness) {
  vec3 h = normalize(v + l);
  float ndotl = max(dot(n, l), 0.0);
  float ndotv = max(dot(n, v), 0.0);
  float ndoth = max(dot(n, h), 0.0);
  float vdh = max(dot(v, h), 0.0);

  float alpha = roughness * roughness;
  float alpha2 = alpha * alpha;
  float denom = ndoth * ndoth * (alpha2 - 1.0) + 1.0;
  float d = alpha2 / max(3.14159265 * denom * denom, 1e-5);

  float k = (roughness + 1.0);
  k = (k * k) / 8.0;
  float g_v = ndotv / mix(ndotv, 1.0, k);
  float g_l = ndotl / mix(ndotl, 1.0, k);
  float g = g_v * g_l;

  vec3 f0 = mix(vec3(0.04), albedo, metalness);
  vec3 f = f0 + (1.0 - f0) * pow(1.0 - vdh, 5.0);

  vec3 spec = (d * g * f) / max(4.0 * ndotv * ndotl, 1e-5);
  vec3 diff = (1.0 - metalness) * albedo / 3.14159265;
  return (diff + spec) * ndotl;
}

void main() {
  ivec2 pixel = ivec2(gl_GlobalInvocationID.xy);
  ivec2 size = imageSize(accumulation_target);
  if (pixel.x >= size.x || pixel.y >= size.y) {
    return;
  }

  int index = pixel.y * size.x + pixel.x;
  Reservoir r = reservoirs[index];
  float jitter = rand(vec2(pixel));
  float candidate_weight = 0.2 + jitter;
  r.weight_sum += candidate_weight;
  if (jitter < (candidate_weight / r.weight_sum)) {
    r.light_index = uint(jitter * 1024.0);
    r.selected_weight = candidate_weight;
  }
  reservoirs[index] = r;

  vec3 n = normalize(vec3(0.0, 1.0, 0.3));
  vec3 v = normalize(vec3(0.0, 0.2, 1.0));
  vec3 l = normalize(vec3(0.8, 1.0, 0.6));
  vec3 shaded = microfacet_brdf(n, v, l, vec3(0.8, 0.7, 0.65), 0.22, 0.1);

  vec4 previous = imageLoad(accumulation_target, pixel);
  imageStore(accumulation_target, pixel, vec4(mix(previous.rgb, shaded, 0.06), 1.0));
}
