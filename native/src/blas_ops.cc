/**
 * @digitaldefiance/node-zk-accelerate
 * BLAS Matrix Operations Implementation
 *
 * Wraps Apple's BLAS functions (via Accelerate framework) for
 * hardware-accelerated matrix operations. On Apple Silicon, BLAS
 * operations automatically leverage AMX (Apple Matrix Coprocessor).
 *
 * Requirements: 6.4, 2.7
 */

#include "../include/cpu_accelerate.h"
#include <cstring>
#include <cstdlib>

#ifdef __APPLE__
#include <Accelerate/Accelerate.h>
#endif

/**
 * Matrix-matrix multiplication using BLAS: C = alpha * A * B + beta * C
 *
 * Uses cblas_dgemm which leverages AMX on Apple Silicon for
 * hardware-accelerated matrix multiplication.
 *
 * Matrix layout: Row-major (C-style)
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
) {
#ifdef __APPLE__
    // cblas_dgemm performs: C = alpha * op(A) * op(B) + beta * C
    // CblasRowMajor: matrices are stored in row-major order
    // CblasNoTrans: don't transpose A or B
    // m: rows of A and C
    // n: columns of B and C
    // k: columns of A, rows of B
    // lda: leading dimension of A (= k for row-major, no-trans)
    // ldb: leading dimension of B (= n for row-major, no-trans)
    // ldc: leading dimension of C (= n for row-major)
    cblas_dgemm(
        CblasRowMajor,  // Matrix storage order
        CblasNoTrans,   // Don't transpose A
        CblasNoTrans,   // Don't transpose B
        m,              // Rows of A and C
        n,              // Columns of B and C
        k,              // Columns of A, rows of B
        alpha,          // Scalar for A*B
        a,              // Matrix A
        k,              // Leading dimension of A
        b,              // Matrix B
        n,              // Leading dimension of B
        beta,           // Scalar for C
        c,              // Matrix C (output)
        n               // Leading dimension of C
    );
#else
    // Fallback: naive matrix multiplication
    // First scale C by beta
    for (int i = 0; i < m * n; i++) {
        c[i] *= beta;
    }
    
    // Then add alpha * A * B
    for (int i = 0; i < m; i++) {
        for (int j = 0; j < n; j++) {
            double sum = 0.0;
            for (int p = 0; p < k; p++) {
                sum += a[i * k + p] * b[p * n + j];
            }
            c[i * n + j] += alpha * sum;
        }
    }
#endif
}

/**
 * Matrix-vector multiplication using BLAS: y = alpha * A * x + beta * y
 *
 * Uses cblas_dgemv which leverages AMX on Apple Silicon.
 */
void blas_matrix_vector_mul_f64(
    const double* a,
    const double* x,
    double* y,
    int m,
    int n,
    double alpha,
    double beta
) {
#ifdef __APPLE__
    // cblas_dgemv performs: y = alpha * A * x + beta * y
    cblas_dgemv(
        CblasRowMajor,  // Matrix storage order
        CblasNoTrans,   // Don't transpose A
        m,              // Rows of A
        n,              // Columns of A
        alpha,          // Scalar for A*x
        a,              // Matrix A
        n,              // Leading dimension of A
        x,              // Vector x
        1,              // Stride of x
        beta,           // Scalar for y
        y,              // Vector y (output)
        1               // Stride of y
    );
#else
    // Fallback: naive matrix-vector multiplication
    for (int i = 0; i < m; i++) {
        double sum = 0.0;
        for (int j = 0; j < n; j++) {
            sum += a[i * n + j] * x[j];
        }
        y[i] = alpha * sum + beta * y[i];
    }
#endif
}

/**
 * Bucket accumulation for MSM using BLAS
 *
 * This function accumulates curve points into buckets for Pippenger's
 * algorithm. It uses matrix operations to batch the accumulation,
 * leveraging AMX for acceleration.
 *
 * The approach:
 * 1. Create a sparse indicator matrix M where M[i][j] = 1 if point i
 *    goes into bucket j
 * 2. Use matrix multiplication to accumulate: buckets = M^T * points
 *
 * For efficiency, we use a dense representation when the number of
 * buckets is small, and sparse operations otherwise.
 */
void blas_bucket_accumulate(
    const uint32_t* bucket_indices,
    const double* point_coords,
    double* bucket_accum,
    size_t num_points,
    size_t num_buckets,
    size_t coord_size
) {
    // For small bucket counts, use dense matrix multiplication
    // This leverages AMX effectively
    if (num_buckets <= 1024 && num_points <= 4096) {
#ifdef __APPLE__
        // Create indicator matrix (num_points x num_buckets)
        double* indicator = (double*)calloc(num_points * num_buckets, sizeof(double));
        if (indicator == NULL) {
            goto fallback;
        }
        
        // Fill indicator matrix
        for (size_t i = 0; i < num_points; i++) {
            uint32_t bucket = bucket_indices[i];
            if (bucket < num_buckets) {
                indicator[i * num_buckets + bucket] = 1.0;
            }
        }
        
        // For each coordinate dimension, accumulate using matrix multiplication
        // bucket_accum[bucket][coord] = sum over points where bucket_indices[point] == bucket
        //                               of point_coords[point][coord]
        // This is: bucket_accum = indicator^T * point_coords
        
        for (size_t c = 0; c < coord_size; c++) {
            // Extract column c from point_coords into a temporary vector
            double* point_col = (double*)malloc(num_points * sizeof(double));
            double* bucket_col = (double*)malloc(num_buckets * sizeof(double));
            
            if (point_col == NULL || bucket_col == NULL) {
                free(point_col);
                free(bucket_col);
                free(indicator);
                goto fallback;
            }
            
            for (size_t i = 0; i < num_points; i++) {
                point_col[i] = point_coords[i * coord_size + c];
            }
            
            // Initialize bucket column to zero
            memset(bucket_col, 0, num_buckets * sizeof(double));
            
            // Compute bucket_col = indicator^T * point_col
            // This is a matrix-vector multiply with transposed indicator
            cblas_dgemv(
                CblasRowMajor,
                CblasTrans,         // Transpose indicator
                (int)num_points,    // Rows of indicator
                (int)num_buckets,   // Columns of indicator
                1.0,                // alpha
                indicator,
                (int)num_buckets,   // Leading dimension
                point_col,
                1,
                0.0,                // beta
                bucket_col,
                1
            );
            
            // Copy result to bucket_accum
            for (size_t b = 0; b < num_buckets; b++) {
                bucket_accum[b * coord_size + c] += bucket_col[b];
            }
            
            free(point_col);
            free(bucket_col);
        }
        
        free(indicator);
        return;
#endif
    }
    
fallback:
    // Fallback: direct accumulation (still efficient for sparse cases)
    for (size_t i = 0; i < num_points; i++) {
        uint32_t bucket = bucket_indices[i];
        if (bucket < num_buckets) {
            for (size_t c = 0; c < coord_size; c++) {
                bucket_accum[bucket * coord_size + c] += point_coords[i * coord_size + c];
            }
        }
    }
}
