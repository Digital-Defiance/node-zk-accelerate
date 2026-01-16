/**
 * BLAS Matrix Operations
 *
 * Provides TypeScript interface to BLAS (Basic Linear Algebra Subprograms)
 * via Apple's Accelerate framework. On Apple Silicon, BLAS operations
 * automatically leverage AMX (Apple Matrix Coprocessor) for acceleration.
 *
 * Requirements: 6.4, 2.7
 */

import { loadCppBinding } from '../native.js';
import { getCPUAcceleratorStatus } from './status.js';

/**
 * BLAS operations interface
 */
export interface BLASOperations {
  /**
   * Check if BLAS is available
   */
  isAvailable(): boolean;

  /**
   * Check if AMX acceleration is being used
   */
  isAMXAccelerated(): boolean;

  /**
   * Matrix-matrix multiplication: C = alpha * A * B + beta * C
   * @param a Matrix A (m x k), row-major
   * @param b Matrix B (k x n), row-major
   * @param m Rows of A and C
   * @param n Columns of B and C
   * @param k Columns of A, rows of B
   * @param alpha Scalar multiplier for A*B (default: 1.0)
   * @param beta Scalar multiplier for C (default: 0.0)
   * @returns Result matrix C (m x n)
   */
  matrixMul(
    a: Float64Array,
    b: Float64Array,
    m: number,
    n: number,
    k: number,
    alpha?: number,
    beta?: number
  ): Float64Array;

  /**
   * Matrix-vector multiplication: y = alpha * A * x + beta * y
   * @param a Matrix A (m x n), row-major
   * @param x Vector x (n elements)
   * @param m Rows of A
   * @param n Columns of A
   * @param alpha Scalar multiplier for A*x (default: 1.0)
   * @param beta Scalar multiplier for y (default: 0.0)
   * @returns Result vector y (m elements)
   */
  matrixVectorMul(
    a: Float64Array,
    x: Float64Array,
    m: number,
    n: number,
    alpha?: number,
    beta?: number
  ): Float64Array;

  /**
   * Bucket accumulation for MSM using matrix operations
   * @param bucketIndices Array of bucket indices for each point
   * @param pointCoords Point coordinates (flattened)
   * @param numBuckets Number of buckets
   * @param coordSize Size of each coordinate
   * @returns Accumulated bucket values
   */
  bucketAccumulate(
    bucketIndices: Uint32Array,
    pointCoords: Float64Array,
    numBuckets: number,
    coordSize: number
  ): Float64Array;
}

/**
 * Native BLAS implementation using C++ binding
 */
class NativeBLASOperations implements BLASOperations {
  private binding: ReturnType<typeof loadCppBinding>;

  constructor() {
    this.binding = loadCppBinding();
  }

  isAvailable(): boolean {
    return this.binding !== null && getCPUAcceleratorStatus().blasAvailable;
  }

  isAMXAccelerated(): boolean {
    return getCPUAcceleratorStatus().amxAvailable;
  }

  matrixMul(
    a: Float64Array,
    b: Float64Array,
    m: number,
    n: number,
    k: number,
    _alpha: number = 1.0,
    _beta: number = 0.0
  ): Float64Array {
    if (!this.binding) {
      throw new Error('Native binding not available');
    }

    if (this.binding.blasMatrixMul) {
      return this.binding.blasMatrixMul(a, b, m, n, k);
    }

    // Fallback to JS implementation
    return this.matrixMulJS(a, b, m, n, k);
  }

