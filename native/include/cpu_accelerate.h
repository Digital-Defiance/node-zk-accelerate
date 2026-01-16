/**
 * @digitaldefiance/node-zk-accelerate
 * CPU Acceleration Layer Header
 *
 * Provides interfaces for Apple Accelerate framework operations:
 * - vDSP vector operations
 * - BLAS matrix operations
 * - NEON SIMD intrinsics
 * - AMX/SME matrix operations
 *
 * Requirements: 6.2, 6.4, 6.5, 6.6, 1.4
 */

#ifndef CPU_ACCELERATE_H
#define CPU_ACCELERATE_H

#include <cstdint>
#include <cstddef>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * vDSP Vector Operations
 * Requirements: 6.2, 1.4
 */

/**
 * Vector addition using vDSP: C = A + B
 * @param a Input vector A
 * @param b Input vector B
 * @param c Output vector C
 * @param n Number of elements
 */
void vdsp_vector_add_f64(const double* a, const double* b, double* c, size_t n);

/**
 * Vector multiplication using vDSP: C = A * B (element-wise)
 * @param a Input vector A
 * @param b Input vector B
 * @param c Output vector C
 * @param n Number of elements
 */
void vdsp_vector_mul_f64(const double* a, const double* b, double* c, size_t n);

/**
 * Vector subtraction using vDSP: C = A - B
 * @param a Input vector A
 * @param b Input vector B
 * @param c Output vector C
 * @param n Number of elements
 */
void vdsp_vector_sub_f64(const double* a, const double* b, double* c, size_t n);

/**
 * Vector scale using vDSP: B = A * scalar
 * @param a Input vector A
 * @param scalar Scalar value
 * @param b Output vector B
 * @param n Number of elements
 */
void vdsp_vector_scale_f64(const double* a, double scalar, double* b, size_t n);

/**
 * Vector multiply-add using vDSP: D = A * B + C
 * @param a Input vector A
 * @param b Input vector B
 * @param c Input vector C
 * @param d Output vector D
 * @param n Number of elements
 */
void vdsp_vector_muladd_f64(const double* a, const double* b, const double* c, double* d, size_t n);

/**
 * NTT butterfly operation using vDSP
 * Computes: out_even = in_even + twiddle * in_odd
 *           out_odd  = in_even - twiddle * in_odd
 * @param in_even Even-indexed inputs
 * @param in_odd Odd-indexed inputs
 * @param twiddle_real Real part of twiddle factors
 * @param twiddle_imag Imaginary part of twiddle factors
 * @param out_even Even-indexed outputs
 * @param out_odd Odd-indexed outputs
 * @param n Number of butterfly operations
 */
void vdsp_ntt_butterfly_f64(
    const double* in_even,
    const double* in_odd,
    const double* twiddle_real,
    const double* twiddle_imag,
    double* out_even,
    double* out_odd,
    size_t n
);

/**
 * BLAS Matrix Operations (AMX acceleration)
 * Requirements: 6.4, 2.7
 */

/**
 * Matrix-matrix multiplication using BLAS: C = alpha * A * B + beta * C
 * Uses dgemm which leverages AMX on Apple Silicon
 * @param a Matrix A (m x k)
 * @param b Matrix B (k x n)
 * @param c Matrix C (m x n), also output
 * @param m Rows of A and C
 * @param n Columns of B and C
 * @param k Columns of A, rows of B
 * @param alpha Scalar multiplier for A*B
 * @param beta Scalar multiplier for C
 */
void blas_matrix_mul_f64(
    const double* a,
    const double* b,
    double* c,
    int m,
    int n,
    int k,
    double alpha,
    double beta
);

/**
 * Matrix-vector multiplication using BLAS: y = alpha * A * x + beta * y
 * @param a Matrix A (m x n)
 * @param x Vector x (n elements)
 * @param y Vector y (m elements), also output
 * @param m Rows of A
 * @param n Columns of A
 * @param alpha Scalar multiplier for A*x
 * @param beta Scalar multiplier for y
 */
