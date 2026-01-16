/**
 * @digitaldefiance/node-zk-accelerate
 * Node.js native addon entry point
 */

#include <napi.h>
#include "../include/zk_accelerate.h"
#include "../include/cpu_accelerate.h"

// Forward declaration for Metal capabilities update
#ifdef __APPLE__
extern "C" void update_metal_capabilities(HardwareCapabilities* caps);
#include "../include/metal_gpu.h"
#endif

/**
 * Get hardware capabilities as a JavaScript object
 */
Napi::Object GetHardwareCapabilities(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    HardwareCapabilities caps = detect_hardware_capabilities();
    
    // Update with Metal-specific info on macOS
#ifdef __APPLE__
    update_metal_capabilities(&caps);
#endif
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("hasNeon", Napi::Boolean::New(env, caps.has_neon));
    result.Set("hasAmx", Napi::Boolean::New(env, caps.has_amx));
    result.Set("hasSme", Napi::Boolean::New(env, caps.has_sme));
    result.Set("hasMetal", Napi::Boolean::New(env, caps.has_metal));
    result.Set("unifiedMemory", Napi::Boolean::New(env, caps.unified_memory));
    result.Set("cpuCores", Napi::Number::New(env, caps.cpu_cores));
    
    if (caps.gpu_cores > 0) {
        result.Set("gpuCores", Napi::Number::New(env, caps.gpu_cores));
    }
    
    if (caps.has_metal) {
        result.Set("metalDeviceName", Napi::String::New(env, caps.metal_device_name));
        result.Set("metalMaxThreadsPerGroup", Napi::Number::New(env, caps.metal_max_threads_per_group));
    }
    
    return result;
}

/**
 * Check if Apple Silicon
 */
Napi::Boolean IsAppleSilicon(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), is_apple_silicon());
}

/**
 * Get native binding version
 */
Napi::String GetVersion(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), "0.1.0");
}

/**
 * Get CPU accelerator status
 */
Napi::Object GetCPUAcceleratorStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    CPUAcceleratorStatus status = get_cpu_accelerator_status();
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("vdspAvailable", Napi::Boolean::New(env, status.vdsp_available));
    result.Set("blasAvailable", Napi::Boolean::New(env, status.blas_available));
    result.Set("neonAvailable", Napi::Boolean::New(env, status.neon_available));
    result.Set("amxAvailable", Napi::Boolean::New(env, status.amx_available));
    result.Set("smeAvailable", Napi::Boolean::New(env, status.sme_available));
    
    return result;
}

/**
 * Vector addition using vDSP
 */
Napi::Float64Array VdspVectorAdd(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsTypedArray() || !info[1].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected two Float64Array arguments").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    Napi::Float64Array a = info[0].As<Napi::Float64Array>();
    Napi::Float64Array b = info[1].As<Napi::Float64Array>();
    
    if (a.ElementLength() != b.ElementLength()) {
        Napi::TypeError::New(env, "Arrays must have the same length").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    size_t n = a.ElementLength();
    Napi::Float64Array result = Napi::Float64Array::New(env, n);
    
    vdsp_vector_add_f64(a.Data(), b.Data(), result.Data(), n);
    
    return result;
}

/**
 * Vector multiplication using vDSP
 */
Napi::Float64Array VdspVectorMul(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsTypedArray() || !info[1].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected two Float64Array arguments").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    Napi::Float64Array a = info[0].As<Napi::Float64Array>();
    Napi::Float64Array b = info[1].As<Napi::Float64Array>();
    
    if (a.ElementLength() != b.ElementLength()) {
        Napi::TypeError::New(env, "Arrays must have the same length").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    size_t n = a.ElementLength();
    Napi::Float64Array result = Napi::Float64Array::New(env, n);
    
    vdsp_vector_mul_f64(a.Data(), b.Data(), result.Data(), n);
    
    return result;
}

/**
 * Vector subtraction using vDSP
 */
Napi::Float64Array VdspVectorSub(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsTypedArray() || !info[1].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected two Float64Array arguments").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    Napi::Float64Array a = info[0].As<Napi::Float64Array>();
    Napi::Float64Array b = info[1].As<Napi::Float64Array>();
    
    if (a.ElementLength() != b.ElementLength()) {
        Napi::TypeError::New(env, "Arrays must have the same length").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    size_t n = a.ElementLength();
    Napi::Float64Array result = Napi::Float64Array::New(env, n);
    
    vdsp_vector_sub_f64(a.Data(), b.Data(), result.Data(), n);
    
    return result;
}

/**
 * BLAS matrix multiplication
 */
Napi::Float64Array BlasMatrixMul(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 5) {
        Napi::TypeError::New(env, "Expected 5 arguments: a, b, m, n, k").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    if (!info[0].IsTypedArray() || !info[1].IsTypedArray()) {
        Napi::TypeError::New(env, "First two arguments must be Float64Array").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    Napi::Float64Array a = info[0].As<Napi::Float64Array>();
    Napi::Float64Array b = info[1].As<Napi::Float64Array>();
    int m = info[2].As<Napi::Number>().Int32Value();
    int n = info[3].As<Napi::Number>().Int32Value();
    int k = info[4].As<Napi::Number>().Int32Value();
    
    // Validate dimensions
    if (a.ElementLength() != (size_t)(m * k) || b.ElementLength() != (size_t)(k * n)) {
        Napi::TypeError::New(env, "Matrix dimensions don't match").ThrowAsJavaScriptException();
        return Napi::Float64Array::New(env, 0);
    }
    
    Napi::Float64Array result = Napi::Float64Array::New(env, m * n);
    
    // Initialize result to zero
    memset(result.Data(), 0, m * n * sizeof(double));
    
    blas_matrix_mul_f64(a.Data(), b.Data(), result.Data(), m, n, k, 1.0, 0.0);
    
    return result;
}

/**
 * Check if NEON is available
 */
Napi::Boolean NeonAvailable(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), neon_available());
}

/**
 * Check if SME is available
 */
Napi::Boolean SmeAvailable(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), sme_available());
}

