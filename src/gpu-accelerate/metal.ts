/**
 * Metal GPU Infrastructure
 *
 * This module provides the TypeScript interface to Metal GPU compute.
 * It wraps the native Metal implementation and provides a clean API
 * for GPU buffer management, shader compilation, and compute dispatch.
 *
 * Requirements: 1.5, 7.1, 7.2, 7.5
 */

import { loadCppBinding, type NativeCppBinding } from '../native.js';
import { ErrorCode, ZkAccelerateError } from '../errors.js';

/**
 * GPU buffer handle
 */
export interface GPUBuffer {
  /** Native buffer pointer ID */
  readonly id: number;
  /** Buffer size in bytes */
  readonly size: number;
  /** Whether buffer uses shared memory */
  readonly isShared: boolean;
}

/**
 * GPU compute pipeline handle
 */
export interface GPUPipeline {
  /** Pipeline ID */
  readonly id: number;
  /** Shader function name */
  readonly name: string;
}

/**
 * GPU execution result
 */
export interface GPUResult {
  /** Whether execution succeeded */
  readonly success: boolean;
  /** Error message if failed */
  readonly errorMessage?: string;
  /** Execution time in milliseconds */
  readonly executionTimeMs: number;
}

/**
 * Metal GPU status
 */
export interface MetalGPUStatus {
  /** Whether Metal is initialized */
  readonly initialized: boolean;
  /** Whether Metal device is available */
  readonly deviceAvailable: boolean;
  /** Whether unified memory is available */
  readonly unifiedMemory: boolean;
  /** Maximum threads per threadgroup */
  readonly maxThreadsPerGroup: number;
  /** Maximum buffer length */
  readonly maxBufferLength: number;
  /** Device name */
  readonly deviceName: string;
}

/**
 * Extended native binding interface with Metal GPU functions
 */
interface MetalNativeBinding extends NativeCppBinding {
  // Metal GPU functions
  metalGpuInit?(): boolean;
  metalGpuShutdown?(): void;
  metalGpuIsAvailable?(): boolean;
  metalGpuGetStatus?(): MetalGPUStatus;
  metalGpuAllocBuffer?(size: number, shared: boolean): GPUBuffer | null;
  metalGpuFreeBuffer?(bufferId: number): void;
  metalGpuCopyToBuffer?(bufferId: number, data: Uint8Array, offset: number): boolean;
  metalGpuCopyFromBuffer?(bufferId: number, size: number, offset: number): Uint8Array | null;
  metalGpuCompileShader?(source: string, functionName: string): GPUPipeline | null;
  metalGpuGetCachedPipeline?(name: string): GPUPipeline | null;
  metalGpuFreePipeline?(pipelineId: number): void;
  metalGpuClearShaderCache?(): void;
  metalGpuDispatch?(
    pipelineId: number,
    bufferIds: number[],
    gridSize: number,
    groupSize: number
  ): GPUResult;
  metalGpuSynchronize?(): void;
}

/**
 * Debug logger for Metal GPU
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
  const debugEnv = process.env['DEBUG'];
  const zkDebugEnv = process.env['ZK_ACCELERATE_DEBUG'];
  const debugEnabled =
    debugEnv?.includes('zk-accelerate') || zkDebugEnv === '1' || zkDebugEnv === 'true';

  if (debugEnabled) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [zk-accelerate:metal]`;
    if (data) {
      console.debug(`${prefix} ${message}`, data);
    } else {
      console.debug(`${prefix} ${message}`);
    }
  }
}

/**
 * Metal GPU class
 *
 * Provides the main interface for Metal GPU operations.
 */
export class MetalGPU {
  private binding: MetalNativeBinding | null = null;
  private initialized = false;
  private buffers: Map<number, GPUBuffer> = new Map();
  private pipelines: Map<number, GPUPipeline> = new Map();

