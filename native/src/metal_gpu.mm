/**
 * @digitaldefiance/node-zk-accelerate
 * Metal GPU acceleration implementation
 *
 * Requirements: 1.5, 7.1, 7.2, 7.5
 */

#ifdef __APPLE__

#import <Metal/Metal.h>
#import <Foundation/Foundation.h>
#include "../include/metal_gpu.h"
#include <unordered_map>
#include <string>
#include <mutex>
#include <atomic>

// ============================================================================
// Global State
// ============================================================================

static id<MTLDevice> g_device = nil;
static id<MTLCommandQueue> g_command_queue = nil;
static id<MTLLibrary> g_default_library = nil;
static std::unordered_map<std::string, GPUPipeline*> g_pipeline_cache;
static std::mutex g_cache_mutex;
static std::atomic<uint32_t> g_buffer_id_counter{0};
static std::atomic<uint32_t> g_pipeline_id_counter{0};
static bool g_initialized = false;

// ============================================================================
// Debug Logging
// ============================================================================

static void debug_log(const char* format, ...) {
    const char* debug_env = getenv("ZK_ACCELERATE_DEBUG");
    if (debug_env && (strcmp(debug_env, "1") == 0 || strcmp(debug_env, "true") == 0)) {
        va_list args;
        va_start(args, format);
        fprintf(stderr, "[zk-accelerate:metal] ");
        vfprintf(stderr, format, args);
        fprintf(stderr, "\n");
        va_end(args);
    }
}

// ============================================================================
// Initialization and Status
// ============================================================================

bool metal_gpu_init(void) {
    if (g_initialized) {
        return true;
    }
    
    @autoreleasepool {
        // Get default Metal device
        g_device = MTLCreateSystemDefaultDevice();
        if (g_device == nil) {
            debug_log("Failed to create Metal device");
            return false;
        }
        
        // Create command queue
        g_command_queue = [g_device newCommandQueue];
        if (g_command_queue == nil) {
            debug_log("Failed to create command queue");
            g_device = nil;
            return false;
        }
        
        // Try to load default library (compiled shaders)
        NSError* error = nil;
        g_default_library = [g_device newDefaultLibrary];
        if (g_default_library == nil) {
            debug_log("No default library found (shaders will be compiled at runtime)");
        }
        
        g_initialized = true;
        debug_log("Metal GPU initialized: %s", [[g_device name] UTF8String]);
        debug_log("Unified memory: %s", [g_device hasUnifiedMemory] ? "yes" : "no");
        debug_log("Max threads per threadgroup: %lu", (unsigned long)[g_device maxThreadsPerThreadgroup].width);
        
        return true;
    }
}

void metal_gpu_shutdown(void) {
    if (!g_initialized) {
        return;
    }
    
    @autoreleasepool {
        // Clear pipeline cache
        metal_gpu_clear_shader_cache();
        
        // Release resources
        g_default_library = nil;
        g_command_queue = nil;
        g_device = nil;
        g_initialized = false;
        
        debug_log("Metal GPU shutdown complete");
    }
}

bool metal_gpu_is_available(void) {
    if (!g_initialized) {
        return metal_gpu_init();
    }
    return g_device != nil;
}

MetalGPUStatus metal_gpu_get_status(void) {
    MetalGPUStatus status = {};
    
    if (!metal_gpu_is_available()) {
        status.initialized = false;
        status.device_available = false;
        return status;
    }
    
    @autoreleasepool {
        status.initialized = g_initialized;
        status.device_available = (g_device != nil);
        status.unified_memory = [g_device hasUnifiedMemory];
        status.max_threads_per_group = (int)[g_device maxThreadsPerThreadgroup].width;
        status.max_buffer_length = (int)[g_device maxBufferLength];
        
        NSString* name = [g_device name];
        if (name != nil) {
            strncpy(status.device_name, [name UTF8String], sizeof(status.device_name) - 1);
            status.device_name[sizeof(status.device_name) - 1] = '\0';
        }
    }
    
    return status;
}

// ============================================================================
// Buffer Management
// ============================================================================

