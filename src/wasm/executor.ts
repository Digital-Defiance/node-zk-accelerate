/**
 * @digitaldefiance/node-zk-accelerate
 * WASM Fallback Executor
 *
 * Provides utilities for executing operations with automatic
 * fallback to WASM when native bindings are unavailable.
 *
 * Requirements: 13.5, 13.7
 */

import { hasNativeBinding, hasCppBinding, hasRustBinding } from '../native.js';

/**
 * Reasons for using WASM fallback
 */
export enum WasmFallbackReason {
  /** Native bindings not available */
  NATIVE_UNAVAILABLE = 'NATIVE_UNAVAILABLE',
  /** C++ binding not available */
  CPP_UNAVAILABLE = 'CPP_UNAVAILABLE',
  /** Rust binding not available */
  RUST_UNAVAILABLE = 'RUST_UNAVAILABLE',
  /** Native operation failed */
  NATIVE_FAILED = 'NATIVE_FAILED',
  /** User explicitly requested WASM */
  USER_REQUESTED = 'USER_REQUESTED',
  /** Platform not supported for native */
  PLATFORM_UNSUPPORTED = 'PLATFORM_UNSUPPORTED',
}

/**
 * Information about WASM fallback usage
 */
export interface WasmFallbackInfo {
  /** Whether WASM fallback was used */
  readonly usedWasm: boolean;
  /** Reason for using WASM (if applicable) */
  readonly reason?: WasmFallbackReason | undefined;
  /** Detailed message */
  readonly message?: string | undefined;
  /** Original error (if native failed) */
  readonly originalError?: Error | undefined;
}

/**
 * Debug logger for WASM executor
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
  const debugEnv = process.env['DEBUG'];
  const zkDebugEnv = process.env['ZK_ACCELERATE_DEBUG'];
  const debugEnabled =
    debugEnv?.includes('zk-accelerate') || zkDebugEnv === '1' || zkDebugEnv === 'true';

  if (debugEnabled) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [zk-accelerate:wasm-executor]`;
    if (data) {
      console.debug(`${prefix} ${message}`, data);
    } else {
      console.debug(`${prefix} ${message}`);
    }
  }
}

/**
 * Check if native bindings are available
 */
function checkNativeAvailability(): WasmFallbackInfo {
  if (!hasNativeBinding()) {
    const message = 'No native bindings available';
    debugLog(message, {
      hasCpp: hasCppBinding(),
      hasRust: hasRustBinding(),
      platform: process.platform,
      arch: process.arch,
    });

    return {
      usedWasm: true,
      reason: WasmFallbackReason.NATIVE_UNAVAILABLE,
      message,
    };
  }

  return { usedWasm: false };
}

/**
 * Check platform support for native bindings
 */
function checkPlatformSupport(): WasmFallbackInfo {
  const platform = process.platform;
  const arch = process.arch;

  // Primary support: Apple Silicon macOS
  if (platform === 'darwin' && arch === 'arm64') {
    return { usedWasm: false };
  }

  // Secondary support: Intel macOS
  if (platform === 'darwin' && arch === 'x64') {
    return { usedWasm: false };
  }

  // Linux ARM64 has limited support
  if (platform === 'linux' && arch === 'arm64') {
    return { usedWasm: false };
  }

  // Other platforms use WASM
  const message = `Platform ${platform}-${arch} uses WASM fallback`;
  debugLog(message);

  return {
    usedWasm: true,
    reason: WasmFallbackReason.PLATFORM_UNSUPPORTED,
    message,
  };
}

/**
 * Execute an operation with WASM fallback
 *
 * @param nativeOperation - The native operation to attempt
 * @param wasmFallback - The WASM fallback operation
 * @param operationName - Name of the operation for logging
 * @returns Result and fallback info
 */
