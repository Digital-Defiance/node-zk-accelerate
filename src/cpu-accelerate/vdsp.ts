/**
 * vDSP Vector Operations
 *
 * Provides TypeScript interface to Apple's vDSP library for
 * hardware-accelerated vector operations. These operations are
 * used for NTT butterfly computations and other vectorized
 * field arithmetic.
 *
 * Requirements: 6.2, 1.4
 */

import { loadCppBinding } from '../native.js';
import { getCPUAcceleratorStatus } from './status.js';

/**
 * vDSP operations interface
 */
export interface VDSPOperations {
  /**
   * Check if vDSP is available
   */
  isAvailable(): boolean;

  /**
   * Vector addition: C = A + B
   * @param a First input vector
   * @param b Second input vector
   * @returns Result vector
   */
  vectorAdd(a: Float64Array, b: Float64Array): Float64Array;

  /**
   * Vector multiplication: C = A * B (element-wise)
   * @param a First input vector
   * @param b Second input vector
   * @returns Result vector
   */
  vectorMul(a: Float64Array, b: Float64Array): Float64Array;

  /**
   * Vector subtraction: C = A - B
   * @param a First input vector
   * @param b Second input vector
   * @returns Result vector
   */
  vectorSub(a: Float64Array, b: Float64Array): Float64Array;

  /**
   * Vector scale: B = A * scalar
   * @param a Input vector
   * @param scalar Scalar value
   * @returns Result vector
   */
  vectorScale(a: Float64Array, scalar: number): Float64Array;

  /**
   * Vector multiply-add: D = A * B + C
   * @param a First input vector
   * @param b Second input vector
   * @param c Third input vector
   * @returns Result vector
   */
  vectorMulAdd(a: Float64Array, b: Float64Array, c: Float64Array): Float64Array;

  /**
   * NTT butterfly operation
   * Computes: out_even = in_even + twiddle * in_odd
   *           out_odd  = in_even - twiddle * in_odd
   * @param inEven Even-indexed inputs
   * @param inOdd Odd-indexed inputs
   * @param twiddleReal Real part of twiddle factors
   * @returns Object with outEven and outOdd arrays
   */
  nttButterfly(
    inEven: Float64Array,
    inOdd: Float64Array,
    twiddleReal: Float64Array
  ): { outEven: Float64Array; outOdd: Float64Array };
}

/**
 * Native vDSP implementation using C++ binding
 */
class NativeVDSPOperations implements VDSPOperations {
  private binding: ReturnType<typeof loadCppBinding>;

  constructor() {
    this.binding = loadCppBinding();
  }

  isAvailable(): boolean {
    return this.binding !== null && getCPUAcceleratorStatus().vdspAvailable;
  }

  vectorAdd(a: Float64Array, b: Float64Array): Float64Array {
    if (!this.binding) {
      throw new Error('Native binding not available');
    }

    if (this.binding.vdspVectorAdd) {
      return this.binding.vdspVectorAdd(a, b);
    }

    // Fallback to JS implementation
    return this.vectorAddJS(a, b);
  }

  vectorMul(a: Float64Array, b: Float64Array): Float64Array {
    if (!this.binding) {
      throw new Error('Native binding not available');
    }

    if (this.binding.vdspVectorMul) {
      return this.binding.vdspVectorMul(a, b);
    }

    // Fallback to JS implementation
    return this.vectorMulJS(a, b);
  }

  vectorSub(a: Float64Array, b: Float64Array): Float64Array {
    if (!this.binding) {
      throw new Error('Native binding not available');
    }

    if (this.binding.vdspVectorSub) {
      return this.binding.vdspVectorSub(a, b);
    }

    // Fallback to JS implementation
    return this.vectorSubJS(a, b);
  }

  vectorScale(a: Float64Array, scalar: number): Float64Array {
    // Scale is implemented in JS as native binding doesn't expose it directly
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! * scalar;
    }
    return result;
  }

  vectorMulAdd(a: Float64Array, b: Float64Array, c: Float64Array): Float64Array {
    // MulAdd: D = A * B + C
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! * b[i]! + c[i]!;
    }
    return result;
  }

  nttButterfly(
    inEven: Float64Array,
    inOdd: Float64Array,
    twiddleReal: Float64Array
  ): { outEven: Float64Array; outOdd: Float64Array } {
    const n = inEven.length;
    const outEven = new Float64Array(n);
    const outOdd = new Float64Array(n);

    // Use vectorized operations where possible
    const t = this.vectorMul(twiddleReal, inOdd);
    const even = this.vectorAdd(inEven, t);
    const odd = this.vectorSub(inEven, t);

    outEven.set(even);
    outOdd.set(odd);

    return { outEven, outOdd };
  }

  // JavaScript fallback implementations
  private vectorAddJS(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! + b[i]!;
    }
    return result;
  }

  private vectorMulJS(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! * b[i]!;
    }
    return result;
  }

  private vectorSubJS(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! - b[i]!;
    }
    return result;
  }
}

/**
 * JavaScript fallback vDSP implementation
 */
class JSVDSPOperations implements VDSPOperations {
  isAvailable(): boolean {
    return true; // JS fallback is always available
  }

  vectorAdd(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! + b[i]!;
    }
    return result;
  }

  vectorMul(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! * b[i]!;
    }
    return result;
  }

  vectorSub(a: Float64Array, b: Float64Array): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! - b[i]!;
    }
    return result;
  }

  vectorScale(a: Float64Array, scalar: number): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! * scalar;
    }
    return result;
  }

  vectorMulAdd(a: Float64Array, b: Float64Array, c: Float64Array): Float64Array {
    const result = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i]! * b[i]! + c[i]!;
    }
    return result;
  }

  nttButterfly(
    inEven: Float64Array,
    inOdd: Float64Array,
    twiddleReal: Float64Array
  ): { outEven: Float64Array; outOdd: Float64Array } {
    const n = inEven.length;
    const outEven = new Float64Array(n);
    const outOdd = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const t = twiddleReal[i]! * inOdd[i]!;
      outEven[i] = inEven[i]! + t;
      outOdd[i] = inEven[i]! - t;
    }

    return { outEven, outOdd };
  }
}

// Cached instance
let vdspInstance: VDSPOperations | null = null;

/**
 * Create or get the vDSP operations instance
 *
 * Returns a native implementation if available, otherwise falls back
 * to a JavaScript implementation.
 *
 * @returns VDSPOperations instance
 */
export function createVDSPOperations(): VDSPOperations {
  if (vdspInstance !== null) {
    return vdspInstance;
  }

  // Try native implementation first
  const binding = loadCppBinding();
  if (binding !== null) {
    const native = new NativeVDSPOperations();
    if (native.isAvailable()) {
      vdspInstance = native;
      return vdspInstance;
    }
  }

  // Fall back to JavaScript implementation
  vdspInstance = new JSVDSPOperations();
  return vdspInstance;
}
