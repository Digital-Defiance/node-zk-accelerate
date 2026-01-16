/**
 * GPU Fallback Handling
 *
 * This module provides graceful fallback to CPU when Metal GPU
 * is unavailable or when GPU operations fail.
 *
 * Requirements: 7.8
 */

import { detectHardwareCapabilities } from '../hardware.js';
import { getMetalGPU } from './metal.js';

/**
 * Fallback reason codes
 */
export enum FallbackReason {
  /** Metal GPU not available on this system */
  METAL_UNAVAILABLE = 'METAL_UNAVAILABLE',
  /** Metal GPU initialization failed */
  METAL_INIT_FAILED = 'METAL_INIT_FAILED',
  /** Shader compilation failed */
  SHADER_COMPILATION_FAILED = 'SHADER_COMPILATION_FAILED',
  /** GPU buffer allocation failed */
  BUFFER_ALLOCATION_FAILED = 'BUFFER_ALLOCATION_FAILED',
  /** GPU execution failed */
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  /** Input size too small for GPU (overhead not worth it) */
  INPUT_TOO_SMALL = 'INPUT_TOO_SMALL',
  /** User explicitly requested CPU */
  USER_REQUESTED_CPU = 'USER_REQUESTED_CPU',
  /** Unknown error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Fallback information
 */
export interface FallbackInfo {
  /** Whether fallback occurred */
  readonly fellBack: boolean;
  /** Reason for fallback (if any) */
  readonly reason?: FallbackReason | undefined;
  /** Detailed message */
  readonly message?: string | undefined;
  /** Original error (if any) */
  readonly originalError?: Error | undefined;
}

/**
 * Debug logger for fallback handling
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
  const debugEnv = process.env['DEBUG'];
  const zkDebugEnv = process.env['ZK_ACCELERATE_DEBUG'];
  const debugEnabled =
    debugEnv?.includes('zk-accelerate') || zkDebugEnv === '1' || zkDebugEnv === 'true';

  if (debugEnabled) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [zk-accelerate:fallback]`;
    if (data) {
      console.debug(`${prefix} ${message}`, data);
    } else {
      console.debug(`${prefix} ${message}`);
    }
  }
}

/**
 * Check if GPU is available and log reason if not
 */
export function checkGPUAvailability(): FallbackInfo {
  const caps = detectHardwareCapabilities();

  if (!caps.hasMetal) {
    const message = 'Metal GPU not available on this system';
    debugLog(message, { platform: process.platform, arch: process.arch });
    return {
      fellBack: true,
      reason: FallbackReason.METAL_UNAVAILABLE,
      message,
    };
  }

  const metal = getMetalGPU();
  if (!metal.isAvailable()) {
    const message = 'Metal GPU initialization failed';
    debugLog(message);
    return {
      fellBack: true,
      reason: FallbackReason.METAL_INIT_FAILED,
      message,
    };
  }

  return { fellBack: false };
}

/**
 * Check if input size is suitable for GPU acceleration
 *
 * @param inputSize - Size of the input
 * @param threshold - Minimum size for GPU acceleration
 * @returns Fallback info
 */
export function checkInputSizeForGPU(inputSize: number, threshold: number): FallbackInfo {
  if (inputSize < threshold) {
    const message = `Input size ${inputSize} is below GPU threshold ${threshold}`;
    debugLog(message);
    return {
      fellBack: true,
      reason: FallbackReason.INPUT_TOO_SMALL,
      message,
    };
  }

  return { fellBack: false };
}

/**
 * Create fallback info from an error
 */
export function createFallbackFromError(error: unknown): FallbackInfo {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const originalError = error instanceof Error ? error : undefined;

  // Determine reason based on error message
  let reason = FallbackReason.UNKNOWN_ERROR;
  if (errorMessage.includes('shader') || errorMessage.includes('compile')) {
    reason = FallbackReason.SHADER_COMPILATION_FAILED;
  } else if (errorMessage.includes('buffer') || errorMessage.includes('allocat')) {
    reason = FallbackReason.BUFFER_ALLOCATION_FAILED;
  } else if (errorMessage.includes('Metal') || errorMessage.includes('GPU')) {
    reason = FallbackReason.EXECUTION_FAILED;
  }

  debugLog(`GPU operation failed, falling back to CPU: ${errorMessage}`, {
    reason,
    errorType: error instanceof Error ? error.name : typeof error,
  });

  return {
    fellBack: true,
    reason,
    message: errorMessage,
    originalError,
  };
}

/**
 * Execute an operation with GPU fallback to CPU
 *
 * @param gpuOperation - The GPU operation to attempt
 * @param cpuFallback - The CPU fallback operation
 * @param operationName - Name of the operation for logging
 * @returns Result and fallback info
 */
export async function executeWithGPUFallback<T>(
  gpuOperation: () => Promise<T>,
  cpuFallback: () => T,
  operationName: string = 'operation'
): Promise<{ result: T; fallbackInfo: FallbackInfo }> {
  // Check GPU availability first
  const availabilityCheck = checkGPUAvailability();
  if (availabilityCheck.fellBack) {
    debugLog(`Skipping GPU for ${operationName}: ${availabilityCheck.message}`);
    return {
      result: cpuFallback(),
      fallbackInfo: availabilityCheck,
    };
  }

  // Try GPU operation
  try {
    const result = await gpuOperation();
    return {
      result,
      fallbackInfo: { fellBack: false },
    };
  } catch (error) {
    const fallbackInfo = createFallbackFromError(error);
    debugLog(`GPU ${operationName} failed, using CPU fallback`);
    return {
      result: cpuFallback(),
      fallbackInfo,
    };
  }
}

/**
 * Execute a synchronous operation with GPU fallback to CPU
 *
 * @param gpuOperation - The GPU operation to attempt
 * @param cpuFallback - The CPU fallback operation
 * @param operationName - Name of the operation for logging
 * @returns Result and fallback info
 */
export function executeWithGPUFallbackSync<T>(
  gpuOperation: () => T,
  cpuFallback: () => T,
  operationName: string = 'operation'
): { result: T; fallbackInfo: FallbackInfo } {
  // Check GPU availability first
  const availabilityCheck = checkGPUAvailability();
  if (availabilityCheck.fellBack) {
    debugLog(`Skipping GPU for ${operationName}: ${availabilityCheck.message}`);
    return {
      result: cpuFallback(),
      fallbackInfo: availabilityCheck,
    };
  }

  // Try GPU operation
  try {
    const result = gpuOperation();
    return {
      result,
      fallbackInfo: { fellBack: false },
    };
  } catch (error) {
    const fallbackInfo = createFallbackFromError(error);
    debugLog(`GPU ${operationName} failed, using CPU fallback`);
    return {
      result: cpuFallback(),
      fallbackInfo,
    };
  }
}

/**
 * Get a human-readable description of a fallback reason
 */
export function getFallbackReasonDescription(reason: FallbackReason): string {
  switch (reason) {
    case FallbackReason.METAL_UNAVAILABLE:
      return 'Metal GPU is not available on this system';
    case FallbackReason.METAL_INIT_FAILED:
      return 'Failed to initialize Metal GPU';
    case FallbackReason.SHADER_COMPILATION_FAILED:
      return 'GPU shader compilation failed';
    case FallbackReason.BUFFER_ALLOCATION_FAILED:
      return 'Failed to allocate GPU buffer';
    case FallbackReason.EXECUTION_FAILED:
      return 'GPU execution failed';
    case FallbackReason.INPUT_TOO_SMALL:
      return 'Input size too small for GPU acceleration';
    case FallbackReason.USER_REQUESTED_CPU:
      return 'User explicitly requested CPU execution';
    case FallbackReason.UNKNOWN_ERROR:
    default:
      return 'Unknown error occurred';
  }
}

/**
 * Log GPU fallback status summary
 */
export function logFallbackStatus(): void {
  const caps = detectHardwareCapabilities();
  const metal = getMetalGPU();
  const status = metal.getStatus();

  debugLog('GPU Fallback Status', {
    metalAvailable: caps.hasMetal,
    metalInitialized: status.initialized,
    deviceName: status.deviceName || 'N/A',
    unifiedMemory: status.unifiedMemory,
    maxThreadsPerGroup: status.maxThreadsPerGroup,
  });
}