// ============================================================================
// Metal GPU Functions
// ============================================================================

#ifdef __APPLE__

/**
 * Initialize Metal GPU
 */
Napi::Boolean MetalGpuInit(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), metal_gpu_init());
}

/**
 * Shutdown Metal GPU
 */
void MetalGpuShutdown(const Napi::CallbackInfo& info) {
    metal_gpu_shutdown();
}

/**
 * Check if Metal GPU is available
 */
Napi::Boolean MetalGpuIsAvailable(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), metal_gpu_is_available());
}

/**
 * Get Metal GPU status
 */
Napi::Object MetalGpuGetStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    MetalGPUStatus status = metal_gpu_get_status();
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("initialized", Napi::Boolean::New(env, status.initialized));
    result.Set("deviceAvailable", Napi::Boolean::New(env, status.device_available));
    result.Set("unifiedMemory", Napi::Boolean::New(env, status.unified_memory));
    result.Set("maxThreadsPerGroup", Napi::Number::New(env, status.max_threads_per_group));
    result.Set("maxBufferLength", Napi::Number::New(env, status.max_buffer_length));
    result.Set("deviceName", Napi::String::New(env, status.device_name));
    
    return result;
}

/**
 * Allocate a GPU buffer
 */
Napi::Value MetalGpuAllocBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: size, shared").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    size_t size = info[0].As<Napi::Number>().Uint32Value();
    bool shared = info[1].As<Napi::Boolean>().Value();
    
    GPUBuffer* buffer = metal_gpu_alloc_buffer(size, shared);
    if (buffer == nullptr) {
        return env.Null();
    }
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("id", Napi::Number::New(env, buffer->id));
    result.Set("size", Napi::Number::New(env, buffer->size));
    result.Set("isShared", Napi::Boolean::New(env, buffer->is_shared));
    
    // Store the native pointer for later use
    result.Set("_nativePtr", Napi::External<GPUBuffer>::New(env, buffer));
    
    return result;
}

/**
 * Free a GPU buffer
 */
void MetalGpuFreeBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        return;
    }
    
    Napi::Object bufferObj = info[0].As<Napi::Object>();
    if (!bufferObj.Has("_nativePtr")) {
        return;
    }
    
    Napi::External<GPUBuffer> external = bufferObj.Get("_nativePtr").As<Napi::External<GPUBuffer>>();
    GPUBuffer* buffer = external.Data();
    
    metal_gpu_free_buffer(buffer);
}

/**
 * Copy data to GPU buffer
 */
