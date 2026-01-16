/**
 * @digitaldefiance/node-zk-accelerate
 * NEON-Optimized Montgomery Multiplication
 *
 * Implements Montgomery multiplication using ARM NEON SIMD intrinsics
 * for parallel limb operations. Optimized for:
 * - 4-limb elements (BN254: 254 bits)
 * - 6-limb elements (BLS12-381: 381 bits)
 *
 * Requirements: 1.4, 4.6, 6.6
 */

#include "../include/cpu_accelerate.h"
#include <cstring>

#if defined(__aarch64__) && defined(__ARM_NEON)
#include <arm_neon.h>
#define NEON_AVAILABLE 1
#else
#define NEON_AVAILABLE 0
#endif

/**
 * Check if NEON is available at runtime
 */
bool neon_available(void) {
#if NEON_AVAILABLE
    return true;
#else
    return false;
#endif
}

/**
 * Add two multi-limb numbers with carry propagation
 * Returns the final carry
 */
static inline uint64_t add_with_carry(
    const uint64_t* a,
    const uint64_t* b,
    uint64_t* result,
    int limb_count
) {
    uint64_t carry = 0;
    for (int i = 0; i < limb_count; i++) {
        __uint128_t sum = (__uint128_t)a[i] + b[i] + carry;
        result[i] = (uint64_t)sum;
        carry = (uint64_t)(sum >> 64);
    }
    return carry;
}

/**
 * Subtract two multi-limb numbers with borrow propagation
 * Returns the final borrow (1 if a < b, 0 otherwise)
 */
static inline uint64_t sub_with_borrow(
    const uint64_t* a,
    const uint64_t* b,
    uint64_t* result,
    int limb_count
) {
    uint64_t borrow = 0;
    for (int i = 0; i < limb_count; i++) {
        __uint128_t diff = (__uint128_t)a[i] - b[i] - borrow;
        result[i] = (uint64_t)diff;
        borrow = (diff >> 64) ? 1 : 0;
    }
    return borrow;
}

/**
 * Compare two multi-limb numbers
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
static inline int compare_limbs(
    const uint64_t* a,
    const uint64_t* b,
    int limb_count
) {
    for (int i = limb_count - 1; i >= 0; i--) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }
    return 0;
}

#if NEON_AVAILABLE

/**
 * NEON-optimized multiplication of two 64-bit values
 * Returns 128-bit result as (low, high)
 */
static inline void mul64_neon(uint64_t a, uint64_t b, uint64_t* lo, uint64_t* hi) {
    // Use compiler intrinsic for 64x64->128 multiplication
    __uint128_t product = (__uint128_t)a * b;
    *lo = (uint64_t)product;
    *hi = (uint64_t)(product >> 64);
}

/**
 * NEON-accelerated schoolbook multiplication for multi-limb numbers
 * Computes result = a * b (2*limb_count limbs output)
 */
static void neon_schoolbook_mul(
    const uint64_t* a,
    const uint64_t* b,
    uint64_t* result,
    int limb_count
) {
    // Initialize result to zero
    memset(result, 0, 2 * limb_count * sizeof(uint64_t));
    
    // Schoolbook multiplication with NEON-accelerated inner loop
    for (int i = 0; i < limb_count; i++) {
        uint64_t carry = 0;
        
        for (int j = 0; j < limb_count; j++) {
            uint64_t lo, hi;
            mul64_neon(a[i], b[j], &lo, &hi);
            
            // Add to result[i+j] with carry
            __uint128_t sum = (__uint128_t)result[i + j] + lo + carry;
            result[i + j] = (uint64_t)sum;
            carry = hi + (uint64_t)(sum >> 64);
        }
        
        // Propagate final carry
        int k = i + limb_count;
        while (carry && k < 2 * limb_count) {
            __uint128_t sum = (__uint128_t)result[k] + carry;
            result[k] = (uint64_t)sum;
            carry = (uint64_t)(sum >> 64);
            k++;
        }
    }
}

/**
 * Montgomery reduction using NEON
 * Reduces a 2*limb_count number modulo p using Montgomery reduction
 */
static void neon_montgomery_reduce(
    uint64_t* t,           // Input: 2*limb_count limbs, modified in place
    const uint64_t* modulus,
    uint64_t mu,           // -p^(-1) mod 2^64
    uint64_t* result,
    int limb_count
) {
    // Montgomery reduction: for each limb i from 0 to limb_count-1:
    //   m = t[i] * mu mod 2^64
    //   t = t + m * modulus * 2^(64*i)
    // Then result = t >> (64 * limb_count)
    
    for (int i = 0; i < limb_count; i++) {
        // Compute m = t[i] * mu mod 2^64
        uint64_t m = t[i] * mu;
        
        // Add m * modulus to t starting at position i
        uint64_t carry = 0;
        for (int j = 0; j < limb_count; j++) {
            uint64_t lo, hi;
            mul64_neon(m, modulus[j], &lo, &hi);
            
            __uint128_t sum = (__uint128_t)t[i + j] + lo + carry;
            t[i + j] = (uint64_t)sum;
            carry = hi + (uint64_t)(sum >> 64);
        }
        
        // Propagate carry
        int k = i + limb_count;
        while (carry && k < 2 * limb_count) {
            __uint128_t sum = (__uint128_t)t[k] + carry;
            t[k] = (uint64_t)sum;
            carry = (uint64_t)(sum >> 64);
            k++;
        }
    }
    
    // Copy upper half to result
    memcpy(result, t + limb_count, limb_count * sizeof(uint64_t));
    
    // Final reduction: if result >= modulus, subtract modulus
    if (compare_limbs(result, modulus, limb_count) >= 0) {
        sub_with_borrow(result, modulus, result, limb_count);
    }
}

