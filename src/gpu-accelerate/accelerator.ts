/**
 * GPU Accelerator
 *
 * This module provides a high-level interface for GPU-accelerated
 * ZK operations. It handles automatic fallback to CPU when GPU
 * is unavailable.
 *
 * Requirements: 7.1, 7.8
 */

import { MetalGPU, getMetalGPU, type MetalGPUStatus } from './metal.js';
import { detectHardwareCapabilities } from '../hardware.js';

/**
 * GPU accelerator status
 */
export interface GPUAcceleratorStatus {
  /** Whether GPU acceleration is available */
  readonly available: boolean;
  /** Whether GPU is initialized */
  readonly initialized: boolean;
  /** Metal GPU status (if available) */
  readonly metal?: MetalGPUStatus | undefined;
  /** Fallback reason if GPU not available */
  readonly fallbackReason?: string | undefined;
}

/**
 * Debug logger for GPU accelerator
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
  const debugEnv = process.env['DEBUG'];
  const zkDebugEnv = process.env['ZK_ACCELERATE_DEBUG'];
  const debugEnabled =
    debugEnv?.includes('zk-accelerate') || zkDebugEnv === '1' || zkDebugEnv === 'true';

  if (debugEnabled) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [zk-accelerate:gpu]`;
    if (data) {
      console.debug(`${prefix} ${message}`, data);
    } else {
      console.debug(`${prefix} ${message}`);
    }
  }
}

/**
 * GPU Accelerator class
 *
 * Provides a unified interface for GPU acceleration with automatic
 * fallback handling.
 */
export class GPUAccelerator {
  private metal: MetalGPU;
  private initialized = false;
  private fallbackReason?: string;

  constructor() {
    this.metal = getMetalGPU();
  }

  /**
   * Initialize GPU accelerator
   *
   * @returns true if GPU acceleration is available
   */
  init(): boolean {
    if (this.initialized) {
      return this.isAvailable();
    }

    // Check hardware capabilities first
    const caps = detectHardwareCapabilities();

    if (!caps.hasMetal) {
      this.fallbackReason = 'Metal GPU not available on this system';
      debugLog(this.fallbackReason);
      this.initialized = true;
      return false;
    }

    // Try to initialize Metal
    const metalInit = this.metal.init();
    if (!metalInit) {
      this.fallbackReason = 'Failed to initialize Metal GPU';
      debugLog(this.fallbackReason);
      this.initialized = true;
      return false;
    }

    this.initialized = true;
    debugLog('GPU accelerator initialized');
    return true;
  }

  /**
   * Shutdown GPU accelerator
   */
  shutdown(): void {
    if (!this.initialized) {
      return;
    }

    this.metal.shutdown();
    this.initialized = false;
    debugLog('GPU accelerator shutdown');
  }

  /**
   * Check if GPU acceleration is available
   */
  isAvailable(): boolean {
    if (!this.initialized) {
      this.init();
    }

    return this.metal.isAvailable();
  }

  /**
   * Get GPU accelerator status
   */
  getStatus(): GPUAcceleratorStatus {
    const available = this.isAvailable();

    return {
      available,
      initialized: this.initialized,
      metal: available ? this.metal.getStatus() : undefined,
      fallbackReason: available ? undefined : this.fallbackReason,
    };
  }

  /**
   * Get the underlying Metal GPU instance
   */
  getMetal(): MetalGPU {
    return this.metal;
  }

  /**
   * Execute a GPU operation with automatic fallback
   *
   * @param gpuOperation The GPU operation to execute
   * @param cpuFallback The CPU fallback operation
   * @returns The result of the operation
   */
  async executeWithFallback<T>(
    gpuOperation: () => Promise<T>,
    cpuFallback: () => T
  ): Promise<T> {
    if (!this.isAvailable()) {
      debugLog('GPU not available, using CPU fallback');
      return cpuFallback();
    }

    try {
      return await gpuOperation();
    } catch (error) {
      debugLog('GPU operation failed, falling back to CPU', {
        error: error instanceof Error ? error.message : String(error),
      });
      return cpuFallback();
    }
  }

  /**
   * Execute a synchronous GPU operation with automatic fallback
   *
   * @param gpuOperation The GPU operation to execute
   * @param cpuFallback The CPU fallback operation
   * @returns The result of the operation
   */
  executeWithFallbackSync<T>(gpuOperation: () => T, cpuFallback: () => T): T {
    if (!this.isAvailable()) {
      debugLog('GPU not available, using CPU fallback');
      return cpuFallback();
    }

    try {
      return gpuOperation();
    } catch (error) {
      debugLog('GPU operation failed, falling back to CPU', {
        error: error instanceof Error ? error.message : String(error),
      });
      return cpuFallback();
    }
  }
}

// Singleton instance
let gpuAcceleratorInstance: GPUAccelerator | null = null;

/**
 * Get the GPU accelerator singleton instance
 */
export function getGPUAccelerator(): GPUAccelerator {
  if (!gpuAcceleratorInstance) {
    gpuAcceleratorInstance = new GPUAccelerator();
  }
  return gpuAcceleratorInstance;
}