export function executeWithWasmFallback<T>(
  nativeOperation: () => T,
  wasmFallback: () => T,
  operationName: string = 'operation'
): { result: T; fallbackInfo: WasmFallbackInfo } {
  // Check platform support
  const platformCheck = checkPlatformSupport();
  if (platformCheck.usedWasm) {
    debugLog(`Using WASM for ${operationName}: ${platformCheck.message}`);
    return {
      result: wasmFallback(),
      fallbackInfo: platformCheck,
    };
  }

  // Check native availability
  const availabilityCheck = checkNativeAvailability();
  if (availabilityCheck.usedWasm) {
    debugLog(`Using WASM for ${operationName}: ${availabilityCheck.message}`);
    return {
      result: wasmFallback(),
      fallbackInfo: availabilityCheck,
    };
  }

  // Try native operation
  try {
    const result = nativeOperation();
    return {
      result,
      fallbackInfo: { usedWasm: false },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const originalError = error instanceof Error ? error : undefined;

    debugLog(`Native ${operationName} failed, using WASM fallback: ${errorMessage}`);

    return {
      result: wasmFallback(),
      fallbackInfo: {
        usedWasm: true,
        reason: WasmFallbackReason.NATIVE_FAILED,
        message: errorMessage,
        originalError,
      },
    };
  }
}

/**
 * Execute an async operation with WASM fallback
 *
 * @param nativeOperation - The native async operation to attempt
 * @param wasmFallback - The WASM fallback operation
 * @param operationName - Name of the operation for logging
 * @returns Result and fallback info
 */
export async function executeWithWasmFallbackAsync<T>(
  nativeOperation: () => Promise<T>,
  wasmFallback: () => T | Promise<T>,
  operationName: string = 'operation'
): Promise<{ result: T; fallbackInfo: WasmFallbackInfo }> {
  // Check platform support
  const platformCheck = checkPlatformSupport();
  if (platformCheck.usedWasm) {
    debugLog(`Using WASM for ${operationName}: ${platformCheck.message}`);
    return {
      result: await wasmFallback(),
      fallbackInfo: platformCheck,
    };
  }

  // Check native availability
  const availabilityCheck = checkNativeAvailability();
  if (availabilityCheck.usedWasm) {
    debugLog(`Using WASM for ${operationName}: ${availabilityCheck.message}`);
    return {
      result: await wasmFallback(),
      fallbackInfo: availabilityCheck,
    };
  }

  // Try native operation
  try {
    const result = await nativeOperation();
    return {
      result,
      fallbackInfo: { usedWasm: false },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const originalError = error instanceof Error ? error : undefined;

    debugLog(`Native ${operationName} failed, using WASM fallback: ${errorMessage}`);

    return {
      result: await wasmFallback(),
      fallbackInfo: {
        usedWasm: true,
        reason: WasmFallbackReason.NATIVE_FAILED,
        message: errorMessage,
        originalError,
      },
    };
  }
}

/**
 * Get a human-readable description of a fallback reason
 */
export function getWasmFallbackReasonDescription(reason: WasmFallbackReason): string {
  switch (reason) {
    case WasmFallbackReason.NATIVE_UNAVAILABLE:
      return 'Native bindings are not available';
    case WasmFallbackReason.CPP_UNAVAILABLE:
      return 'C++ native binding is not available';
    case WasmFallbackReason.RUST_UNAVAILABLE:
      return 'Rust native binding is not available';
    case WasmFallbackReason.NATIVE_FAILED:
      return 'Native operation failed';
    case WasmFallbackReason.USER_REQUESTED:
      return 'User explicitly requested WASM';
    case WasmFallbackReason.PLATFORM_UNSUPPORTED:
      return 'Platform does not support native bindings';
    default:
      return 'Unknown reason';
  }
}

/**
 * Force WASM mode for testing or debugging
 */
let forceWasmMode = false;

export function setForceWasmMode(force: boolean): void {
  forceWasmMode = force;
  debugLog(`Force WASM mode: ${force}`);
}

export function isForceWasmMode(): boolean {
  return forceWasmMode;
}
