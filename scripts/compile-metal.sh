#!/bin/bash
#
# @digitaldefiance/node-zk-accelerate
# Metal Shader Compilation Script
#
# This script compiles Metal shaders to .metallib files for GPU acceleration.
# Requirements: 13.3
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SHADER_DIR="$ROOT_DIR/native/shaders"
OUTPUT_DIR="$ROOT_DIR/native/compiled-shaders"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    log_warning "Metal shader compilation is only supported on macOS"
    exit 0
fi

# Check for Metal compiler
if ! command -v xcrun &> /dev/null; then
    log_error "xcrun not found. Please install Xcode Command Line Tools."
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

log_info "Compiling Metal shaders..."
log_info "Source: $SHADER_DIR"
log_info "Output: $OUTPUT_DIR"

# Compile each shader
compile_shader() {
    local shader_name="$1"
    local src_path="$SHADER_DIR/${shader_name}.metal"
    local air_path="$OUTPUT_DIR/${shader_name}.air"
    local lib_path="$OUTPUT_DIR/${shader_name}.metallib"

    if [[ ! -f "$src_path" ]]; then
        log_warning "Shader not found: $src_path"
        return 1
    fi

    log_info "Compiling ${shader_name}.metal..."

    # Compile to AIR (Apple Intermediate Representation)
    xcrun -sdk macosx metal \
        -c "$src_path" \
        -o "$air_path" \
        -std=metal3.0 \
        -O3 \
        -ffast-math

    # Link to metallib
    xcrun -sdk macosx metallib \
        "$air_path" \
        -o "$lib_path"

    # Clean up intermediate file
    rm -f "$air_path"

    log_success "Compiled ${shader_name}.metal -> ${shader_name}.metallib"
}

# Compile all shaders
SHADERS=("msm" "ntt")

for shader in "${SHADERS[@]}"; do
    compile_shader "$shader" || true
done

# Create combined metallib (optional)
if [[ -f "$OUTPUT_DIR/msm.metallib" ]] && [[ -f "$OUTPUT_DIR/ntt.metallib" ]]; then
    log_info "Creating combined shader library..."
    
    # Re-compile to AIR for combining
    xcrun -sdk macosx metal -c "$SHADER_DIR/msm.metal" -o "$OUTPUT_DIR/msm.air" -std=metal3.0 -O3 -ffast-math
    xcrun -sdk macosx metal -c "$SHADER_DIR/ntt.metal" -o "$OUTPUT_DIR/ntt.air" -std=metal3.0 -O3 -ffast-math
    
    # Combine into single library
    xcrun -sdk macosx metallib \
        "$OUTPUT_DIR/msm.air" \
        "$OUTPUT_DIR/ntt.air" \
        -o "$OUTPUT_DIR/zk_accelerate.metallib"
    
    # Clean up
    rm -f "$OUTPUT_DIR/msm.air" "$OUTPUT_DIR/ntt.air"
    
    log_success "Created combined library: zk_accelerate.metallib"
fi

log_success "Metal shader compilation complete!"

# List compiled files
echo ""
log_info "Compiled shader libraries:"
ls -la "$OUTPUT_DIR"/*.metallib 2>/dev/null || log_warning "No metallib files found"
