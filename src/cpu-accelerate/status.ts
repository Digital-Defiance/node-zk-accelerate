/**
 * CPU Accelerator Status
 *
 * Provides status information about available CPU acceleration features.
 *
 * Requirements: 6.1, 6.7
 */

import { loadCppBinding } from '../native.js';

/**
 * CPU accelerator status information
 */
export interface CPUAcceleratorStatus {
  /** Whether vDSP (Apple Accelerate) is available */
  readonly vdspAvailable: boolean;
  /** Whether BLAS (Apple Accelerate) is available */
  readonly blasAvailable: boolean;
  /** Whether NEON SIMD is available */
  readonly neonAvailable: boolean;
  /** Whether AMX (Apple Matrix Coprocessor) is available */
  readonly amxAvailable: boolean;
  /** Whether SME (Scalable Matrix Extension) is available (M4+) */
  readonly smeAvailable: boolean;
}

// Cached status
let cachedStatus: CPUAcceleratorStatus | null = null;

/**
 * Get CPU accelerator status from native binding
 */
function getStatusFromNative(): CPUAcceleratorStatus | null {
  const binding = loadCppBinding();
  if (!binding) {
    return null;
  }

  try {
    // Check if the new function exists
    if (binding.getCPUAcceleratorStatus) {
      return binding.getCPUAcceleratorStatus();
    }
  } catch {
    // Function not available in this version of the binding
  }

  return null;
}

/**
 * Get CPU accelerator status using JavaScript fallback
 */
function getStatusFromJS(): CPUAcceleratorStatus {
  const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
  const isMacOS = process.platform === 'darwin';
  const isARM64 = process.arch === 'arm64';

  return {
    vdspAvailable: isMacOS,
    blasAvailable: isMacOS,
    neonAvailable: isARM64,
    amxAvailable: isAppleSilicon,
    smeAvailable: false, // Cannot detect SME without native code
  };
}

/**
 * Get the status of CPU acceleration features
 *
 * Returns information about which CPU acceleration features are available
 * on the current system. This includes:
 * - vDSP: Apple's vector DSP library for vectorized operations
 * - BLAS: Basic Linear Algebra Subprograms (uses AMX on Apple Silicon)
 * - NEON: ARM SIMD instructions
 * - AMX: Apple Matrix Coprocessor (via Accelerate framework)
 * - SME: Scalable Matrix Extension (M4+ chips)
 *
 * @returns CPU accelerator status object
 *
 * @example
 * ```typescript
 * const status = getCPUAcceleratorStatus();
 * if (status.vdspAvailable) {
 *   console.log('vDSP acceleration available');
 * }
 * if (status.smeAvailable) {
 *   console.log('SME (M4) acceleration available');
 * }
 * ```
 */
export function getCPUAcceleratorStatus(): CPUAcceleratorStatus {
  if (cachedStatus !== null) {
    return cachedStatus;
  }

  // Try native binding first
  const nativeStatus = getStatusFromNative();
  if (nativeStatus !== null) {
    cachedStatus = nativeStatus;
    return cachedStatus;
  }

  // Fall back to JavaScript detection
  cachedStatus = getStatusFromJS();
  return cachedStatus;
}

/**
 * Check if any CPU acceleration is available
 *
 * @returns true if at least one CPU acceleration feature is available
 */
export function isCPUAccelerationAvailable(): boolean {
  const status = getCPUAcceleratorStatus();
  return (
    status.vdspAvailable ||
    status.blasAvailable ||
    status.neonAvailable ||
    status.amxAvailable ||
    status.smeAvailable
  );
}

/**
 * Clear the cached CPU accelerator status
 *
 * Useful for testing or when hardware configuration might have changed.
 */
export function clearCPUAcceleratorStatusCache(): void {
  cachedStatus = null;
}
