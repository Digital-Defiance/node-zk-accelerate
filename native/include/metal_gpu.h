/**
 * @digitaldefiance/node-zk-accelerate
 * Metal GPU acceleration header
 *
 * Requirements: 1.5, 7.1, 7.2, 7.5
 */

#ifndef METAL_GPU_H
#define METAL_GPU_H

#include <cstdint>
#include <cstddef>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * GPU buffer handle
 */
typedef struct {
    void* ptr;           // Native buffer pointer
    size_t size;         // Buffer size in bytes
    uint32_t id;         // Unique buffer ID
    bool is_shared;      // Whether buffer uses shared memory
} GPUBuffer;

/**
 * GPU compute pipeline handle
 */
typedef struct {
    void* pipeline;      // Native pipeline state
    const char* name;    // Shader function name
    uint32_t id;         // Unique pipeline ID
} GPUPipeline;

/**
 * GPU execution result
 */
typedef struct {
    bool success;
    const char* error_message;
    double execution_time_ms;
} GPUResult;

/**
 * Metal GPU status
 */
typedef struct {
    bool initialized;
    bool device_available;
    bool unified_memory;
    int max_threads_per_group;
    int max_buffer_length;
    char device_name[256];
} MetalGPUStatus;

// ============================================================================
// Initialization and Status
// ============================================================================

/**
 * Initialize Metal GPU infrastructure
 * @return true if initialization successful
 */
bool metal_gpu_init(void);

/**
 * Shutdown Metal GPU infrastructure and release resources
 */
void metal_gpu_shutdown(void);

/**
 * Check if Metal GPU is available and initialized
 */
bool metal_gpu_is_available(void);

/**
 * Get Metal GPU status
 */
MetalGPUStatus metal_gpu_get_status(void);

// ============================================================================
// Buffer Management
// ============================================================================

/**
 * Allocate a GPU buffer
 * @param size Buffer size in bytes
 * @param shared Use shared memory (unified memory on Apple Silicon)
 * @return Buffer handle, or NULL on failure
 */
GPUBuffer* metal_gpu_alloc_buffer(size_t size, bool shared);

/**
 * Free a GPU buffer
 */
void metal_gpu_free_buffer(GPUBuffer* buffer);

/**
 * Copy data to GPU buffer
 * @param buffer Target buffer
 * @param data Source data
 * @param size Size in bytes
 * @param offset Offset in buffer
 * @return true on success
 */
bool metal_gpu_copy_to_buffer(GPUBuffer* buffer, const void* data, size_t size, size_t offset);

/**
 * Copy data from GPU buffer
 * @param buffer Source buffer
 * @param data Target data
 * @param size Size in bytes
 * @param offset Offset in buffer
 * @return true on success
 */
bool metal_gpu_copy_from_buffer(GPUBuffer* buffer, void* data, size_t size, size_t offset);

/**
 * Get direct pointer to buffer contents (for unified memory)
 * @param buffer Buffer handle
 * @return Pointer to buffer contents, or NULL if not available
 */
void* metal_gpu_get_buffer_contents(GPUBuffer* buffer);

// ============================================================================
// Shader Compilation and Caching
// ============================================================================

/**
 * Compile a Metal shader from source
 * @param source Metal shader source code
 * @param function_name Entry point function name
 * @return Pipeline handle, or NULL on failure
 */
GPUPipeline* metal_gpu_compile_shader(const char* source, const char* function_name);

/**
 * Get a cached pipeline by name
 * @param name Pipeline/function name
 * @return Pipeline handle, or NULL if not found
 */
GPUPipeline* metal_gpu_get_cached_pipeline(const char* name);

/**
 * Free a pipeline
 */
void metal_gpu_free_pipeline(GPUPipeline* pipeline);

/**
 * Clear shader cache
 */
void metal_gpu_clear_shader_cache(void);

// ============================================================================
// Compute Dispatch
// ============================================================================

/**
 * Dispatch a compute kernel
 * @param pipeline Compute pipeline
 * @param buffers Array of buffer handles
 * @param buffer_count Number of buffers
 * @param grid_size Total number of threads
 * @param group_size Threads per threadgroup
 * @return Execution result
 */
GPUResult metal_gpu_dispatch(
    GPUPipeline* pipeline,
    GPUBuffer** buffers,
    size_t buffer_count,
    size_t grid_size,
    size_t group_size
);

/**
 * Dispatch a compute kernel with 2D grid
 */
GPUResult metal_gpu_dispatch_2d(
    GPUPipeline* pipeline,
    GPUBuffer** buffers,
    size_t buffer_count,
    size_t grid_width,
    size_t grid_height,
    size_t group_width,
    size_t group_height
);

/**
 * Wait for all GPU operations to complete
 */
void metal_gpu_synchronize(void);

// ============================================================================
// MSM-specific operations
// ============================================================================

/**
 * Execute MSM on GPU
 * @param scalars_buffer Buffer containing scalars
 * @param points_buffer Buffer containing points
 * @param result_buffer Buffer for result
 * @param num_points Number of scalar-point pairs
 * @param window_size Pippenger window size
 * @return Execution result
 */
GPUResult metal_gpu_msm(
    GPUBuffer* scalars_buffer,
    GPUBuffer* points_buffer,
    GPUBuffer* result_buffer,
    size_t num_points,
    int window_size
);

// ============================================================================
// NTT-specific operations
// ============================================================================

/**
 * Execute forward NTT on GPU
 * @param data_buffer Buffer containing coefficients (in-place)
 * @param twiddles_buffer Buffer containing twiddle factors
 * @param n NTT size
 * @return Execution result
 */
GPUResult metal_gpu_ntt_forward(
    GPUBuffer* data_buffer,
    GPUBuffer* twiddles_buffer,
    size_t n
);

/**
 * Execute inverse NTT on GPU
 * @param data_buffer Buffer containing values (in-place)
 * @param twiddles_inv_buffer Buffer containing inverse twiddle factors
 * @param n_inv_buffer Buffer containing n^-1
 * @param n NTT size
 * @return Execution result
 */
GPUResult metal_gpu_ntt_inverse(
    GPUBuffer* data_buffer,
    GPUBuffer* twiddles_inv_buffer,
    GPUBuffer* n_inv_buffer,
    size_t n
);

/**
 * Execute batch NTT on GPU
 * @param data_buffer Buffer containing multiple polynomials
 * @param twiddles_buffer Buffer containing twiddle factors
 * @param n NTT size per polynomial
 * @param batch_size Number of polynomials
 * @param forward true for forward NTT, false for inverse
 * @return Execution result
 */
GPUResult metal_gpu_ntt_batch(
    GPUBuffer* data_buffer,
    GPUBuffer* twiddles_buffer,
    size_t n,
    size_t batch_size,
    bool forward
);

#ifdef __cplusplus
}
#endif

#endif /* METAL_GPU_H */
