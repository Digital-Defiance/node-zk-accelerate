/**
 * @digitaldefiance/node-zk-accelerate
 * vDSP Vector Operations Implementation
 *
 * Wraps Apple's vDSP functions for hardware-accelerated vector operations.
 * These operations are used for NTT butterfly computations and other
 * vectorized field arithmetic.
 *
 * Requirements: 6.2, 1.4
 */

#include "../include/cpu_accelerate.h"
#include <cstring>

#ifdef __APPLE__
#include <Accelerate/Accelerate.h>
#endif

/**
 * Vector addition using vDSP: C = A + B
 */
void vdsp_vector_add_f64(const double* a, const double* b, double* c, size_t n) {
#ifdef __APPLE__
    // vDSP_vaddD adds two vectors: C[i] = A[i] + B[i]
    // Parameters: A, stride_A, B, stride_B, C, stride_C, N
    vDSP_vaddD(a, 1, b, 1, c, 1, (vDSP_Length)n);
#else
    // Fallback for non-Apple platforms
    for (size_t i = 0; i < n; i++) {
        c[i] = a[i] + b[i];
    }
#endif
}

/**
 * Vector multiplication using vDSP: C = A * B (element-wise)
 */
void vdsp_vector_mul_f64(const double* a, const double* b, double* c, size_t n) {
#ifdef __APPLE__
    // vDSP_vmulD multiplies two vectors element-wise: C[i] = A[i] * B[i]
    vDSP_vmulD(a, 1, b, 1, c, 1, (vDSP_Length)n);
#else
    // Fallback for non-Apple platforms
    for (size_t i = 0; i < n; i++) {
        c[i] = a[i] * b[i];
    }
#endif
}

/**
 * Vector subtraction using vDSP: C = A - B
 */
void vdsp_vector_sub_f64(const double* a, const double* b, double* c, size_t n) {
#ifdef __APPLE__
    // vDSP_vsubD subtracts vectors: C[i] = A[i] - B[i]
    // Note: vDSP_vsubD computes B - A, so we swap arguments
    vDSP_vsubD(b, 1, a, 1, c, 1, (vDSP_Length)n);
#else
    // Fallback for non-Apple platforms
    for (size_t i = 0; i < n; i++) {
        c[i] = a[i] - b[i];
    }
#endif
}

/**
 * Vector scale using vDSP: B = A * scalar
 */
void vdsp_vector_scale_f64(const double* a, double scalar, double* b, size_t n) {
#ifdef __APPLE__
    // vDSP_vsmulD multiplies vector by scalar: B[i] = A[i] * scalar
    vDSP_vsmulD(a, 1, &scalar, b, 1, (vDSP_Length)n);
#else
    // Fallback for non-Apple platforms
    for (size_t i = 0; i < n; i++) {
        b[i] = a[i] * scalar;
    }
#endif
}

/**
 * Vector multiply-add using vDSP: D = A * B + C
 */
void vdsp_vector_muladd_f64(const double* a, const double* b, const double* c, double* d, size_t n) {
#ifdef __APPLE__
    // vDSP_vmaD computes: D[i] = A[i] * B[i] + C[i]
    vDSP_vmaD(a, 1, b, 1, c, 1, d, 1, (vDSP_Length)n);
#else
    // Fallback for non-Apple platforms
    for (size_t i = 0; i < n; i++) {
        d[i] = a[i] * b[i] + c[i];
    }
#endif
}

/**
 * NTT butterfly operation using vDSP
 *
 * Computes the butterfly operation for NTT:
 *   out_even = in_even + twiddle * in_odd
 *   out_odd  = in_even - twiddle * in_odd
 *
 * For complex twiddle factors (w = w_r + i*w_i) and real field elements,
 * we compute:
 *   t = twiddle_real * in_odd (simplified for real-only case)
 *   out_even = in_even + t
 *   out_odd  = in_even - t
 *
 * Note: For finite field NTT, twiddle factors are field elements, not complex.
 * This function handles the vectorized computation pattern.
 */
void vdsp_ntt_butterfly_f64(
    const double* in_even,
    const double* in_odd,
    const double* twiddle_real,
    const double* twiddle_imag,
    double* out_even,
    double* out_odd,
    size_t n
) {
#ifdef __APPLE__
    // Allocate temporary buffer for twiddle * in_odd
    double* temp = (double*)malloc(n * sizeof(double));
    if (temp == NULL) {
        // Fallback to scalar computation
        for (size_t i = 0; i < n; i++) {
            double t = twiddle_real[i] * in_odd[i];
            out_even[i] = in_even[i] + t;
            out_odd[i] = in_even[i] - t;
        }
        return;
    }

    // Compute t = twiddle_real * in_odd using vDSP
    vDSP_vmulD(twiddle_real, 1, in_odd, 1, temp, 1, (vDSP_Length)n);

    // Compute out_even = in_even + t
    vDSP_vaddD(in_even, 1, temp, 1, out_even, 1, (vDSP_Length)n);

    // Compute out_odd = in_even - t
    vDSP_vsubD(temp, 1, in_even, 1, out_odd, 1, (vDSP_Length)n);

    free(temp);
#else
    // Fallback for non-Apple platforms
    for (size_t i = 0; i < n; i++) {
        double t = twiddle_real[i] * in_odd[i];
        out_even[i] = in_even[i] + t;
        out_odd[i] = in_even[i] - t;
    }
#endif
    
    // Note: twiddle_imag is unused in the real-field case
    // It's included for API compatibility with complex NTT if needed
    (void)twiddle_imag;
}
