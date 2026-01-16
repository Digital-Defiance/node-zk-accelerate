/**
 * @digitaldefiance/node-zk-accelerate
 * Metal NTT (Number Theoretic Transform) Implementation
 *
 * Requirements: 3.7, 7.4, 7.6
 */

#ifdef __APPLE__

#import <Metal/Metal.h>
#import <Foundation/Foundation.h>
#include "../include/metal_gpu.h"
#include <cstring>
#include <cmath>

// ============================================================================
// NTT Configuration
// ============================================================================

struct NTTConfig {
    uint32_t n;
    uint32_t log_n;
    uint32_t stage;
    uint32_t batch_size;
    uint32_t padding[4];
};

// ============================================================================
// NTT Shader Source
// ============================================================================

static const char* NTT_SHADER_SOURCE = R"(
#include <metal_stdlib>
using namespace metal;

struct FieldElement {
    uint64_t limbs[4];
};

struct NTTConfig {
    uint32_t n;
    uint32_t log_n;
    uint32_t stage;
    uint32_t batch_size;
    uint32_t padding[4];
};

constant uint64_t BN254_MODULUS[4] = {
    0x3C208C16D87CFD47ULL,
    0x97816A916871CA8DULL,
    0xB85045B68181585DULL,
    0x30644E72E131A029ULL
};

inline bool field_gte(thread const FieldElement& a, constant const uint64_t* b) {
    for (int i = 3; i >= 0; i--) {
        if (a.limbs[i] > b[i]) return true;
        if (a.limbs[i] < b[i]) return false;
    }
    return true;
}

inline void field_add(thread FieldElement& result,
                      thread const FieldElement& a,
                      thread const FieldElement& b) {
    uint64_t carry = 0;
    for (uint i = 0; i < 4; i++) {
        uint64_t sum = a.limbs[i] + b.limbs[i] + carry;
        carry = (sum < a.limbs[i]) || (carry && sum == a.limbs[i]) ? 1 : 0;
        result.limbs[i] = sum;
    }
    
    if (carry || field_gte(result, BN254_MODULUS)) {
        uint64_t borrow = 0;
        for (uint i = 0; i < 4; i++) {
            uint64_t diff = result.limbs[i] - BN254_MODULUS[i] - borrow;
            borrow = (diff > result.limbs[i]) ? 1 : 0;
            result.limbs[i] = diff;
        }
    }
}

inline void field_sub(thread FieldElement& result,
                      thread const FieldElement& a,
                      thread const FieldElement& b) {
    uint64_t borrow = 0;
    for (uint i = 0; i < 4; i++) {
        uint64_t diff = a.limbs[i] - b.limbs[i] - borrow;
        borrow = (diff > a.limbs[i]) ? 1 : 0;
        result.limbs[i] = diff;
    }
    
    if (borrow) {
        uint64_t carry = 0;
        for (uint i = 0; i < 4; i++) {
            uint64_t sum = result.limbs[i] + BN254_MODULUS[i] + carry;
            carry = (sum < result.limbs[i]) ? 1 : 0;
            result.limbs[i] = sum;
        }
    }
}

inline void field_copy(thread FieldElement& dst, thread const FieldElement& src) {
    for (uint i = 0; i < 4; i++) {
        dst.limbs[i] = src.limbs[i];
    }
}

inline void field_copy_from_device(thread FieldElement& dst, device const FieldElement& src) {
    for (uint i = 0; i < 4; i++) {
        dst.limbs[i] = src.limbs[i];
    }
}

inline void field_copy_to_device(device FieldElement& dst, thread const FieldElement& src) {
    for (uint i = 0; i < 4; i++) {
        dst.limbs[i] = src.limbs[i];
    }
}

inline void field_mul_simple(thread FieldElement& result,
                             thread const FieldElement& a,
                             thread const FieldElement& b) {
    // Placeholder: copy a (NOT correct math - full Montgomery mul needed)
    field_copy(result, a);
}

inline uint bit_reverse(uint index, uint log_n) {
    uint result = 0;
    for (uint i = 0; i < log_n; i++) {
        result = (result << 1) | ((index >> i) & 1);
    }
    return result;
}

kernel void ntt_bit_reverse(
    device FieldElement* data [[buffer(0)]],
    constant NTTConfig& config [[buffer(1)]],
    uint gid [[thread_position_in_grid]]
) {
    uint batch_idx = gid / config.n;
    uint elem_idx = gid % config.n;
    
    if (batch_idx >= config.batch_size) {
        return;
    }
    
    uint rev_idx = bit_reverse(elem_idx, config.log_n);
    
    if (elem_idx < rev_idx) {
        uint offset = batch_idx * config.n;
        
        FieldElement temp;
        field_copy_from_device(temp, data[offset + elem_idx]);
        
        FieldElement rev_elem;
        field_copy_from_device(rev_elem, data[offset + rev_idx]);
        
        field_copy_to_device(data[offset + elem_idx], rev_elem);
        field_copy_to_device(data[offset + rev_idx], temp);
    }
}