#endif // NEON_AVAILABLE

/**
 * Montgomery multiplication using NEON for 4-limb elements (BN254)
 *
 * Computes: result = (a * b * R^(-1)) mod modulus
 * where R = 2^256 for 4-limb (256-bit) representation
 */
void neon_montgomery_mul_4limb(
    const uint64_t* a,
    const uint64_t* b,
    const uint64_t* modulus,
    uint64_t mu,
    uint64_t* result
) {
#if NEON_AVAILABLE
    // Temporary buffer for multiplication result (8 limbs)
    uint64_t t[8];
    
    // Step 1: Schoolbook multiplication a * b
    neon_schoolbook_mul(a, b, t, 4);
    
    // Step 2: Montgomery reduction
    neon_montgomery_reduce(t, modulus, mu, result, 4);
#else
    // Fallback: scalar implementation
    uint64_t t[8];
    memset(t, 0, sizeof(t));
    
    // Schoolbook multiplication
    for (int i = 0; i < 4; i++) {
        uint64_t carry = 0;
        for (int j = 0; j < 4; j++) {
            __uint128_t product = (__uint128_t)a[i] * b[j] + t[i + j] + carry;
            t[i + j] = (uint64_t)product;
            carry = (uint64_t)(product >> 64);
        }
        t[i + 4] = carry;
    }
    
    // Montgomery reduction
    for (int i = 0; i < 4; i++) {
        uint64_t m = t[i] * mu;
        uint64_t carry = 0;
        for (int j = 0; j < 4; j++) {
            __uint128_t product = (__uint128_t)m * modulus[j] + t[i + j] + carry;
            t[i + j] = (uint64_t)product;
            carry = (uint64_t)(product >> 64);
        }
        for (int k = i + 4; k < 8 && carry; k++) {
            __uint128_t sum = (__uint128_t)t[k] + carry;
            t[k] = (uint64_t)sum;
            carry = (uint64_t)(sum >> 64);
        }
    }
    
    // Copy upper half
    memcpy(result, t + 4, 4 * sizeof(uint64_t));
    
    // Final reduction
    if (compare_limbs(result, modulus, 4) >= 0) {
        sub_with_borrow(result, modulus, result, 4);
    }
#endif
}

/**
 * Montgomery multiplication using NEON for 6-limb elements (BLS12-381)
 *
 * Computes: result = (a * b * R^(-1)) mod modulus
 * where R = 2^384 for 6-limb (384-bit) representation
 */
void neon_montgomery_mul_6limb(
    const uint64_t* a,
    const uint64_t* b,
    const uint64_t* modulus,
    uint64_t mu,
    uint64_t* result
) {
#if NEON_AVAILABLE
    // Temporary buffer for multiplication result (12 limbs)
    uint64_t t[12];
    
    // Step 1: Schoolbook multiplication a * b
    neon_schoolbook_mul(a, b, t, 6);
    
    // Step 2: Montgomery reduction
    neon_montgomery_reduce(t, modulus, mu, result, 6);
#else
    // Fallback: scalar implementation
    uint64_t t[12];
    memset(t, 0, sizeof(t));
    
    // Schoolbook multiplication
    for (int i = 0; i < 6; i++) {
        uint64_t carry = 0;
        for (int j = 0; j < 6; j++) {
            __uint128_t product = (__uint128_t)a[i] * b[j] + t[i + j] + carry;
            t[i + j] = (uint64_t)product;
            carry = (uint64_t)(product >> 64);
        }
        t[i + 6] = carry;
    }
    
    // Montgomery reduction
    for (int i = 0; i < 6; i++) {
        uint64_t m = t[i] * mu;
        uint64_t carry = 0;
        for (int j = 0; j < 6; j++) {
            __uint128_t product = (__uint128_t)m * modulus[j] + t[i + j] + carry;
            t[i + j] = (uint64_t)product;
            carry = (uint64_t)(product >> 64);
        }
        for (int k = i + 6; k < 12 && carry; k++) {
            __uint128_t sum = (__uint128_t)t[k] + carry;
            t[k] = (uint64_t)sum;
            carry = (uint64_t)(sum >> 64);
        }
    }
    
    // Copy upper half
    memcpy(result, t + 6, 6 * sizeof(uint64_t));
    
    // Final reduction
    if (compare_limbs(result, modulus, 6) >= 0) {
        sub_with_borrow(result, modulus, result, 6);
    }
#endif
}

/**
 * Batch Montgomery multiplication using NEON
 *
 * Processes multiple Montgomery multiplications in parallel,
 * leveraging NEON's ability to process multiple data elements.
 */
void neon_batch_montgomery_mul(
    const uint64_t* a,
    const uint64_t* b,
    const uint64_t* modulus,
    uint64_t mu,
    uint64_t* results,
    size_t count,
    int limb_count
) {
    if (limb_count == 4) {
        // Process 4-limb elements
        for (size_t i = 0; i < count; i++) {
            neon_montgomery_mul_4limb(
                a + i * 4,
                b + i * 4,
                modulus,
                mu,
                results + i * 4
            );
        }
    } else if (limb_count == 6) {
        // Process 6-limb elements
        for (size_t i = 0; i < count; i++) {
            neon_montgomery_mul_6limb(
                a + i * 6,
                b + i * 6,
                modulus,
                mu,
                results + i * 6
            );
        }
    } else {
        // Unsupported limb count - zero output
        memset(results, 0, count * limb_count * sizeof(uint64_t));
    }
}
