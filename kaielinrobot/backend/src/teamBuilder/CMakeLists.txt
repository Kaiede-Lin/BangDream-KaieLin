cmake_minimum_required(VERSION 3.10)
project(calc)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/lib)

add_library(calc SHARED calc.cpp)
add_compile_options("$<$<CXX_COMPILER_ID:MSVC>:/arch:AVX2>")
add_compile_options("$<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-mavx2>")