kernel void ntt_butterfly(
    device FieldElement* data [[buffer(0)]],
    device const FieldElement* twiddles [[buffer(1)]],
    constant NTTConfig& config [[buffer(2)]],
    uint gid [[thread_position_in_grid]]
) {
    uint batch_idx = gid / (config.n / 2);
    uint butterfly_idx = gid % (config.n / 2);
    
    if (batch_idx >= config.batch_size) {
        return;
    }
    
    uint stage = config.stage;
    uint m = 1u << stage;
    uint m_half = m >> 1;
    
    uint group = butterfly_idx / m_half;
    uint j = butterfly_idx % m_half;
    uint k = group * m + j;
    
    uint offset = batch_idx * config.n;
    uint idx1 = offset + k;
    uint idx2 = offset + k + m_half;
    
    uint twiddle_step = config.n / m;
    uint twiddle_idx = j * twiddle_step;
    
    FieldElement u, v, t, twiddle;
    field_copy_from_device(u, data[idx1]);
    field_copy_from_device(v, data[idx2]);
    field_copy_from_device(twiddle, twiddles[twiddle_idx]);
    
    field_mul_simple(t, twiddle, v);
    
    FieldElement sum, diff;
    field_add(sum, u, t);
    field_sub(diff, u, t);
    
    field_copy_to_device(data[idx1], sum);
    field_copy_to_device(data[idx2], diff);
}

kernel void ntt_scale(
    device FieldElement* data [[buffer(0)]],
    device const FieldElement* n_inv [[buffer(1)]],
    constant NTTConfig& config [[buffer(2)]],
    uint gid [[thread_position_in_grid]]
) {
    if (gid >= config.n * config.batch_size) {
        return;
    }
    
    FieldElement elem, scale, result;
    field_copy_from_device(elem, data[gid]);
    field_copy_from_device(scale, n_inv[0]);
    
    field_mul_simple(result, elem, scale);
    
    field_copy_to_device(data[gid], result);
}
)";

// ============================================================================
// Helper Functions
// ============================================================================

static uint32_t log2_floor(uint32_t n) {
    uint32_t result = 0;
    while (n > 1) {
        n >>= 1;
        result++;
    }
    return result;
}

static size_t calculate_optimal_group_size(size_t n, int max_threads) {
    // Choose group size based on transform size
    if (n <= 256) return 64;
    if (n <= 1024) return 128;
    if (n <= 4096) return 256;
    size_t max_size = (size_t)max_threads < 512 ? (size_t)max_threads : 512;
    return max_size;
}

// ============================================================================
// NTT GPU Implementation
// ============================================================================

