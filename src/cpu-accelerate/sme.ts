/**
 * SME (Scalable Matrix Extension) Operations
 *
 * Provides TypeScript interface to SME matrix operations for M4 chips.
 * SME is an experimental feature that provides hardware-accelerated
 * matrix outer products for MSM bucket accumulation.
 *
 * Note: SME is only available on M4 and later Apple Silicon chips.
 * This implementation includes fallback to BLAS/AMX when SME is unavailable.
 *
 * Requirements: 6.5, 2.8, 9.1
 */

import { loadCppBinding } from '../native.js';
import { getCPUAcceleratorStatus } from './status.js';
import { createBLASOperations } from './blas.js';

/**
 * SME operations interface
 */
export interface SMEOperations {
  /**
   * Check if SME is available (M4+ chips)
   */
  isAvailable(): boolean;

  /**
   * Check if this is an experimental feature
   */
  isExperimental(): boolean;

  /**
   * Matrix outer product for bucket accumulation
   *
   * Uses SME's matrix outer product instructions to efficiently
   * accumulate points into buckets for MSM.
   *
   * @param scalars Scalar values
   * @param points Point coordinates (flattened)
   * @param numBuckets Number of buckets per window
   * @param windowSize Bits per window for bucket indexing
   * @returns Object with accumulated buckets and `usedSME`, which reports
   *   whether SME instructions were actually issued for this call -- not
   *   whether the hardware supports SME. It is currently always false: no
   *   implementation here issues SME instructions.
   */
  bucketOuterProduct(
    scalars: BigUint64Array,
    points: Float64Array,
    numBuckets: number,
    windowSize: number
  ): { buckets: Float64Array; usedSME: boolean };

  /**
   * Matrix accumulation with SME
   *
   * Performs C = A * B using SME when available.
   *
   * @param a Matrix A (m x k)
   * @param b Matrix B (k x n)
   * @param m Rows of A and C
   * @param n Columns of B and C
   * @param k Columns of A, rows of B
   * @returns Object with result matrix and `usedSME`, which reports whether
   *   SME instructions were actually issued for this call. It is currently
   *   always false; the work goes through BLAS, which does not say what it
   *   used internally.
   */
  matrixAccumulate(
    a: Float64Array,
    b: Float64Array,
    m: number,
    n: number,
    k: number
  ): { result: Float64Array; usedSME: boolean };
}

/**
 * Native SME implementation
 */
class NativeSMEOperations implements SMEOperations {
  private binding: ReturnType<typeof loadCppBinding>;
  private blasOps = createBLASOperations();

  constructor() {
    this.binding = loadCppBinding();
  }

  isAvailable(): boolean {
    if (!this.binding) {
      return false;
    }

    if (this.binding.smeAvailable) {
      return this.binding.smeAvailable();
    }

    return getCPUAcceleratorStatus().smeAvailable;
  }

  isExperimental(): boolean {
    return true; // SME support is experimental
  }

  bucketOuterProduct(
    scalars: BigUint64Array,
    points: Float64Array,
    numBuckets: number,
    windowSize: number
  ): { buckets: Float64Array; usedSME: boolean } {
    const buckets = new Float64Array(numBuckets);
    const bucketMask = (1n << BigInt(windowSize)) - 1n;

    // Accumulate points into buckets based on scalar window bits
    for (let i = 0; i < scalars.length; i++) {
      const bucketIdx = Number(scalars[i]! & bucketMask);
      if (bucketIdx > 0 && bucketIdx <= numBuckets) {
        // Bucket indices are 1-based in scalars, 0-based in array
        const idx = bucketIdx - 1;
        buckets[idx] = (buckets[idx] ?? 0) + (points[i] ?? 0);
      }
    }

    // The loop above is plain JavaScript over a Float64Array. No SME
    // instruction was issued and no native call was made, so usedSME is false
    // regardless of what the hardware supports. It previously returned
    // this.isAvailable(), which reported the chip's capability as though it
    // described the work that had just been done.
    return { buckets, usedSME: false };
  }

  matrixAccumulate(
    a: Float64Array,
    b: Float64Array,
    m: number,
    n: number,
    k: number
  ): { result: Float64Array; usedSME: boolean } {
    // This calls BLAS (dgemm) through Accelerate. Accelerate may internally
    // use the matrix coprocessor or SME, but it does not report which, and we
    // did not issue an SME instruction ourselves. usedSME therefore stays
    // false: it answers "did this code run SME?", not "might something
    // underneath have?".
    const result = this.blasOps.matrixMul(a, b, m, n, k);
    return { result, usedSME: false };
  }
}

/**
 * JavaScript fallback SME implementation
 */
class JSSMEOperations implements SMEOperations {
  private blasOps = createBLASOperations();

  isAvailable(): boolean {
    return false; // JS implementation doesn't have SME
  }

  isExperimental(): boolean {
    return true;
  }

  bucketOuterProduct(
    scalars: BigUint64Array,
    points: Float64Array,
    numBuckets: number,
    windowSize: number
  ): { buckets: Float64Array; usedSME: boolean } {
    const buckets = new Float64Array(numBuckets);
    const bucketMask = (1n << BigInt(windowSize)) - 1n;

    for (let i = 0; i < scalars.length; i++) {
      const bucketIdx = Number(scalars[i]! & bucketMask);
      if (bucketIdx > 0 && bucketIdx <= numBuckets) {
        const idx = bucketIdx - 1;
        buckets[idx] = (buckets[idx] ?? 0) + (points[i] ?? 0);
      }
    }

    return { buckets, usedSME: false };
  }

  matrixAccumulate(
    a: Float64Array,
    b: Float64Array,
    m: number,
    n: number,
    k: number
  ): { result: Float64Array; usedSME: boolean } {
    const result = this.blasOps.matrixMul(a, b, m, n, k);
    return { result, usedSME: false };
  }
}

// Cached instance
let smeInstance: SMEOperations | null = null;

/**
 * Create or get the SME operations instance
 *
 * Returns a native implementation if available, otherwise falls back
 * to a JavaScript implementation.
 *
 * Note: SME is an experimental feature only available on M4+ chips.
 * The implementation will automatically fall back to BLAS/AMX when
 * SME is not available.
 *
 * @returns SMEOperations instance
 */
export function createSMEOperations(): SMEOperations {
  if (smeInstance !== null) {
    return smeInstance;
  }

  // Try native implementation first
  const binding = loadCppBinding();
  if (binding !== null) {
    smeInstance = new NativeSMEOperations();
    return smeInstance;
  }

  // Fall back to JavaScript implementation
  smeInstance = new JSSMEOperations();
  return smeInstance;
}

/**
 * Get SME availability status with detailed information
 *
 * @returns Object with SME availability details
 */
export function getSMEStatus(): {
  available: boolean;
  experimental: boolean;
  fallbackAvailable: boolean;
  fallbackType: 'amx' | 'blas' | 'js';
} {
  const status = getCPUAcceleratorStatus();

  let fallbackType: 'amx' | 'blas' | 'js';
  // 'amx' is only reported if AMX is actually known to be available, which it
  // never is (see CPUAcceleratorStatus.amxAvailable). What actually runs when
  // SME is absent is BLAS, so that is what gets reported.
  if (status.amxAvailable === true) {
    fallbackType = 'amx';
  } else if (status.blasAvailable) {
    fallbackType = 'blas';
  } else {
    fallbackType = 'js';
  }

  return {
    available: status.smeAvailable,
    experimental: true,
    fallbackAvailable: true,
    fallbackType,
  };
}