Napi::Boolean MetalGpuCopyToBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected 3 arguments: buffer, data, offset").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    Napi::Object bufferObj = info[0].As<Napi::Object>();
    if (!bufferObj.Has("_nativePtr")) {
        return Napi::Boolean::New(env, false);
    }
    
    Napi::External<GPUBuffer> external = bufferObj.Get("_nativePtr").As<Napi::External<GPUBuffer>>();
    GPUBuffer* buffer = external.Data();
    
    Napi::Uint8Array data = info[1].As<Napi::Uint8Array>();
    size_t offset = info[2].As<Napi::Number>().Uint32Value();
    
    bool success = metal_gpu_copy_to_buffer(buffer, data.Data(), data.ByteLength(), offset);
    return Napi::Boolean::New(env, success);
}

/**
 * Copy data from GPU buffer
 */
Napi::Value MetalGpuCopyFromBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected 3 arguments: buffer, size, offset").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Object bufferObj = info[0].As<Napi::Object>();
    if (!bufferObj.Has("_nativePtr")) {
        return env.Null();
    }
    
    Napi::External<GPUBuffer> external = bufferObj.Get("_nativePtr").As<Napi::External<GPUBuffer>>();
    GPUBuffer* buffer = external.Data();
    
    size_t size = info[1].As<Napi::Number>().Uint32Value();
    size_t offset = info[2].As<Napi::Number>().Uint32Value();
    
    Napi::Uint8Array result = Napi::Uint8Array::New(env, size);
    
    bool success = metal_gpu_copy_from_buffer(buffer, result.Data(), size, offset);
    if (!success) {
        return env.Null();
    }
    
    return result;
}

/**
 * Compile a Metal shader
 */
Napi::Value MetalGpuCompileShader(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: source, functionName").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string source = info[0].As<Napi::String>().Utf8Value();
    std::string functionName = info[1].As<Napi::String>().Utf8Value();
    
    GPUPipeline* pipeline = metal_gpu_compile_shader(source.c_str(), functionName.c_str());
    if (pipeline == nullptr) {
        return env.Null();
    }
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("id", Napi::Number::New(env, pipeline->id));
    result.Set("name", Napi::String::New(env, pipeline->name));
    result.Set("_nativePtr", Napi::External<GPUPipeline>::New(env, pipeline));
    
    return result;
}

/**
 * Get cached pipeline
 */
Napi::Value MetalGpuGetCachedPipeline(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        return env.Null();
    }
    
    std::string name = info[0].As<Napi::String>().Utf8Value();
    
    GPUPipeline* pipeline = metal_gpu_get_cached_pipeline(name.c_str());
    if (pipeline == nullptr) {
        return env.Null();
    }
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("id", Napi::Number::New(env, pipeline->id));
    result.Set("name", Napi::String::New(env, pipeline->name));
    result.Set("_nativePtr", Napi::External<GPUPipeline>::New(env, pipeline));
    
    return result;
}

/**
 * Free a pipeline
 */
void MetalGpuFreePipeline(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        return;
    }
    
    Napi::Object pipelineObj = info[0].As<Napi::Object>();
    if (!pipelineObj.Has("_nativePtr")) {
        return;
    }
    
    Napi::External<GPUPipeline> external = pipelineObj.Get("_nativePtr").As<Napi::External<GPUPipeline>>();
    GPUPipeline* pipeline = external.Data();
    
    metal_gpu_free_pipeline(pipeline);
}

/**
 * Clear shader cache
 */
void MetalGpuClearShaderCache(const Napi::CallbackInfo& info) {
    metal_gpu_clear_shader_cache();
}

/**
 * Dispatch a compute kernel
 */