void blas_matrix_vector_mul_f64(
    const double* a,
    const double* x,
    double* y,
    int m,
    int n,
    double alpha,
    double beta
);

/**
 * Bucket accumulation for MSM using BLAS
 * Accumulates points into buckets using matrix operations
 * @param bucket_indices Array of bucket indices for each point
 * @param point_coords Point coordinates (x, y, z for Jacobian)
 * @param bucket_accum Accumulated bucket values (output)
 * @param num_points Number of points
 * @param num_buckets Number of buckets
 * @param coord_size Size of each coordinate (limbs)
 */
void blas_bucket_accumulate(
    const uint32_t* bucket_indices,
    const double* point_coords,
    double* bucket_accum,
    size_t num_points,
    size_t num_buckets,
    size_t coord_size
);

/**
 * NEON SIMD Operations
 * Requirements: 1.4, 4.6, 6.6
 */

/**
 * Check if NEON is available at runtime
 */
bool neon_available(void);

/**
 * Montgomery multiplication using NEON for 4-limb elements (BN254)
 * @param a First operand (4 limbs)
 * @param b Second operand (4 limbs)
 * @param modulus Field modulus (4 limbs)
 * @param mu Montgomery constant mu = -p^(-1) mod 2^64
 * @param result Output (4 limbs)
 */
void neon_montgomery_mul_4limb(
    const uint64_t* a,
    const uint64_t* b,
    const uint64_t* modulus,
    uint64_t mu,
    uint64_t* result
);

/**
 * Montgomery multiplication using NEON for 6-limb elements (BLS12-381)
 * @param a First operand (6 limbs)
 * @param b Second operand (6 limbs)
 * @param modulus Field modulus (6 limbs)
 * @param mu Montgomery constant mu = -p^(-1) mod 2^64
 * @param result Output (6 limbs)
 */
void neon_montgomery_mul_6limb(
    const uint64_t* a,
    const uint64_t* b,
    const uint64_t* modulus,
    uint64_t mu,
    uint64_t* result
);

/**
 * Batch Montgomery multiplication using NEON
 * @param a Array of first operands
 * @param b Array of second operands
 * @param modulus Field modulus
 * @param mu Montgomery constant
 * @param results Output array
 * @param count Number of multiplications
 * @param limb_count Number of limbs per element (4 or 6)
 */
void neon_batch_montgomery_mul(
    const uint64_t* a,
    const uint64_t* b,
    const uint64_t* modulus,
    uint64_t mu,
    uint64_t* results,
    size_t count,
    int limb_count
);

/**
 * SME Matrix Operations (M4 Experimental)
 * Requirements: 6.5, 2.8, 9.1
 */

/**
 * Check if SME is available at runtime
 */
bool sme_available(void);

/**
 * SME matrix outer product for bucket accumulation
 * Experimental feature for M4 chips
 * @param scalars Scalar values
 * @param points Point coordinates
 * @param buckets Output bucket accumulation
 * @param num_scalars Number of scalars
 * @param num_buckets Number of buckets
 * @param window_size Bits per window
 * @returns true if SME was used, false if fallback was used
 */
bool sme_bucket_outer_product(
    const uint64_t* scalars,
    const double* points,
    double* buckets,
    size_t num_scalars,
    size_t num_buckets,
    int window_size
);

/**
 * SME matrix accumulation with fallback
 * @param a Matrix A
 * @param b Matrix B
 * @param c Output matrix C
 * @param m Rows
 * @param n Columns
 * @param k Inner dimension
 * @returns true if SME was used, false if fallback was used
 */
bool sme_matrix_accumulate(
    const double* a,
    const double* b,
    double* c,
    int m,
    int n,
    int k
);

/**
 * CPU Accelerator Status
 */
typedef struct {
    bool vdsp_available;
    bool blas_available;
    bool neon_available;
    bool amx_available;
    bool sme_available;
} CPUAcceleratorStatus;

/**
 * Get CPU accelerator status
 */
CPUAcceleratorStatus get_cpu_accelerator_status(void);

#ifdef __cplusplus
}
#endif

#endif /* CPU_ACCELERATE_H */