GPUResult metal_gpu_ntt_forward(
    GPUBuffer* data_buffer,
    GPUBuffer* twiddles_buffer,
    size_t n
) {
    GPUResult result = {false, nullptr, 0.0};
    
    if (!metal_gpu_is_available()) {
        result.error_message = "Metal GPU not available";
        return result;
    }
    
    if (data_buffer == nullptr || twiddles_buffer == nullptr) {
        result.error_message = "Invalid buffer parameters";
        return result;
    }
    
    // Validate n is power of 2
    if (n == 0 || (n & (n - 1)) != 0) {
        result.error_message = "NTT size must be a power of 2";
        return result;
    }
    
    @autoreleasepool {
        uint32_t log_n = log2_floor((uint32_t)n);
        
        // Compile shaders
        GPUPipeline* bit_reverse_pipeline = metal_gpu_compile_shader(NTT_SHADER_SOURCE, "ntt_bit_reverse");
        GPUPipeline* butterfly_pipeline = metal_gpu_compile_shader(NTT_SHADER_SOURCE, "ntt_butterfly");
        
        if (!bit_reverse_pipeline || !butterfly_pipeline) {
            result.error_message = "Failed to compile NTT shaders";
            return result;
        }
        
        // Create config buffer
        NTTConfig config;
        config.n = (uint32_t)n;
        config.log_n = log_n;
        config.stage = 0;
        config.batch_size = 1;
        
        GPUBuffer* config_buffer = metal_gpu_alloc_buffer(sizeof(NTTConfig), true);
        if (!config_buffer) {
            result.error_message = "Failed to allocate config buffer";
            return result;
        }
        
        MetalGPUStatus status = metal_gpu_get_status();
        size_t group_size = calculate_optimal_group_size(n, status.max_threads_per_group);
        
        CFAbsoluteTime start_time = CFAbsoluteTimeGetCurrent();
        
        // Step 1: Bit-reversal permutation
        metal_gpu_copy_to_buffer(config_buffer, &config, sizeof(NTTConfig), 0);
        {
            GPUBuffer* buffers[] = { data_buffer, config_buffer };
            GPUResult br_result = metal_gpu_dispatch(bit_reverse_pipeline, buffers, 2, n, group_size);
            if (!br_result.success) {
                result.error_message = br_result.error_message;
                metal_gpu_free_buffer(config_buffer);
                return result;
            }
        }
        
        // Step 2: Butterfly stages
        for (uint32_t s = 1; s <= log_n; s++) {
            config.stage = s;
            metal_gpu_copy_to_buffer(config_buffer, &config, sizeof(NTTConfig), 0);
            
            GPUBuffer* buffers[] = { data_buffer, twiddles_buffer, config_buffer };
            size_t num_butterflies = n / 2;
            GPUResult bf_result = metal_gpu_dispatch(butterfly_pipeline, buffers, 3, num_butterflies, group_size);
            if (!bf_result.success) {
                result.error_message = bf_result.error_message;
                metal_gpu_free_buffer(config_buffer);
                return result;
            }
        }
        
        CFAbsoluteTime end_time = CFAbsoluteTimeGetCurrent();
        
        metal_gpu_free_buffer(config_buffer);
        
        result.success = true;
        result.execution_time_ms = (end_time - start_time) * 1000.0;
    }
    
    return result;
}

GPUResult metal_gpu_ntt_inverse(
    GPUBuffer* data_buffer,
    GPUBuffer* twiddles_inv_buffer,
    GPUBuffer* n_inv_buffer,
    size_t n
) {
    GPUResult result = {false, nullptr, 0.0};
    
    if (!metal_gpu_is_available()) {
        result.error_message = "Metal GPU not available";
        return result;
    }
    
    if (data_buffer == nullptr || twiddles_inv_buffer == nullptr) {
        result.error_message = "Invalid buffer parameters";
        return result;
    }
    
    // Validate n is power of 2
    if (n == 0 || (n & (n - 1)) != 0) {
        result.error_message = "NTT size must be a power of 2";
        return result;
    }
    
    @autoreleasepool {
        uint32_t log_n = log2_floor((uint32_t)n);
        
        // Compile shaders
        GPUPipeline* bit_reverse_pipeline = metal_gpu_compile_shader(NTT_SHADER_SOURCE, "ntt_bit_reverse");
        GPUPipeline* butterfly_pipeline = metal_gpu_compile_shader(NTT_SHADER_SOURCE, "ntt_butterfly");
        GPUPipeline* scale_pipeline = metal_gpu_compile_shader(NTT_SHADER_SOURCE, "ntt_scale");
        
        if (!bit_reverse_pipeline || !butterfly_pipeline || !scale_pipeline) {
            result.error_message = "Failed to compile NTT shaders";
            return result;
        }
        
        // Create config buffer
        NTTConfig config;
        config.n = (uint32_t)n;
        config.log_n = log_n;
        config.stage = 0;
        config.batch_size = 1;
        
        GPUBuffer* config_buffer = metal_gpu_alloc_buffer(sizeof(NTTConfig), true);
        if (!config_buffer) {
            result.error_message = "Failed to allocate config buffer";
            return result;
        }
        
        MetalGPUStatus status = metal_gpu_get_status();
        size_t group_size = calculate_optimal_group_size(n, status.max_threads_per_group);
        
        CFAbsoluteTime start_time = CFAbsoluteTimeGetCurrent();
        
        // Step 1: Bit-reversal permutation
        metal_gpu_copy_to_buffer(config_buffer, &config, sizeof(NTTConfig), 0);
        {
            GPUBuffer* buffers[] = { data_buffer, config_buffer };
            GPUResult br_result = metal_gpu_dispatch(bit_reverse_pipeline, buffers, 2, n, group_size);
            if (!br_result.success) {
                result.error_message = br_result.error_message;
                metal_gpu_free_buffer(config_buffer);
                return result;
            }
        }
        
        // Step 2: Butterfly stages with inverse twiddles
        for (uint32_t s = 1; s <= log_n; s++) {
            config.stage = s;
            metal_gpu_copy_to_buffer(config_buffer, &config, sizeof(NTTConfig), 0);
            
            GPUBuffer* buffers[] = { data_buffer, twiddles_inv_buffer, config_buffer };
            size_t num_butterflies = n / 2;
            GPUResult bf_result = metal_gpu_dispatch(butterfly_pipeline, buffers, 3, num_butterflies, group_size);
            if (!bf_result.success) {
                result.error_message = bf_result.error_message;
                metal_gpu_free_buffer(config_buffer);
                return result;
            }
        }
        
        // Step 3: Scale by n^-1
        if (n_inv_buffer != nullptr) {
            GPUBuffer* buffers[] = { data_buffer, n_inv_buffer, config_buffer };
            GPUResult scale_result = metal_gpu_dispatch(scale_pipeline, buffers, 3, n, group_size);
            if (!scale_result.success) {
                result.error_message = scale_result.error_message;
                metal_gpu_free_buffer(config_buffer);
                return result;
            }
        }
        
        CFAbsoluteTime end_time = CFAbsoluteTimeGetCurrent();
        
        metal_gpu_free_buffer(config_buffer);
        
        result.success = true;
        result.execution_time_ms = (end_time - start_time) * 1000.0;
    }
    
    return result;
}

