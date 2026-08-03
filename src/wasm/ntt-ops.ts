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
 * Modular exponentiation, base^exp mod modulus
 */
function modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exp;

  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % modulus;
    }
    b = (b * b) % modulus;
    e >>= 1n;
  }

  return result;
}

/**
 * Compute a primitive n-th root of unity for the field, and verify it.
 *
 * `src/ntt/config.ts` (`findPrimitiveRoot`) is the reference implementation of
 * these checks; this is the same set of checks applied to the WASM fallback
 * path, which previously had none:
 *
 *  1. n divides p-1. Without this, `(p-1)/n` is a floor division and
 *     `g^((p-1)/n)` is not an n-th root of unity at all -- it is an unrelated
 *     field element, and the transform silently computes nonsense.
 *  2. omega^n == 1, so omega really is an n-th root of unity.
 *  3. omega^(n/2) != 1, so omega has order exactly n rather than a proper
 *     divisor of n. Without this the twiddle factors repeat early and the
 *     transform is not invertible.
 *
 * The generator 5 is correct for both supported scalar fields -- it is a
 * quadratic non-residue modulo the BN254 and BLS12-381 scalar field moduli --
 * but it is not correct for an arbitrary field, and nothing here restricts the
 * caller to those two. Check 3 is what catches a bad generator: if 5 is a
 * square mod p then omega^(n/2) == 1 and this throws instead of returning a
 * root that does not generate the required subgroup.
 *
 * @throws {Error} if n does not divide p-1, or if the computed value is not a
 *   primitive n-th root of unity
 */
function computeRootOfUnity(n: number, field: FieldConfig): FieldElement {
  const modulus = field.modulus;
  const pMinus1 = modulus - 1n;
  const nBig = BigInt(n);

  // 1. n must divide p-1, or the exponent below is a floor division and the
  //    result bears no relation to an n-th root of unity.
  if (pMinus1 % nBig !== 0n) {
    throw new Error(
      `NTT size ${n} does not divide p-1 for this field, so no primitive ${n}-th root of unity exists`
    );
  }

  const generator = 5n;
  const omega = modPow(generator, pMinus1 / nBig, modulus);

  // 2. omega^n must be 1.
  if (modPow(omega, nBig, modulus) !== 1n) {
    throw new Error(
      `Computed value is not an ${n}-th root of unity for this field ` +
        `(generator ${generator} is not usable here)`
    );
  }

  // 3. omega^(n/2) must not be 1, or omega's order is a proper divisor of n.
  if (n > 1 && modPow(omega, nBig / 2n, modulus) === 1n) {
    throw new Error(
      `Computed ${n}-th root of unity is not primitive for this field ` +
        `(generator ${generator} is not a quadratic non-residue here)`
    );
  }

  return createFieldElementFromBigint(omega, field);
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
