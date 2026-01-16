/**
 * @digitaldefiance/node-zk-accelerate
 * WASM Fallback Core
 *
 * Provides the core WASM fallback infrastructure for when native
 * bindings are unavailable.
 *
 * Requirements: 13.5, 13.7
 */

import { hasNativeBinding, getNativeBindingStatus } from '../native.js';

/**
 * WASM module status
 */
export interface WasmStatus {
  /** Whether WASM fallback is available */
  readonly available: boolean;
  /** Whether WASM is currently being used (native unavailable) */
  readonly inUse: boolean;
  /** Reason for using WASM (if applicable) */
  readonly reason: string | undefined;
  /** WASM implementation version */
  readonly version: string;
  /** Supported operations */
  readonly supportedOperations: string[];
}

/**
 * Debug logger for WASM fallback
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
  const debugEnv = process.env['DEBUG'];
  const zkDebugEnv = process.env['ZK_ACCELERATE_DEBUG'];
  const debugEnabled =
    debugEnv?.includes('zk-accelerate') || zkDebugEnv === '1' || zkDebugEnv === 'true';

  if (debugEnabled) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [zk-accelerate:wasm]`;
    if (data) {
      console.debug(`${prefix} ${message}`, data);
    } else {
      console.debug(`${prefix} ${message}`);
    }
  }
}

/**
 * WASM Fallback class
 *
 * Provides pure JavaScript/TypeScript implementations of core operations
 * that can be used when native bindings are unavailable.
 */
export class WasmFallback {
  private static instance: WasmFallback | null = null;
  private initialized: boolean = false;
  private readonly version: string = '0.1.0';

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): WasmFallback {
    if (!WasmFallback.instance) {
      WasmFallback.instance = new WasmFallback();
    }
    return WasmFallback.instance;
  }

  /**
   * Initialize the WASM fallback
   */
  initialize(): boolean {
    if (this.initialized) {
      return true;
    }

    debugLog('Initializing WASM fallback');

    // WASM fallback is always available as it's pure JS
    this.initialized = true;

    debugLog('WASM fallback initialized successfully');
    return true;
  }

  /**
   * Check if WASM fallback is available
   */
  isAvailable(): boolean {
    return true; // Pure JS implementation is always available
  }

  /**
   * Check if WASM fallback is currently in use
   */
  isInUse(): boolean {
    return !hasNativeBinding();
  }

  /**
   * Get the WASM fallback status
   */
  getStatus(): WasmStatus {
    const nativeStatus = getNativeBindingStatus();
    const inUse = !nativeStatus.cppLoaded && !nativeStatus.rustLoaded;

    let reason: string | undefined;
    if (inUse) {
      if (nativeStatus.cppError && nativeStatus.rustError) {
        reason = 'Native bindings unavailable';
      } else if (nativeStatus.cppError) {
        reason = `C++ binding error: ${nativeStatus.cppError}`;
      } else if (nativeStatus.rustError) {
        reason = `Rust binding error: ${nativeStatus.rustError}`;
      }
    }

    return {
      available: true,
      inUse,
      reason,
      version: this.version,
      supportedOperations: [
        'field_add',
        'field_sub',
        'field_mul',
        'field_inv',
        'field_neg',
        'batch_inv',
        'montgomery_mul',
        'point_add',
        'point_double',
        'scalar_mul',
        'is_on_curve',
        'forward_ntt',
        'inverse_ntt',
        'batch_ntt',
        'msm',
        'msm_naive',
      ],
    };
  }

  /**
   * Get the version string
   */
  getVersion(): string {
    return this.version;
  }
}

// Singleton accessor functions

let wasmFallbackInstance: WasmFallback | null = null;

/**
 * Get the WASM fallback instance
 */
export function getWasmFallback(): WasmFallback {
  if (!wasmFallbackInstance) {
    wasmFallbackInstance = WasmFallback.getInstance();
    wasmFallbackInstance.initialize();
  }
  return wasmFallbackInstance;
}

/**
 * Check if WASM fallback is available
 */
export function isWasmAvailable(): boolean {
  return getWasmFallback().isAvailable();
}

/**
 * Get the WASM fallback status
 */
export function getWasmStatus(): WasmStatus {
  return getWasmFallback().getStatus();
}