GPUBuffer* metal_gpu_alloc_buffer(size_t size, bool shared) {
    if (!metal_gpu_is_available() || size == 0) {
        return nullptr;
    }
    
    @autoreleasepool {
        MTLResourceOptions options;
        if (shared && [g_device hasUnifiedMemory]) {
            // Use shared memory for unified memory architecture
            options = MTLResourceStorageModeShared;
        } else {
            // Use private memory for discrete GPU or when shared not requested
            options = MTLResourceStorageModeShared; // Always use shared on Apple Silicon
        }
        
        id<MTLBuffer> mtl_buffer = [g_device newBufferWithLength:size options:options];
        if (mtl_buffer == nil) {
            debug_log("Failed to allocate buffer of size %zu", size);
            return nullptr;
        }
        
        GPUBuffer* buffer = new GPUBuffer();
        buffer->ptr = (__bridge_retained void*)mtl_buffer;
        buffer->size = size;
        buffer->id = g_buffer_id_counter.fetch_add(1);
        buffer->is_shared = shared;
        
        debug_log("Allocated buffer %u: %zu bytes, shared=%d", buffer->id, size, shared);
        
        return buffer;
    }
}

void metal_gpu_free_buffer(GPUBuffer* buffer) {
    if (buffer == nullptr) {
        return;
    }
    
    @autoreleasepool {
        if (buffer->ptr != nullptr) {
            id<MTLBuffer> mtl_buffer = (__bridge_transfer id<MTLBuffer>)buffer->ptr;
            mtl_buffer = nil; // Release
        }
        
        debug_log("Freed buffer %u", buffer->id);
        delete buffer;
    }
}

bool metal_gpu_copy_to_buffer(GPUBuffer* buffer, const void* data, size_t size, size_t offset) {
    if (buffer == nullptr || data == nullptr || buffer->ptr == nullptr) {
        return false;
    }
    
    if (offset + size > buffer->size) {
        debug_log("Copy to buffer %u: size %zu + offset %zu exceeds buffer size %zu",
                  buffer->id, size, offset, buffer->size);
        return false;
    }
    
    @autoreleasepool {
        id<MTLBuffer> mtl_buffer = (__bridge id<MTLBuffer>)buffer->ptr;
        void* contents = [mtl_buffer contents];
        if (contents == nullptr) {
            return false;
        }
        
        memcpy((uint8_t*)contents + offset, data, size);
        return true;
    }
}

bool metal_gpu_copy_from_buffer(GPUBuffer* buffer, void* data, size_t size, size_t offset) {
    if (buffer == nullptr || data == nullptr || buffer->ptr == nullptr) {
        return false;
    }
    
    if (offset + size > buffer->size) {
        debug_log("Copy from buffer %u: size %zu + offset %zu exceeds buffer size %zu",
                  buffer->id, size, offset, buffer->size);
        return false;
    }
    
    @autoreleasepool {
        id<MTLBuffer> mtl_buffer = (__bridge id<MTLBuffer>)buffer->ptr;
        void* contents = [mtl_buffer contents];
        if (contents == nullptr) {
            return false;
        }
        
        memcpy(data, (uint8_t*)contents + offset, size);
        return true;
    }
}

void* metal_gpu_get_buffer_contents(GPUBuffer* buffer) {
    if (buffer == nullptr || buffer->ptr == nullptr) {
        return nullptr;
    }
    
    @autoreleasepool {
        id<MTLBuffer> mtl_buffer = (__bridge id<MTLBuffer>)buffer->ptr;
        return [mtl_buffer contents];
    }
}

// ============================================================================
// Shader Compilation and Caching
// ============================================================================

GPUPipeline* metal_gpu_compile_shader(const char* source, const char* function_name) {
    if (!metal_gpu_is_available() || source == nullptr || function_name == nullptr) {
        return nullptr;
    }
    
    // Check cache first
    {
        std::lock_guard<std::mutex> lock(g_cache_mutex);
        auto it = g_pipeline_cache.find(function_name);
        if (it != g_pipeline_cache.end()) {
            debug_log("Using cached pipeline for %s", function_name);
            return it->second;
        }
    }
    
    @autoreleasepool {
        NSError* error = nil;
        
        // Compile shader source
        NSString* source_str = [NSString stringWithUTF8String:source];
        MTLCompileOptions* options = [[MTLCompileOptions alloc] init];
        options.fastMathEnabled = YES;
        
        id<MTLLibrary> library = [g_device newLibraryWithSource:source_str
                                                        options:options
                                                          error:&error];
        if (library == nil) {
            debug_log("Shader compilation failed: %s", [[error localizedDescription] UTF8String]);
            return nullptr;
        }
        
        // Get function
        NSString* func_name = [NSString stringWithUTF8String:function_name];
        id<MTLFunction> function = [library newFunctionWithName:func_name];
        if (function == nil) {
            debug_log("Function %s not found in shader", function_name);
            return nullptr;
        }
        
        // Create compute pipeline
        id<MTLComputePipelineState> pipeline_state = [g_device newComputePipelineStateWithFunction:function
                                                                                            error:&error];
        if (pipeline_state == nil) {
            debug_log("Pipeline creation failed: %s", [[error localizedDescription] UTF8String]);
            return nullptr;
        }
        
        // Create pipeline handle
        GPUPipeline* pipeline = new GPUPipeline();
        pipeline->pipeline = (__bridge_retained void*)pipeline_state;
        pipeline->name = strdup(function_name);
        pipeline->id = g_pipeline_id_counter.fetch_add(1);
        
        // Cache the pipeline
        {
            std::lock_guard<std::mutex> lock(g_cache_mutex);
            g_pipeline_cache[function_name] = pipeline;
        }
        
        debug_log("Compiled and cached pipeline %u: %s", pipeline->id, function_name);
        
        return pipeline;
    }
}

