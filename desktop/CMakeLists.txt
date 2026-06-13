cmake_minimum_required(VERSION 3.24)
project(Quantum_Forge_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_BINARY_DIR}/bin/Debug)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_BINARY_DIR}/bin/Release)

add_executable(Quantum_Forge_engine WIN32
  src/main.cpp
  src/workspace.cpp
  src/animation_sequence.cpp
)

add_executable(Quantum_Smith WIN32
  src/main_smith.cpp
  src/workspace.cpp
  src/animation_sequence.cpp
)

target_include_directories(Quantum_Forge_engine PRIVATE include)
target_include_directories(Quantum_Smith PRIVATE include)
target_link_libraries(Quantum_Forge_engine PRIVATE user32 shell32 ws2_32)
target_link_libraries(Quantum_Smith PRIVATE user32 shell32 ws2_32)

if(EXISTS "${CMAKE_SOURCE_DIR}/../dist")
  add_custom_command(
    TARGET Quantum_Forge_engine
    POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:Quantum_Forge_engine>/web"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/../dist" "$<TARGET_FILE_DIR:Quantum_Forge_engine>/web"
    COMMENT "Copying web dist bundle next to desktop executable"
  )

  add_custom_command(
    TARGET Quantum_Smith
    POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:Quantum_Smith>/web"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/../dist" "$<TARGET_FILE_DIR:Quantum_Smith>/web"
    COMMENT "Copying web dist bundle next to Quantum Smith executable"
  )
endif()

if(MSVC)
  target_compile_options(
    Quantum_Forge_engine
    PRIVATE
      /EHsc
      $<$<CONFIG:Debug>:/Od>
      $<$<CONFIG:Debug>:/RTC1>
      $<$<CONFIG:Release>:/O2>
      $<$<CONFIG:RelWithDebInfo>:/O2>
      $<$<CONFIG:MinSizeRel>:/O1>
  )
  target_compile_options(
    Quantum_Smith
    PRIVATE
      /EHsc
      $<$<CONFIG:Debug>:/Od>
      $<$<CONFIG:Debug>:/RTC1>
      $<$<CONFIG:Release>:/O2>
      $<$<CONFIG:RelWithDebInfo>:/O2>
      $<$<CONFIG:MinSizeRel>:/O1>
  )
else()
  target_compile_options(
    Quantum_Forge_engine
    PRIVATE
      $<$<CONFIG:Debug>:-O0>
      $<$<CONFIG:Release>:-O3>
      $<$<CONFIG:RelWithDebInfo>:-O3>
      $<$<CONFIG:MinSizeRel>:-Os>
  )
  target_compile_options(
    Quantum_Smith
    PRIVATE
      $<$<CONFIG:Debug>:-O0>
      $<$<CONFIG:Release>:-O3>
      $<$<CONFIG:RelWithDebInfo>:-O3>
      $<$<CONFIG:MinSizeRel>:-Os>
  )
endif()
