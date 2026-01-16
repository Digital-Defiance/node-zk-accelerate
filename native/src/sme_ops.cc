/**
 * @digitaldefiance/node-zk-accelerate
 * SME (Scalable Matrix Extension) Operations
 *
 * Implements experimental SME matrix operations for M4 chips.
 * SME provides hardware-accelerated matrix outer products that
 * can be used for MSM bucket accumulation.
 *
 * Note: SME is only available on M4 and later Apple Silicon chips.
 * This implementation includes fallback to BLAS/AMX when SME is unavailable.
 *
 * Requirements: 6.5, 2.8, 9.1
 */

#include "../include/cpu_accelerate.h"
#include "../include/zk_accelerate.h"
#include <cstring>
#include <cstdlib>

#ifdef __APPLE__
#include <Accelerate/Accelerate.h>
#endif

// SME is available on M4+ chips with ARM SME extension
// Detection is done at runtime via sysctl
static bool g_sme_checked = false;
static bool g_sme_available = false;

/**
 * Check if SME is available at runtime
 *
 * SME (Scalable Matrix Extension) is available on M4 and later chips.
 * We detect this by checking the hw.optional.arm.FEAT_SME sysctl.
 */
bool sme_available(void) {
    if (g_sme_checked) {
        return g_sme_available;
    }
    
    g_sme_checked = true;
    g_sme_available = has_sme_support();
    
    return g_sme_available;
}

/**
 * SME matrix outer product for bucket accumulation
 *
 * This function uses SME's matrix outer product instructions to
 * efficiently accumulate points into buckets for MSM.
 *
 * The outer product approach:
 * - Create a scalar-to-bucket mapping matrix
 * - Use SME outer product to compute bucket contributions
 * - Accumulate results into bucket array
 *
 * Fallback: Uses BLAS dgemm (which uses AMX) when SME is unavailable.
 *
 * @param scalars Scalar values (as 64-bit integers)
 * @param points Point coordinates (flattened array)
 * @param buckets Output bucket accumulation
 * @param num_scalars Number of scalars/points
 * @param num_buckets Number of buckets per window
 * @param window_size Bits per window for bucket indexing
 * @returns true if SME was used, false if fallback was used
 */
bool sme_bucket_outer_product(
    const uint64_t* scalars,
    const double* points,
    double* buckets,
    size_t num_scalars,
    size_t num_buckets,
    int window_size
) {
    // Currently, direct SME intrinsics are not available in standard toolchains
    // We use BLAS as the implementation, which leverages AMX on Apple Silicon
    // and will automatically use SME when available through Accelerate framework
    
    // The Accelerate framework on macOS automatically uses the best available
    // hardware acceleration (AMX on M1-M3, SME on M4+)
    
#ifdef __APPLE__
    // Create indicator matrix for bucket assignment
    // indicator[i][j] = 1 if scalar i maps to bucket j
    size_t indicator_size = num_scalars * num_buckets;
    double* indicator = (double*)calloc(indicator_size, sizeof(double));
    
    if (indicator == NULL) {
        return false;
    }
    
    // Fill indicator matrix based on scalar window bits
    uint64_t bucket_mask = (1ULL << window_size) - 1;
    for (size_t i = 0; i < num_scalars; i++) {
        uint64_t bucket_idx = scalars[i] & bucket_mask;
        if (bucket_idx > 0 && bucket_idx <= num_buckets) {
            // Bucket indices are 1-based in scalars, 0-based in array
            indicator[i * num_buckets + (bucket_idx - 1)] = 1.0;
        }
    }
    
    // Assume points has 3 coordinates per point (Jacobian: x, y, z)
    // Each coordinate has some number of limbs represented as doubles
    // For simplicity, we treat each point as a single value here
    // In practice, this would be expanded to handle full coordinates
    
    // Use BLAS to compute: buckets = indicator^T * points
    // This leverages AMX/SME through Accelerate framework
    cblas_dgemv(
        CblasRowMajor,
        CblasTrans,
        (int)num_scalars,
        (int)num_buckets,
        1.0,
        indicator,
        (int)num_buckets,
        points,  // Simplified: treating points as 1D
        1,
        1.0,     // Add to existing bucket values
        buckets,
        1
    );
    
    free(indicator);
    
    // Return true to indicate hardware acceleration was used
    // (AMX on M1-M3, SME on M4+ via Accelerate)
    return sme_available();
#else
    // Non-Apple fallback: direct accumulation
    uint64_t bucket_mask = (1ULL << window_size) - 1;
    for (size_t i = 0; i < num_scalars; i++) {
        uint64_t bucket_idx = scalars[i] & bucket_mask;
        if (bucket_idx > 0 && bucket_idx <= num_buckets) {
            buckets[bucket_idx - 1] += points[i];
        }
    }
    return false;
#endif
}

/**
 * SME matrix accumulation with fallback
 *
 * Performs matrix multiplication C = A * B using SME when available,
 * falling back to BLAS (AMX) otherwise.
 *
 * This is marked as experimental because:
 * 1. SME is only available on M4+ chips
 * 2. Direct SME intrinsics require special compiler support
 * 3. The Accelerate framework may not fully expose SME capabilities yet
 *
 * @param a Matrix A (m x k)
 * @param b Matrix B (k x n)
 * @param c Output matrix C (m x n)
 * @param m Rows of A and C
 * @param n Columns of B and C
 * @param k Columns of A, rows of B
 * @returns true if SME was used, false if fallback was used
 */
bool sme_matrix_accumulate(
    const double* a,
    const double* b,
    double* c,
    int m,
    int n,
    int k
) {
#ifdef __APPLE__
    // Use BLAS dgemm which automatically uses the best available
    // hardware acceleration (AMX on M1-M3, SME on M4+)
    cblas_dgemm(
        CblasRowMajor,
        CblasNoTrans,
        CblasNoTrans,
        m,
        n,
        k,
        1.0,    // alpha
        a,
        k,      // lda
        b,
        n,      // ldb
        1.0,    // beta (accumulate)
        c,
        n       // ldc
    );
    
    // Return whether SME is available
    // The actual hardware used depends on the chip
    return sme_available();
#else
    // Fallback: naive matrix multiplication
    for (int i = 0; i < m; i++) {
        for (int j = 0; j < n; j++) {
            double sum = 0.0;
            for (int p = 0; p < k; p++) {
                sum += a[i * k + p] * b[p * n + j];
            }
            c[i * n + j] += sum;
        }
    }
    return false;
#endif
}

/**
 * Get CPU accelerator status
 *
 * Returns information about which CPU acceleration features are available.
 */
CPUAcceleratorStatus get_cpu_accelerator_status(void) {
    CPUAcceleratorStatus status;
    
#ifdef __APPLE__
    status.vdsp_available = true;
    status.blas_available = true;
    status.amx_available = has_amx_support();
#else
    status.vdsp_available = false;
    status.blas_available = false;
    status.amx_available = false;
#endif
    
    status.neon_available = neon_available();
    status.sme_available = sme_available();
    
    return status;
}