GPUPipeline* metal_gpu_get_cached_pipeline(const char* name) {
    if (name == nullptr) {
        return nullptr;
    }
    
    std::lock_guard<std::mutex> lock(g_cache_mutex);
    auto it = g_pipeline_cache.find(name);
    if (it != g_pipeline_cache.end()) {
        return it->second;
    }
    return nullptr;
}

void metal_gpu_free_pipeline(GPUPipeline* pipeline) {
    if (pipeline == nullptr) {
        return;
    }
    
    @autoreleasepool {
        // Remove from cache
        {
            std::lock_guard<std::mutex> lock(g_cache_mutex);
            if (pipeline->name != nullptr) {
                g_pipeline_cache.erase(pipeline->name);
            }
        }
        
        if (pipeline->pipeline != nullptr) {
            id<MTLComputePipelineState> state = (__bridge_transfer id<MTLComputePipelineState>)pipeline->pipeline;
            state = nil;
        }
        
        if (pipeline->name != nullptr) {
            free((void*)pipeline->name);
        }
        
        debug_log("Freed pipeline %u", pipeline->id);
        delete pipeline;
    }
}

void metal_gpu_clear_shader_cache(void) {
    std::lock_guard<std::mutex> lock(g_cache_mutex);
    
    @autoreleasepool {
        for (auto& pair : g_pipeline_cache) {
            GPUPipeline* pipeline = pair.second;
            if (pipeline != nullptr) {
                if (pipeline->pipeline != nullptr) {
                    id<MTLComputePipelineState> state = (__bridge_transfer id<MTLComputePipelineState>)pipeline->pipeline;
                    state = nil;
                }
                if (pipeline->name != nullptr) {
                    free((void*)pipeline->name);
                }
                delete pipeline;
            }
        }
        g_pipeline_cache.clear();
    }
    
    debug_log("Shader cache cleared");
}

// ============================================================================
// Compute Dispatch
// ============================================================================

GPUResult metal_gpu_dispatch(
    GPUPipeline* pipeline,
    GPUBuffer** buffers,
    size_t buffer_count,
    size_t grid_size,
    size_t group_size
) {
    GPUResult result = {false, nullptr, 0.0};
    
    if (!metal_gpu_is_available() || pipeline == nullptr || pipeline->pipeline == nullptr) {
        result.error_message = "Metal GPU not available or invalid pipeline";
        return result;
    }
    
    @autoreleasepool {
        id<MTLComputePipelineState> pipeline_state = (__bridge id<MTLComputePipelineState>)pipeline->pipeline;
        
        // Clamp group size to pipeline maximum
        NSUInteger max_threads = [pipeline_state maxTotalThreadsPerThreadgroup];
        if (group_size > max_threads) {
            group_size = max_threads;
        }
        
        // Create command buffer
        id<MTLCommandBuffer> command_buffer = [g_command_queue commandBuffer];
        if (command_buffer == nil) {
            result.error_message = "Failed to create command buffer";
            return result;
        }
        
        // Create compute encoder
        id<MTLComputeCommandEncoder> encoder = [command_buffer computeCommandEncoder];
        if (encoder == nil) {
            result.error_message = "Failed to create compute encoder";
            return result;
        }
        
        // Set pipeline state
        [encoder setComputePipelineState:pipeline_state];
        
        // Set buffers
        for (size_t i = 0; i < buffer_count; i++) {
            if (buffers[i] != nullptr && buffers[i]->ptr != nullptr) {
                id<MTLBuffer> mtl_buffer = (__bridge id<MTLBuffer>)buffers[i]->ptr;
                [encoder setBuffer:mtl_buffer offset:0 atIndex:i];
            }
        }
        
        // Calculate grid and threadgroup sizes
        MTLSize grid = MTLSizeMake(grid_size, 1, 1);
        MTLSize threadgroup = MTLSizeMake(group_size, 1, 1);
        
        // Dispatch
        [encoder dispatchThreads:grid threadsPerThreadgroup:threadgroup];
        [encoder endEncoding];
        
        // Execute and wait
        CFAbsoluteTime start_time = CFAbsoluteTimeGetCurrent();
        [command_buffer commit];
        [command_buffer waitUntilCompleted];
        CFAbsoluteTime end_time = CFAbsoluteTimeGetCurrent();
        
        // Check for errors
        if ([command_buffer status] == MTLCommandBufferStatusError) {
            NSError* error = [command_buffer error];
            result.error_message = [[error localizedDescription] UTF8String];
            return result;
        }
        
        result.success = true;
        result.execution_time_ms = (end_time - start_time) * 1000.0;
        
        debug_log("Dispatch %s: grid=%zu, group=%zu, time=%.3fms",
                  pipeline->name, grid_size, group_size, result.execution_time_ms);
    }
    
    return result;
}

