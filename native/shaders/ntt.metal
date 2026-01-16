/**
 * @digitaldefiance/node-zk-accelerate
 * Metal NTT (Number Theoretic Transform) Compute Shaders
 *
 * Requirements: 3.7, 7.4, 7.6
 *
 * This file contains Metal compute shaders for GPU-accelerated NTT
 * using the Cooley-Tukey butterfly algorithm.
 */

#include <metal_stdlib>
using namespace metal;

// ============================================================================
// Constants and Types
// ============================================================================

// Field element (256-bit for BN254)
struct FieldElement {
    uint64_t limbs[4];
};

// NTT configuration
struct NTTConfig {
    uint32_t n;              // Transform size
    uint32_t log_n;          // log2(n)
    uint32_t stage;          // Current butterfly stage
    uint32_t batch_size;     // Number of polynomials in batch
    uint32_t padding[4];
};

// BN254 field modulus
constant uint64_t BN254_MODULUS[4] = {
    0x3C208C16D87CFD47ULL,
    0x97816A916871CA8DULL,
    0xB85045B68181585DULL,
    0x30644E72E131A029ULL
};

// ============================================================================
// Field Arithmetic
// ============================================================================

// Check if a >= b (constant time)
inline bool field_gte(thread const FieldElement& a, constant const uint64_t* b) {
    for (int i = 3; i >= 0; i--) {
        if (a.limbs[i] > b[i]) return true;
        if (a.limbs[i] < b[i]) return false;
    }
    return true;
}

// Field addition: result = a + b mod p
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

// Field subtraction: result = a - b mod p
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

// Copy field element
inline void field_copy(thread FieldElement& dst, thread const FieldElement& src) {
    for (uint i = 0; i < 4; i++) {
        dst.limbs[i] = src.limbs[i];
    }
}

// Copy from device to thread
inline void field_copy_from_device(thread FieldElement& dst, device const FieldElement& src) {
    for (uint i = 0; i < 4; i++) {
        dst.limbs[i] = src.limbs[i];
    }
}

// Copy from thread to device
inline void field_copy_to_device(device FieldElement& dst, thread const FieldElement& src) {
    for (uint i = 0; i < 4; i++) {
        dst.limbs[i] = src.limbs[i];
    }
}

// ============================================================================
// Montgomery Multiplication (simplified for GPU)
// ============================================================================

// Note: Full Montgomery multiplication would be implemented here
// For now, we use a simplified placeholder that demonstrates the structure

inline void field_mul_simple(thread FieldElement& result,
                             thread const FieldElement& a,
                             thread const FieldElement& b) {
    // Placeholder: In production, implement full Montgomery multiplication
    // For demonstration, just copy a (this is NOT correct math)
    field_copy(result, a);
    
    // TODO: Implement proper Montgomery multiplication
    // This requires:
    // 1. Multiply a * b to get 512-bit result
    // 2. Montgomery reduction
}

// ============================================================================
// Bit Reversal
// ============================================================================

// Bit-reverse an index
inline uint bit_reverse(uint index, uint log_n) {
    uint result = 0;
    for (uint i = 0; i < log_n; i++) {
        result = (result << 1) | ((index >> i) & 1);
    }
    return result;
}

// ============================================================================
// NTT Kernels
// ============================================================================

/**
 * Bit-reversal permutation kernel
 *
 * Reorders array elements according to bit-reversed indices.
 * This is the first step of the Cooley-Tukey NTT algorithm.
 */
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
    
    // Only swap if elem_idx < rev_idx to avoid double swapping
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

/**
 * NTT butterfly kernel (single stage)
 *
 * Performs one stage of the Cooley-Tukey butterfly operations.
 * Each thread handles one butterfly operation.
 */
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
    uint m = 1u << stage;           // 2^stage
    uint m_half = m >> 1;           // m/2
    
    // Calculate indices for this butterfly
    uint group = butterfly_idx / m_half;
    uint j = butterfly_idx % m_half;
    uint k = group * m + j;
    
    uint offset = batch_idx * config.n;
    uint idx1 = offset + k;
    uint idx2 = offset + k + m_half;
    
    // Twiddle factor index
    uint twiddle_step = config.n / m;
    uint twiddle_idx = j * twiddle_step;
    
    // Load values
    FieldElement u, v, t, twiddle;
    field_copy_from_device(u, data[idx1]);
    field_copy_from_device(v, data[idx2]);
    field_copy_from_device(twiddle, twiddles[twiddle_idx]);
    
    // t = twiddle * v
    field_mul_simple(t, twiddle, v);
    
    // Butterfly: data[idx1] = u + t, data[idx2] = u - t
    FieldElement sum, diff;
    field_add(sum, u, t);
    field_sub(diff, u, t);
    
    field_copy_to_device(data[idx1], sum);
    field_copy_to_device(data[idx2], diff);
}

/**
 * Inverse NTT scaling kernel
 *
 * Multiplies all elements by n^-1 after inverse NTT.
 */
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

/**
 * Combined NTT kernel for small transforms
 *
 * Performs complete NTT in a single kernel launch for small sizes.
 * More efficient for n <= 1024 due to reduced kernel launch overhead.
 */
kernel void ntt_small(
    device FieldElement* data [[buffer(0)]],
    device const FieldElement* twiddles [[buffer(1)]],
    constant NTTConfig& config [[buffer(2)]],
    uint gid [[thread_position_in_grid]],
    uint tid [[thread_index_in_threadgroup]],
    uint tg_size [[threads_per_threadgroup]]
) {
    uint batch_idx = gid / config.n;
    uint elem_idx = gid % config.n;
    
    if (batch_idx >= config.batch_size) {
        return;
    }
    
    uint offset = batch_idx * config.n;
    
    // Bit-reversal permutation
    uint rev_idx = bit_reverse(elem_idx, config.log_n);
    
    // Load element (with bit-reversal)
    FieldElement elem;
    field_copy_from_device(elem, data[offset + rev_idx]);
    
    // Threadgroup barrier to ensure all loads complete
    threadgroup_barrier(mem_flags::mem_device);
    
    // Store back to original position
    field_copy_to_device(data[offset + elem_idx], elem);
    
    threadgroup_barrier(mem_flags::mem_device);
    
    // Butterfly stages
    for (uint s = 1; s <= config.log_n; s++) {
        uint m = 1u << s;
        uint m_half = m >> 1;
        uint twiddle_step = config.n / m;
        
        uint group = elem_idx / m;
        uint j = elem_idx % m;
        
        if (j < m_half) {
            uint idx1 = offset + group * m + j;
            uint idx2 = idx1 + m_half;
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
        
        threadgroup_barrier(mem_flags::mem_device);
    }
}