GPUResult metal_gpu_ntt_batch(
    GPUBuffer* data_buffer,
    GPUBuffer* twiddles_buffer,
    size_t n,
    size_t batch_size,
    bool forward
) {
    GPUResult result = {false, nullptr, 0.0};
    
    if (!metal_gpu_is_available()) {
        result.error_message = "Metal GPU not available";
        return result;
    }
    
    if (data_buffer == nullptr || twiddles_buffer == nullptr) {
        result.error_message = "Invalid buffer parameters";
        return result;
    }
    
    // Validate n is power of 2
    if (n == 0 || (n & (n - 1)) != 0) {
        result.error_message = "NTT size must be a power of 2";
        return result;
    }
    
    if (batch_size == 0) {
        result.success = true;
        return result;
    }
    
    @autoreleasepool {
        uint32_t log_n = log2_floor((uint32_t)n);
        
        // Compile shaders
        GPUPipeline* bit_reverse_pipeline = metal_gpu_compile_shader(NTT_SHADER_SOURCE, "ntt_bit_reverse");
        GPUPipeline* butterfly_pipeline = metal_gpu_compile_shader(NTT_SHADER_SOURCE, "ntt_butterfly");
        
        if (!bit_reverse_pipeline || !butterfly_pipeline) {
            result.error_message = "Failed to compile NTT shaders";
            return result;
        }
        
        // Create config buffer
        NTTConfig config;
        config.n = (uint32_t)n;
        config.log_n = log_n;
        config.stage = 0;
        config.batch_size = (uint32_t)batch_size;
        
        GPUBuffer* config_buffer = metal_gpu_alloc_buffer(sizeof(NTTConfig), true);
        if (!config_buffer) {
            result.error_message = "Failed to allocate config buffer";
            return result;
        }
        
        MetalGPUStatus status = metal_gpu_get_status();
        size_t group_size = calculate_optimal_group_size(n, status.max_threads_per_group);
        size_t total_elements = n * batch_size;
        
        CFAbsoluteTime start_time = CFAbsoluteTimeGetCurrent();
        
        // Step 1: Bit-reversal permutation for all batches
        metal_gpu_copy_to_buffer(config_buffer, &config, sizeof(NTTConfig), 0);
        {
            GPUBuffer* buffers[] = { data_buffer, config_buffer };
            GPUResult br_result = metal_gpu_dispatch(bit_reverse_pipeline, buffers, 2, total_elements, group_size);
            if (!br_result.success) {
                result.error_message = br_result.error_message;
                metal_gpu_free_buffer(config_buffer);
                return result;
            }
        }
        
        // Step 2: Butterfly stages for all batches
        for (uint32_t s = 1; s <= log_n; s++) {
            config.stage = s;
            metal_gpu_copy_to_buffer(config_buffer, &config, sizeof(NTTConfig), 0);
            
            GPUBuffer* buffers[] = { data_buffer, twiddles_buffer, config_buffer };
            size_t num_butterflies = (n / 2) * batch_size;
            GPUResult bf_result = metal_gpu_dispatch(butterfly_pipeline, buffers, 3, num_butterflies, group_size);
            if (!bf_result.success) {
                result.error_message = bf_result.error_message;
                metal_gpu_free_buffer(config_buffer);
                return result;
            }
        }
        
        CFAbsoluteTime end_time = CFAbsoluteTimeGetCurrent();
        
        metal_gpu_free_buffer(config_buffer);
        
        result.success = true;
        result.execution_time_ms = (end_time - start_time) * 1000.0;
    }
    
    return result;
}

#endif /* __APPLE__ */