GPUResult metal_gpu_dispatch_2d(
    GPUPipeline* pipeline,
    GPUBuffer** buffers,
    size_t buffer_count,
    size_t grid_width,
    size_t grid_height,
    size_t group_width,
    size_t group_height
) {
    GPUResult result = {false, nullptr, 0.0};
    
    if (!metal_gpu_is_available() || pipeline == nullptr || pipeline->pipeline == nullptr) {
        result.error_message = "Metal GPU not available or invalid pipeline";
        return result;
    }
    
    @autoreleasepool {
        id<MTLComputePipelineState> pipeline_state = (__bridge id<MTLComputePipelineState>)pipeline->pipeline;
        
        // Create command buffer
        id<MTLCommandBuffer> command_buffer = [g_command_queue commandBuffer];
        if (command_buffer == nil) {
            result.error_message = "Failed to create command buffer";
            return result;
        }
        
        // Create compute encoder
        id<MTLComputeCommandEncoder> encoder = [command_buffer computeCommandEncoder];
        if (encoder == nil) {
            result.error_message = "Failed to create compute encoder";
            return result;
        }
        
        // Set pipeline state
        [encoder setComputePipelineState:pipeline_state];
        
        // Set buffers
        for (size_t i = 0; i < buffer_count; i++) {
            if (buffers[i] != nullptr && buffers[i]->ptr != nullptr) {
                id<MTLBuffer> mtl_buffer = (__bridge id<MTLBuffer>)buffers[i]->ptr;
                [encoder setBuffer:mtl_buffer offset:0 atIndex:i];
            }
        }
        
        // Calculate grid and threadgroup sizes
        MTLSize grid = MTLSizeMake(grid_width, grid_height, 1);
        MTLSize threadgroup = MTLSizeMake(group_width, group_height, 1);
        
        // Dispatch
        [encoder dispatchThreads:grid threadsPerThreadgroup:threadgroup];
        [encoder endEncoding];
        
        // Execute and wait
        CFAbsoluteTime start_time = CFAbsoluteTimeGetCurrent();
        [command_buffer commit];
        [command_buffer waitUntilCompleted];
        CFAbsoluteTime end_time = CFAbsoluteTimeGetCurrent();
        
        // Check for errors
        if ([command_buffer status] == MTLCommandBufferStatusError) {
            NSError* error = [command_buffer error];
            result.error_message = [[error localizedDescription] UTF8String];
            return result;
        }
        
        result.success = true;
        result.execution_time_ms = (end_time - start_time) * 1000.0;
        
        debug_log("Dispatch 2D %s: grid=%zux%zu, group=%zux%zu, time=%.3fms",
                  pipeline->name, grid_width, grid_height, group_width, group_height,
                  result.execution_time_ms);
    }
    
    return result;
}

void metal_gpu_synchronize(void) {
    if (!metal_gpu_is_available()) {
        return;
    }
    
    @autoreleasepool {
        // Create and immediately commit an empty command buffer to synchronize
        id<MTLCommandBuffer> command_buffer = [g_command_queue commandBuffer];
        [command_buffer commit];
        [command_buffer waitUntilCompleted];
    }
}


// ============================================================================
// MSM-specific operations (implemented in metal_msm.mm)
// ============================================================================

// metal_gpu_msm is implemented in metal_msm.mm

// ============================================================================
// NTT-specific operations (implemented in metal_ntt.mm)
// ============================================================================

// metal_gpu_ntt_forward, metal_gpu_ntt_inverse, and metal_gpu_ntt_batch
// are implemented in metal_ntt.mm

#endif /* __APPLE__ */
