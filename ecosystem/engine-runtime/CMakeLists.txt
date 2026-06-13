cmake_minimum_required(VERSION 3.24)
project(QuantumForgeRuntime LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(quantum_forge_runtime
  src/main.cpp
  src/game_runtime.cpp
)

target_include_directories(quantum_forge_runtime PRIVATE include)

if(MSVC)
  target_compile_options(quantum_forge_runtime PRIVATE /O2 /EHsc)
else()
  target_compile_options(quantum_forge_runtime PRIVATE -O3 -march=native)
endif()
