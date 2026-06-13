#version 460

layout(local_size_x = 256, local_size_y = 1, local_size_z = 1) in;

struct Particle {
  vec4 position;
  vec4 velocity;
};

layout(std430, binding = 0) buffer ParticleBuffer {
  Particle particles[];
};

layout(push_constant) uniform SimParams {
  float dt;
  float turbulence;
  float vorticity;
  uint count;
} params;

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  uint id = gl_GlobalInvocationID.x;
  if (id >= params.count) {
    return;
  }

  Particle p = particles[id];
  float t = float(id) * 0.01 + params.dt;
  vec3 noise = vec3(hash(t), hash(t + 13.7), hash(t + 29.9)) * 2.0 - 1.0;
  vec3 curl = vec3(-p.position.z, 0.0, p.position.x) * params.vorticity;
  vec3 accel = noise * params.turbulence + curl;

  p.velocity.xyz += accel * params.dt;
  p.position.xyz += p.velocity.xyz * params.dt;

  if (length(p.position.xyz) > 120.0) {
    p.position.xyz *= 0.01;
    p.velocity.xyz *= 0.1;
  }

  particles[id] = p;
}