  matrixVectorMul(
    a: Float64Array,
    x: Float64Array,
    m: number,
    n: number,
    _alpha: number = 1.0,
    _beta: number = 0.0
  ): Float64Array {
    // Implement as matrix multiplication with n x 1 matrix
    const result = new Float64Array(m);

    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += a[i * n + j]! * x[j]!;
      }
      result[i] = sum;
    }

    return result;
  }

  bucketAccumulate(
    bucketIndices: Uint32Array,
    pointCoords: Float64Array,
    numBuckets: number,
    coordSize: number
  ): Float64Array {
    // Direct accumulation (native BLAS bucket accumulation would be more complex)
    const result = new Float64Array(numBuckets * coordSize);

    const numPoints = bucketIndices.length;
    for (let i = 0; i < numPoints; i++) {
      const bucket = bucketIndices[i]!;
      if (bucket < numBuckets) {
        for (let c = 0; c < coordSize; c++) {
          const idx = bucket * coordSize + c;
          const srcIdx = i * coordSize + c;
          result[idx] = (result[idx] ?? 0) + (pointCoords[srcIdx] ?? 0);
        }
      }
    }

    return result;
  }

  // JavaScript fallback
  private matrixMulJS(
    a: Float64Array,
    b: Float64Array,
    m: number,
    n: number,
    k: number
  ): Float64Array {
    const result = new Float64Array(m * n);

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let p = 0; p < k; p++) {
          sum += (a[i * k + p] ?? 0) * (b[p * n + j] ?? 0);
        }
        result[i * n + j] = sum;
      }
    }

    return result;
  }
}

/**
 * JavaScript fallback BLAS implementation
 */
class JSBLASOperations implements BLASOperations {
  isAvailable(): boolean {
    return true; // JS fallback is always available
  }

  isAMXAccelerated(): boolean {
    return false; // JS implementation doesn't use AMX
  }

  matrixMul(
    a: Float64Array,
    b: Float64Array,
    m: number,
    n: number,
    k: number,
    alpha: number = 1.0,
    beta: number = 0.0
  ): Float64Array {
    const result = new Float64Array(m * n);

    // Initialize with beta * C (C is zero for new result)
    if (beta !== 0) {
      for (let i = 0; i < m * n; i++) {
        const val = result[i] ?? 0;
        result[i] = val * beta;
      }
    }

    // Add alpha * A * B
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let p = 0; p < k; p++) {
          sum += (a[i * k + p] ?? 0) * (b[p * n + j] ?? 0);
        }
        const idx = i * n + j;
        result[idx] = (result[idx] ?? 0) + alpha * sum;
      }
    }

    return result;
  }

  matrixVectorMul(
    a: Float64Array,
    x: Float64Array,
    m: number,
    n: number,
    alpha: number = 1.0,
    beta: number = 0.0
  ): Float64Array {
    const result = new Float64Array(m);

    // Initialize with beta * y (y is zero for new result)
    if (beta !== 0) {
      for (let i = 0; i < m; i++) {
        const val = result[i] ?? 0;
        result[i] = val * beta;
      }
    }

    // Add alpha * A * x
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += (a[i * n + j] ?? 0) * (x[j] ?? 0);
      }
      result[i] = (result[i] ?? 0) + alpha * sum;
    }

    return result;
  }

  bucketAccumulate(
    bucketIndices: Uint32Array,
    pointCoords: Float64Array,
    numBuckets: number,
    coordSize: number
  ): Float64Array {
    const result = new Float64Array(numBuckets * coordSize);

    const numPoints = bucketIndices.length;
    for (let i = 0; i < numPoints; i++) {
      const bucket = bucketIndices[i]!;
      if (bucket < numBuckets) {
        for (let c = 0; c < coordSize; c++) {
          const idx = bucket * coordSize + c;
          const srcIdx = i * coordSize + c;
          result[idx] = (result[idx] ?? 0) + (pointCoords[srcIdx] ?? 0);
        }
      }
    }

    return result;
  }
}

// Cached instance
let blasInstance: BLASOperations | null = null;

/**
 * Create or get the BLAS operations instance
 *
 * Returns a native implementation if available, otherwise falls back
 * to a JavaScript implementation.
 *
 * @returns BLASOperations instance
 */
export function createBLASOperations(): BLASOperations {
  if (blasInstance !== null) {
    return blasInstance;
  }

  // Try native implementation first
  const binding = loadCppBinding();
  if (binding !== null) {
    const native = new NativeBLASOperations();
    if (native.isAvailable()) {
      blasInstance = native;
      return blasInstance;
    }
  }

  // Fall back to JavaScript implementation
  blasInstance = new JSBLASOperations();
  return blasInstance;
}
