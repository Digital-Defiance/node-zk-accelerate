/**
 * GPU Acceleration Module
 *
 * This module provides Metal GPU acceleration for ZK operations.
 * It handles initialization, buffer management, shader compilation,
 * and compute dispatch.
 *
 * Requirements: 1.5, 7.1, 7.2, 7.5, 7.8
 */

export {
  MetalGPU,
  getMetalGPU,
  isMetalAvailable,
  getMetalStatus,
  type MetalGPUStatus,
  type GPUBuffer,
  type GPUPipeline,
  type GPUResult,
} from './metal.js';

export {
  GPUAccelerator,
  getGPUAccelerator,
  type GPUAcceleratorStatus,
} from './accelerator.js';

export {
  msmGPU,
  msmGPUWithFallback,
  isGPUMSMAvailable,
  type MSMGPUConfig,
  type MSMGPUResult,
} from './msm-gpu.js';

export {
  forwardNttGPU,
  inverseNttGPU,
  batchNttGPU,
  forwardNttGPUWithFallback,
  isGPUNTTAvailable,
  type NTTGPUConfig,
  type NTTGPUResult,
} from './ntt-gpu.js';

export {
  FallbackReason,
  checkGPUAvailability,
  checkInputSizeForGPU,
  createFallbackFromError,
  executeWithGPUFallback,
  executeWithGPUFallbackSync,
  getFallbackReasonDescription,
  logFallbackStatus,
  type FallbackInfo,
} from './fallback.js';
