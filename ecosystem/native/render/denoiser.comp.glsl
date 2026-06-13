#version 460

layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

layout(binding = 0, rgba16f) uniform image2D noisy_input;
layout(binding = 1, rgba16f) uniform image2D history_input;
layout(binding = 2, rgba16f) uniform image2D output_target;

vec3 neighborhood_mean(ivec2 pixel, ivec2 size) {
  vec3 sum = vec3(0.0);
  float weight_sum = 0.0;
  for (int y = -1; y <= 1; ++y) {
    for (int x = -1; x <= 1; ++x) {
      ivec2 p = clamp(pixel + ivec2(x, y), ivec2(0), size - ivec2(1));
      float w = 1.0 / float(abs(x) + abs(y) + 1);
      sum += imageLoad(noisy_input, p).rgb * w;
      weight_sum += w;
    }
  }
  return sum / weight_sum;
}

void main() {
  ivec2 pixel = ivec2(gl_GlobalInvocationID.xy);
  ivec2 size = imageSize(output_target);
  if (pixel.x >= size.x || pixel.y >= size.y) {
    return;
  }

  vec3 spatial = neighborhood_mean(pixel, size);
  vec3 temporal = imageLoad(history_input, pixel).rgb;
  vec3 denoised = mix(spatial, temporal, 0.65);
  imageStore(output_target, pixel, vec4(denoised, 1.0));
}