  /**
   * Initialize Metal GPU
   *
   * @returns true if initialization successful
   */
  init(): boolean {
    if (this.initialized) {
      return true;
    }

    this.binding = loadCppBinding() as MetalNativeBinding | null;
    if (!this.binding) {
      debugLog('Native binding not available');
      return false;
    }

    // Check if Metal functions are available
    if (!this.binding.metalGpuInit) {
      debugLog('Metal GPU functions not available in native binding');
      // Metal functions may not be exposed yet - use fallback status
      this.initialized = this.checkMetalViaHardware();
      return this.initialized;
    }

    try {
      this.initialized = this.binding.metalGpuInit();
      debugLog(`Metal GPU initialized: ${this.initialized}`);
      return this.initialized;
    } catch (error) {
      debugLog('Metal GPU initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Check Metal availability via hardware detection
   */
  private checkMetalViaHardware(): boolean {
    if (!this.binding) return false;

    try {
      const caps = this.binding.getHardwareCapabilities();
      return caps.hasMetal;
    } catch {
      return false;
    }
  }

  /**
   * Shutdown Metal GPU and release resources
   */
  shutdown(): void {
    if (!this.initialized || !this.binding) {
      return;
    }

    // Free all buffers
    for (const buffer of this.buffers.values()) {
      this.freeBuffer(buffer);
    }
    this.buffers.clear();

    // Free all pipelines
    for (const pipeline of this.pipelines.values()) {
      this.freePipeline(pipeline);
    }
    this.pipelines.clear();

    if (this.binding.metalGpuShutdown) {
      this.binding.metalGpuShutdown();
    }

    this.initialized = false;
    debugLog('Metal GPU shutdown');
  }

  /**
   * Check if Metal GPU is available
   */
  isAvailable(): boolean {
    if (!this.binding) {
      return false;
    }

    if (this.binding.metalGpuIsAvailable) {
      return this.binding.metalGpuIsAvailable();
    }

    // Fallback to hardware detection
    return this.checkMetalViaHardware();
  }

  /**
   * Get Metal GPU status
   */
  getStatus(): MetalGPUStatus {
    if (!this.binding) {
      return {
        initialized: false,
        deviceAvailable: false,
        unifiedMemory: false,
        maxThreadsPerGroup: 0,
        maxBufferLength: 0,
        deviceName: '',
      };
    }

    if (this.binding.metalGpuGetStatus) {
      return this.binding.metalGpuGetStatus();
    }

    // Fallback to hardware detection
    try {
      const caps = this.binding.getHardwareCapabilities();
      return {
        initialized: this.initialized,
        deviceAvailable: caps.hasMetal,
        unifiedMemory: caps.unifiedMemory,
        maxThreadsPerGroup: caps.metalMaxThreadsPerGroup ?? 1024,
        maxBufferLength: 256 * 1024 * 1024, // 256MB default
        deviceName: caps.metalDeviceName ?? '',
      };
    } catch {
      return {
        initialized: false,
        deviceAvailable: false,
        unifiedMemory: false,
        maxThreadsPerGroup: 0,
        maxBufferLength: 0,
        deviceName: '',
      };
    }
  }

  /**
   * Allocate a GPU buffer
   *
   * @param size Buffer size in bytes
   * @param shared Use shared memory (unified memory on Apple Silicon)
   * @returns Buffer handle
   */
  allocBuffer(size: number, shared: boolean = true): GPUBuffer {
    if (!this.initialized) {
      this.init();
    }

    if (!this.binding?.metalGpuAllocBuffer) {
      throw new ZkAccelerateError(
        'Metal GPU buffer allocation not available',
        ErrorCode.GPU_BUFFER_ALLOCATION_FAILED
      );
    }

    const buffer = this.binding.metalGpuAllocBuffer(size, shared);
    if (!buffer) {
      throw new ZkAccelerateError(
        `Failed to allocate GPU buffer of size ${size}`,
        ErrorCode.GPU_BUFFER_ALLOCATION_FAILED,
        { size, shared }
      );
    }

    this.buffers.set(buffer.id, buffer);
    debugLog(`Allocated buffer ${buffer.id}: ${size} bytes`);
    return buffer;
  }

  /**
   * Free a GPU buffer
   */
  freeBuffer(buffer: GPUBuffer): void {
    if (!this.binding?.metalGpuFreeBuffer) {
      return;
    }

    this.binding.metalGpuFreeBuffer(buffer.id);
    this.buffers.delete(buffer.id);
    debugLog(`Freed buffer ${buffer.id}`);
  }

  /**
   * Copy data to GPU buffer
   */
  copyToBuffer(buffer: GPUBuffer, data: Uint8Array, offset: number = 0): void {
    if (!this.binding?.metalGpuCopyToBuffer) {
      throw new ZkAccelerateError(
        'Metal GPU buffer copy not available',
        ErrorCode.GPU_BUFFER_ALLOCATION_FAILED
      );
    }

    const success = this.binding.metalGpuCopyToBuffer(buffer.id, data, offset);
    if (!success) {
      throw new ZkAccelerateError(
        'Failed to copy data to GPU buffer',
        ErrorCode.GPU_BUFFER_ALLOCATION_FAILED,
        { bufferId: buffer.id, dataSize: data.length, offset }
      );
    }
  }

  /**
   * Copy data from GPU buffer
   */
  copyFromBuffer(buffer: GPUBuffer, size: number, offset: number = 0): Uint8Array {
    if (!this.binding?.metalGpuCopyFromBuffer) {
      throw new ZkAccelerateError(
        'Metal GPU buffer copy not available',
        ErrorCode.GPU_BUFFER_ALLOCATION_FAILED
      );
    }

    const data = this.binding.metalGpuCopyFromBuffer(buffer.id, size, offset);
    if (!data) {
      throw new ZkAccelerateError(
        'Failed to copy data from GPU buffer',
        ErrorCode.GPU_BUFFER_ALLOCATION_FAILED,
        { bufferId: buffer.id, size, offset }
      );
    }

    return data;
  }

  /**
   * Compile a Metal shader
   *
   * @param source Metal shader source code
   * @param functionName Entry point function name
   * @returns Pipeline handle
   */
  compileShader(source: string, functionName: string): GPUPipeline {
    if (!this.initialized) {
      this.init();
    }

    if (!this.binding?.metalGpuCompileShader) {
      throw new ZkAccelerateError(
        'Metal GPU shader compilation not available',
        ErrorCode.SHADER_COMPILATION_FAILED
      );
    }

    const pipeline = this.binding.metalGpuCompileShader(source, functionName);
    if (!pipeline) {
      throw new ZkAccelerateError(
        `Failed to compile shader function: ${functionName}`,
        ErrorCode.SHADER_COMPILATION_FAILED,
        { functionName }
      );
    }

    this.pipelines.set(pipeline.id, pipeline);
    debugLog(`Compiled shader: ${functionName}`);
    return pipeline;
  }

  /**
   * Get a cached pipeline by name
   */
  getCachedPipeline(name: string): GPUPipeline | null {
    if (!this.binding?.metalGpuGetCachedPipeline) {
      return null;
    }

    return this.binding.metalGpuGetCachedPipeline(name);
  }

  /**
   * Free a pipeline
   */
  freePipeline(pipeline: GPUPipeline): void {
    if (!this.binding?.metalGpuFreePipeline) {
      return;
    }

    this.binding.metalGpuFreePipeline(pipeline.id);
    this.pipelines.delete(pipeline.id);
    debugLog(`Freed pipeline: ${pipeline.name}`);
  }

  /**
   * Clear shader cache
   */
  clearShaderCache(): void {
    if (!this.binding?.metalGpuClearShaderCache) {
      return;
    }

    this.binding.metalGpuClearShaderCache();
    this.pipelines.clear();
    debugLog('Shader cache cleared');
  }

  /**
   * Dispatch a compute kernel
   *
   * @param pipeline Compute pipeline
   * @param buffers Array of buffer handles
   * @param gridSize Total number of threads
   * @param groupSize Threads per threadgroup
   * @returns Execution result
   */
  dispatch(
    pipeline: GPUPipeline,
    buffers: GPUBuffer[],
    gridSize: number,
    groupSize: number
  ): GPUResult {
    if (!this.binding?.metalGpuDispatch) {
      return {
        success: false,
        errorMessage: 'Metal GPU dispatch not available',
        executionTimeMs: 0,
      };
    }

    const bufferIds = buffers.map((b) => b.id);
    return this.binding.metalGpuDispatch(pipeline.id, bufferIds, gridSize, groupSize);
  }

  /**
   * Wait for all GPU operations to complete
   */
  synchronize(): void {
    if (!this.binding?.metalGpuSynchronize) {
      return;
    }

    this.binding.metalGpuSynchronize();
  }
}

// Singleton instance
let metalGPUInstance: MetalGPU | null = null;

/**
 * Get the Metal GPU singleton instance
 */
export function getMetalGPU(): MetalGPU {
  if (!metalGPUInstance) {
    metalGPUInstance = new MetalGPU();
  }
  return metalGPUInstance;
}

/**
 * Check if Metal GPU is available
 */
export function isMetalAvailable(): boolean {
  return getMetalGPU().isAvailable();
}

/**
 * Get Metal GPU status
 */
export function getMetalStatus(): MetalGPUStatus {
  return getMetalGPU().getStatus();
}