Napi::Object MetalGpuDispatch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("success", Napi::Boolean::New(env, false));
    result.Set("executionTimeMs", Napi::Number::New(env, 0.0));
    
    if (info.Length() < 4) {
        result.Set("errorMessage", Napi::String::New(env, "Expected 4 arguments: pipeline, buffers, gridSize, groupSize"));
        return result;
    }
    
    // Get pipeline
    Napi::Object pipelineObj = info[0].As<Napi::Object>();
    if (!pipelineObj.Has("_nativePtr")) {
        result.Set("errorMessage", Napi::String::New(env, "Invalid pipeline object"));
        return result;
    }
    
    Napi::External<GPUPipeline> pipelineExt = pipelineObj.Get("_nativePtr").As<Napi::External<GPUPipeline>>();
    GPUPipeline* pipeline = pipelineExt.Data();
    
    // Get buffers array
    Napi::Array buffersArray = info[1].As<Napi::Array>();
    size_t bufferCount = buffersArray.Length();
    std::vector<GPUBuffer*> buffers(bufferCount);
    
    for (size_t i = 0; i < bufferCount; i++) {
        Napi::Object bufferObj = buffersArray.Get(i).As<Napi::Object>();
        if (bufferObj.Has("_nativePtr")) {
            Napi::External<GPUBuffer> bufferExt = bufferObj.Get("_nativePtr").As<Napi::External<GPUBuffer>>();
            buffers[i] = bufferExt.Data();
        } else {
            buffers[i] = nullptr;
        }
    }
    
    size_t gridSize = info[2].As<Napi::Number>().Uint32Value();
    size_t groupSize = info[3].As<Napi::Number>().Uint32Value();
    
    GPUResult gpuResult = metal_gpu_dispatch(pipeline, buffers.data(), bufferCount, gridSize, groupSize);
    
    result.Set("success", Napi::Boolean::New(env, gpuResult.success));
    result.Set("executionTimeMs", Napi::Number::New(env, gpuResult.execution_time_ms));
    if (gpuResult.error_message != nullptr) {
        result.Set("errorMessage", Napi::String::New(env, gpuResult.error_message));
    }
    
    return result;
}

/**
 * Synchronize GPU operations
 */
void MetalGpuSynchronize(const Napi::CallbackInfo& info) {
    metal_gpu_synchronize();
}

#endif // __APPLE__

/**
 * Initialize the native addon
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Hardware detection
    exports.Set("getHardwareCapabilities", Napi::Function::New(env, GetHardwareCapabilities));
    exports.Set("isAppleSilicon", Napi::Function::New(env, IsAppleSilicon));
    exports.Set("getVersion", Napi::Function::New(env, GetVersion));
    
    // CPU accelerator status
    exports.Set("getCPUAcceleratorStatus", Napi::Function::New(env, GetCPUAcceleratorStatus));
    
    // vDSP operations
    exports.Set("vdspVectorAdd", Napi::Function::New(env, VdspVectorAdd));
    exports.Set("vdspVectorMul", Napi::Function::New(env, VdspVectorMul));
    exports.Set("vdspVectorSub", Napi::Function::New(env, VdspVectorSub));
    
    // BLAS operations
    exports.Set("blasMatrixMul", Napi::Function::New(env, BlasMatrixMul));
    
    // Feature detection
    exports.Set("neonAvailable", Napi::Function::New(env, NeonAvailable));
    exports.Set("smeAvailable", Napi::Function::New(env, SmeAvailable));
    
#ifdef __APPLE__
    // Metal GPU functions
    exports.Set("metalGpuInit", Napi::Function::New(env, MetalGpuInit));
    exports.Set("metalGpuShutdown", Napi::Function::New(env, MetalGpuShutdown));
    exports.Set("metalGpuIsAvailable", Napi::Function::New(env, MetalGpuIsAvailable));
    exports.Set("metalGpuGetStatus", Napi::Function::New(env, MetalGpuGetStatus));
    exports.Set("metalGpuAllocBuffer", Napi::Function::New(env, MetalGpuAllocBuffer));
    exports.Set("metalGpuFreeBuffer", Napi::Function::New(env, MetalGpuFreeBuffer));
    exports.Set("metalGpuCopyToBuffer", Napi::Function::New(env, MetalGpuCopyToBuffer));
    exports.Set("metalGpuCopyFromBuffer", Napi::Function::New(env, MetalGpuCopyFromBuffer));
    exports.Set("metalGpuCompileShader", Napi::Function::New(env, MetalGpuCompileShader));
    exports.Set("metalGpuGetCachedPipeline", Napi::Function::New(env, MetalGpuGetCachedPipeline));
    exports.Set("metalGpuFreePipeline", Napi::Function::New(env, MetalGpuFreePipeline));
    exports.Set("metalGpuClearShaderCache", Napi::Function::New(env, MetalGpuClearShaderCache));
    exports.Set("metalGpuDispatch", Napi::Function::New(env, MetalGpuDispatch));
    exports.Set("metalGpuSynchronize", Napi::Function::New(env, MetalGpuSynchronize));
#endif
    
    return exports;
}

NODE_API_MODULE(zk_accelerate, Init)
