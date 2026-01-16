/**
 * @digitaldefiance/node-zk-accelerate
 * WASM Fallback - NTT Operations
 *
 * Pure JavaScript implementations of Number Theoretic Transform
 * for use when native bindings are unavailable.
 *
 * Requirements: 13.5, 13.7
 */

import type { FieldElement, FieldConfig } from '../types.js';
import {
  wasmFieldMul,
  wasmFieldAdd,
  wasmFieldSub,
  wasmFieldInv,
  createFieldElementFromBigint,
} from './field-ops.js';

/**
 * Compute primitive n-th root of unity for the field
 */
function computeRootOfUnity(n: number, field: FieldConfig): FieldElement {
  // For BN254 scalar field, the primitive root is known
  // This is a simplified implementation - production would use precomputed values
  const modulus = field.modulus;

  // Find generator g such that g^((p-1)/n) is a primitive n-th root
  // For simplicity, we use a known generator and compute the root
  const generator = 5n; // Common generator for many fields
  const exponent = (modulus - 1n) / BigInt(n);

  // Compute g^exponent mod p
  let result = 1n;
  let base = generator % modulus;
  let exp = exponent;

  while (exp > 0n) {
    if (exp & 1n) {
      result = (result * base) % modulus;
    }
    base = (base * base) % modulus;
    exp >>= 1n;
  }

  return createFieldElementFromBigint(result, field);
}

/**
 * Bit-reverse an index
 */
function bitReverse(index: number, logN: number): number {
  let result = 0;
  for (let i = 0; i < logN; i++) {
    result = (result << 1) | ((index >> i) & 1);
  }
  return result;
}

/**
 * Bit-reversal permutation of an array
 */
function bitReversePermutation(arr: FieldElement[]): FieldElement[] {
  const n = arr.length;
  const logN = Math.log2(n);
  const result: FieldElement[] = [];

  for (let i = 0; i < n; i++) {
    const revIdx = bitReverse(i, logN);
    const elem = arr[revIdx];
    if (elem) {
      result[i] = elem;
    }
  }

  return result;
}

/**
 * Forward NTT using Cooley-Tukey algorithm
 */
export function wasmForwardNtt(
  coefficients: FieldElement[],
  field: FieldConfig
): FieldElement[] {
  const n = coefficients.length;

  // Validate power of two
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error('NTT input length must be a power of two');
  }

  if (n === 1) {
    const first = coefficients[0];
    if (!first) {
      throw new Error('Empty coefficients array');
    }
    return [first];
  }

  const logN = Math.log2(n);

  // Compute root of unity
  const omega = computeRootOfUnity(n, field);

  // Precompute twiddle factors
  const twiddles: FieldElement[] = new Array(n / 2);
  let w = createFieldElementFromBigint(1n, field);
  for (let i = 0; i < n / 2; i++) {
    twiddles[i] = w;
    w = wasmFieldMul(w, omega);
  }

  // Bit-reversal permutation
  const result = bitReversePermutation(coefficients);

  // Cooley-Tukey butterfly
  for (let s = 1; s <= logN; s++) {
    const m = 1 << s;
    const mHalf = m >> 1;
    const twiddleStep = n / m;

    for (let k = 0; k < n; k += m) {
      for (let j = 0; j < mHalf; j++) {
        const twiddleIdx = j * twiddleStep;
        const twiddle = twiddles[twiddleIdx];
        const resultKJMHalf = result[k + j + mHalf];
        const resultKJ = result[k + j];

        if (twiddle && resultKJMHalf && resultKJ) {
          const t = wasmFieldMul(twiddle, resultKJMHalf);
          result[k + j] = wasmFieldAdd(resultKJ, t);
          result[k + j + mHalf] = wasmFieldSub(resultKJ, t);
        }
      }
    }
  }

  return result;
}

/**
 * Inverse NTT
 */
export function wasmInverseNtt(
  values: FieldElement[],
  field: FieldConfig
): FieldElement[] {
  const n = values.length;

  // Validate power of two
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error('NTT input length must be a power of two');
  }

  if (n === 1) {
    const first = values[0];
    if (!first) {
      throw new Error('Empty values array');
    }
    return [first];
  }

  const logN = Math.log2(n);

  // Compute inverse root of unity (omega^(-1))
  const omega = computeRootOfUnity(n, field);
  const omegaInv = wasmFieldInv(omega);

  // Precompute inverse twiddle factors
  const twiddles: FieldElement[] = new Array(n / 2);
  let w = createFieldElementFromBigint(1n, field);
  for (let i = 0; i < n / 2; i++) {
    twiddles[i] = w;
    w = wasmFieldMul(w, omegaInv);
  }

  // Bit-reversal permutation
  const result = bitReversePermutation(values);

  // Cooley-Tukey butterfly (same as forward, but with inverse twiddles)
  for (let s = 1; s <= logN; s++) {
    const m = 1 << s;
    const mHalf = m >> 1;
    const twiddleStep = n / m;

    for (let k = 0; k < n; k += m) {
      for (let j = 0; j < mHalf; j++) {
        const twiddleIdx = j * twiddleStep;
        const twiddle = twiddles[twiddleIdx];
        const resultKJMHalf = result[k + j + mHalf];
        const resultKJ = result[k + j];

        if (twiddle && resultKJMHalf && resultKJ) {
          const t = wasmFieldMul(twiddle, resultKJMHalf);
          result[k + j] = wasmFieldAdd(resultKJ, t);
          result[k + j + mHalf] = wasmFieldSub(resultKJ, t);
        }
      }
    }
  }

  // Scale by n^(-1)
  const nInv = wasmFieldInv(createFieldElementFromBigint(BigInt(n), field));
  for (let i = 0; i < n; i++) {
    const elem = result[i];
    if (elem) {
      result[i] = wasmFieldMul(elem, nInv);
    }
  }

  return result;
}

/**
 * Batch NTT - process multiple polynomials
 */
export function wasmBatchNtt(
  polynomials: FieldElement[][],
  direction: 'forward' | 'inverse',
  field: FieldConfig
): FieldElement[][] {
  const nttFn = direction === 'forward' ? wasmForwardNtt : wasmInverseNtt;
  return polynomials.map((poly) => nttFn(poly, field));
}
