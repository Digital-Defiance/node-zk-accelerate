/**
 * Radix-2 NTT Implementation
 *
 * This module implements the Cooley-Tukey radix-2 NTT algorithm for
 * forward and inverse transforms. The implementation supports in-place
 * computation for memory efficiency.
 *
 * Requirements: 1.2, 3.1, 3.2, 3.3, 3.5
 */

import type { FieldElement } from '../types.js';
import { cloneFieldElement } from '../field/element.js';
import { fieldAdd, fieldSub, fieldMul } from '../field/operations.js';
import type { NTTConfig } from './config.js';

/**
 * Bit-reverse an index for NTT reordering
 *
 * @param index - The index to reverse
 * @param logN - log2(n) where n is the NTT size
 * @returns The bit-reversed index
 */
function bitReverse(index: number, logN: number): number {
  let result = 0;
  for (let i = 0; i < logN; i++) {
    result = (result << 1) | ((index >> i) & 1);
  }
  return result;
}

/**
 * Perform bit-reversal permutation on an array
 *
 * @param arr - The array to permute (modified in place)
 * @param logN - log2(n) where n is the array length
 */
function bitReversePermutation(arr: FieldElement[], logN: number): void {
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    const j = bitReverse(i, logN);
    if (i < j) {
      const temp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = temp;
    }
  }
}

/**
 * Radix-2 Cooley-Tukey forward NTT (in-place)
 *
 * Computes the Number Theoretic Transform using the Cooley-Tukey
 * decimation-in-time algorithm with bit-reversal permutation.
 *
 * @param coefficients - Input coefficients (modified in place)
 * @param config - NTT configuration with precomputed twiddle factors
 */
export function nttRadix2InPlace(coefficients: FieldElement[], config: NTTConfig): void {
  const n = coefficients.length;

  if (n !== config.n) {
    throw new Error(`Input length ${n} does not match NTT config size ${config.n}`);
  }

  if (n === 1) {
    return; // Nothing to do for size 1
  }

  const logN = Math.log2(n);
  if (!Number.isInteger(logN)) {
    throw new Error(`NTT size must be a power of 2, got ${n}`);
  }

  // Bit-reversal permutation
  bitReversePermutation(coefficients, logN);

  // Cooley-Tukey butterfly operations
  for (let s = 1; s <= logN; s++) {
    const m = 1 << s; // 2^s
    const mHalf = m >> 1; // m/2

    // Twiddle factor step: we need ω^(n/m) for this stage
    // The twiddles array contains ω^0, ω^1, ..., ω^(n/2-1)
    // For stage s, we need every (n/m)-th twiddle factor
    const twiddleStep = n / m;

    for (let k = 0; k < n; k += m) {
      let twiddleIdx = 0;

      for (let j = 0; j < mHalf; j++) {
        const twiddle = config.twiddles[twiddleIdx]!;
        const u = coefficients[k + j]!;
        const t = fieldMul(twiddle, coefficients[k + j + mHalf]!);

        coefficients[k + j] = fieldAdd(u, t);
        coefficients[k + j + mHalf] = fieldSub(u, t);

        twiddleIdx += twiddleStep;
      }
    }
  }
}

/**
 * Radix-2 Cooley-Tukey inverse NTT (in-place)
 *
 * Computes the inverse Number Theoretic Transform using the Cooley-Tukey
 * algorithm with inverse twiddle factors and final scaling by n^-1.
 *
 * @param values - Input values (modified in place)
 * @param config - NTT configuration with precomputed inverse twiddle factors
 */
export function inttRadix2InPlace(values: FieldElement[], config: NTTConfig): void {
  const n = values.length;

  if (n !== config.n) {
    throw new Error(`Input length ${n} does not match NTT config size ${config.n}`);
  }

  if (n === 1) {
    return; // Nothing to do for size 1
  }

  const logN = Math.log2(n);
  if (!Number.isInteger(logN)) {
    throw new Error(`NTT size must be a power of 2, got ${n}`);
  }

  // Bit-reversal permutation
  bitReversePermutation(values, logN);

  // Cooley-Tukey butterfly operations with inverse twiddle factors
  for (let s = 1; s <= logN; s++) {
    const m = 1 << s;
    const mHalf = m >> 1;
    const twiddleStep = n / m;

    for (let k = 0; k < n; k += m) {
      let twiddleIdx = 0;

      for (let j = 0; j < mHalf; j++) {
        const twiddle = config.twiddlesInv[twiddleIdx]!;
        const u = values[k + j]!;
        const t = fieldMul(twiddle, values[k + j + mHalf]!);

        values[k + j] = fieldAdd(u, t);
        values[k + j + mHalf] = fieldSub(u, t);

        twiddleIdx += twiddleStep;
      }
    }
  }

  // Scale by n^-1
  for (let i = 0; i < n; i++) {
    values[i] = fieldMul(values[i]!, config.nInv);
  }
}

/**
 * Radix-2 forward NTT (returns new array)
 *
 * @param coefficients - Input coefficients
 * @param config - NTT configuration
 * @returns Transformed values
 */
export function nttRadix2(coefficients: FieldElement[], config: NTTConfig): FieldElement[] {
  const result = coefficients.map(cloneFieldElement);
  nttRadix2InPlace(result, config);
  return result;
}

/**
 * Radix-2 inverse NTT (returns new array)
 *
 * @param values - Input values
 * @param config - NTT configuration
 * @returns Original coefficients
 */
export function inttRadix2(values: FieldElement[], config: NTTConfig): FieldElement[] {
  const result = values.map(cloneFieldElement);
  inttRadix2InPlace(result, config);
  return result;
}

/**
 * Forward NTT using radix-2 algorithm
 *
 * This is the main entry point for forward NTT computation.
 *
 * @param coefficients - Polynomial coefficients
 * @param config - NTT configuration
 * @param inPlace - Whether to modify input array in place
 * @returns Transformed values
 */
export function forwardNttRadix2(
  coefficients: FieldElement[],
  config: NTTConfig,
  inPlace: boolean = false
): FieldElement[] {
  if (inPlace) {
    nttRadix2InPlace(coefficients, config);
    return coefficients;
  }
  return nttRadix2(coefficients, config);
}

/**
 * Inverse NTT using radix-2 algorithm
 *
 * This is the main entry point for inverse NTT computation.
 *
 * @param values - Transformed values
 * @param config - NTT configuration
 * @param inPlace - Whether to modify input array in place
 * @returns Original coefficients
 */
export function inverseNttRadix2(
  values: FieldElement[],
  config: NTTConfig,
  inPlace: boolean = false
): FieldElement[] {
  if (inPlace) {
    inttRadix2InPlace(values, config);
    return values;
  }
  return inttRadix2(values, config);
}
