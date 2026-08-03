/**
 * Radix-4 NTT Implementation
 *
 * This is a genuine radix-4 transform: each butterfly reads four elements,
 * writes four elements, and advances two Cooley-Tukey stages at once, halving
 * the number of passes over the array compared with radix-2. It does not
 * delegate to `radix2.ts`.
 *
 * (It used to. Every function here simply called the radix-2 implementation,
 * which made `ntt-consistency.prop.test.ts` -- a test asserting radix-2 equals
 * radix-4 -- compare a function with itself. That test could not fail and so
 * told us nothing. It is now a real cross-implementation check.)
 *
 * ## Why the outputs are bit-identical to radix-2
 *
 * The radix-4 butterfly below is the algebraic composition of the two radix-2
 * stages it replaces, evaluated in the same order on the same operands, so the
 * results are identical element for element, not merely equal up to
 * reassociation.
 *
 * Take a block of 4L consecutive elements after bit-reversal, with quarters
 * A, B, C, D (each of length L). Radix-2 stage s (m = 2L, half = L) pairs A
 * with B and C with D using twiddle W2 = w^(j*n/(2L)); stage s+1 (m = 4L,
 * half = 2L) then pairs the results, using W = w^(j*n/(4L)) for the first half
 * and W' = w^((L+j)*n/(4L)) for the second. Substituting the first stage into
 * the second gives, for each j in [0, L):
 *
 *     A1 = A + W2*B        B1 = A - W2*B
 *     C1 = C + W2*D        D1 = C - W2*D
 *     out[j]      = A1 + W*C1
 *     out[j+2L]   = A1 - W*C1
 *     out[j+L]    = B1 + W'*D1
 *     out[j+3L]   = B1 - W'*D1
 *
 * which is the 4-point butterfly implemented here. Note W2 = W^2 and
 * W' = w^(n/4) * W; both are read straight from the precomputed twiddle table
 * rather than derived, which is what keeps the arithmetic identical to radix-2
 * rather than merely equivalent.
 *
 * When log2(n) is odd there is an unpaired stage. It is executed first, as a
 * single radix-2 stage, so the remaining even number of stages can be fused.
 * The stage order is unchanged from radix-2, which is what the equality above
 * requires.
 *
 * Requirements: 3.3
 */

import type { FieldElement } from '../types.js';
import { cloneFieldElement } from '../field/element.js';
import { fieldAdd, fieldSub, fieldMul } from '../field/operations.js';
import type { NTTConfig } from './config.js';

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
 * Perform bit-reversal permutation on an array (in place)
 *
 * The same permutation radix-2 uses. Using it here, rather than a base-4
 * digit reversal, is deliberate: it is what makes the fused stages line up
 * with the radix-2 stages they replace.
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
 * Validate the input against the configuration and return log2(n)
 */
function checkSizeAndGetLogN(values: FieldElement[], config: NTTConfig): number {
  const n = values.length;

  if (n !== config.n) {
    throw new Error(`Input length ${n} does not match NTT config size ${config.n}`);
  }

  const logN = Math.log2(n);
  if (!Number.isInteger(logN)) {
    throw new Error(`NTT size must be a power of 2, got ${n}`);
  }

  return logN;
}

/**
 * A single radix-2 stage, used for the unpaired stage when log2(n) is odd.
 *
 * @param stage - 1-based stage index, as in the radix-2 implementation
 */
function radix2Stage(values: FieldElement[], twiddles: FieldElement[], stage: number): void {
  const n = values.length;
  const m = 1 << stage;
  const mHalf = m >> 1;
  const twiddleStep = n / m;

  for (let k = 0; k < n; k += m) {
    let twiddleIdx = 0;

    for (let j = 0; j < mHalf; j++) {
      const twiddle = twiddles[twiddleIdx]!;
      const u = values[k + j]!;
      const t = fieldMul(twiddle, values[k + j + mHalf]!);

      values[k + j] = fieldAdd(u, t);
      values[k + j + mHalf] = fieldSub(u, t);

      twiddleIdx += twiddleStep;
    }
  }
}

/**
 * A fused pair of stages, computed with 4-point butterflies.
 *
 * Covers radix-2 stages `stage` and `stage + 1` in one pass over the array.
 *
 * @param stage - 1-based index of the first of the two stages being fused
 */
function radix4Stage(values: FieldElement[], twiddles: FieldElement[], stage: number): void {
  const n = values.length;
  const quarter = 1 << (stage - 1); // L: length of each quarter of the block
  const blockSize = quarter * 4; // 4L
  const stepHalf = n / (blockSize / 2); // n/(2L), twiddle stride for W2
  const stepFull = n / blockSize; // n/(4L), twiddle stride for W and W'

  for (let k = 0; k < n; k += blockSize) {
    for (let j = 0; j < quarter; j++) {
      const iA = k + j;
      const iB = iA + quarter;
      const iC = iB + quarter;
      const iD = iC + quarter;

      const w2 = twiddles[j * stepHalf]!;
      const w = twiddles[j * stepFull]!;
      const wShifted = twiddles[(quarter + j) * stepFull]!;

      const a = values[iA]!;
      const b = values[iB]!;
      const c = values[iC]!;
      const d = values[iD]!;

      // First fused stage: pair (A,B) and (C,D)
      const tB = fieldMul(w2, b);
      const a1 = fieldAdd(a, tB);
      const b1 = fieldSub(a, tB);

      const tD = fieldMul(w2, d);
      const c1 = fieldAdd(c, tD);
      const d1 = fieldSub(c, tD);

      // Second fused stage: pair (A1,C1) and (B1,D1)
      const tC = fieldMul(w, c1);
      values[iA] = fieldAdd(a1, tC);
      values[iC] = fieldSub(a1, tC);

      const tD1 = fieldMul(wShifted, d1);
      values[iB] = fieldAdd(b1, tD1);
      values[iD] = fieldSub(b1, tD1);
    }
  }
}

/**
 * Run all butterfly stages using radix-4 passes, with one radix-2 pass first
 * when log2(n) is odd.
 */
function runStages(values: FieldElement[], twiddles: FieldElement[], logN: number): void {
  let stage = 1;

  if (logN % 2 === 1) {
    radix2Stage(values, twiddles, 1);
    stage = 2;
  }

  for (; stage < logN; stage += 2) {
    radix4Stage(values, twiddles, stage);
  }
}

/**
 * Radix-4 forward NTT (in-place)
 *
 * @param coefficients - Input coefficients (modified in place)
 * @param config - NTT configuration
 */
export function nttRadix4InPlace(coefficients: FieldElement[], config: NTTConfig): void {
  const logN = checkSizeAndGetLogN(coefficients, config);

  if (coefficients.length === 1) {
    return; // Nothing to do for size 1
  }

  bitReversePermutation(coefficients, logN);
  runStages(coefficients, config.twiddles, logN);
}

/**
 * Radix-4 inverse NTT (in-place)
 *
 * @param values - Input values (modified in place)
 * @param config - NTT configuration
 */
export function inttRadix4InPlace(values: FieldElement[], config: NTTConfig): void {
  const logN = checkSizeAndGetLogN(values, config);

  if (values.length === 1) {
    return; // Nothing to do for size 1
  }

  bitReversePermutation(values, logN);
  runStages(values, config.twiddlesInv, logN);

  // Scale by n^-1
  for (let i = 0; i < values.length; i++) {
    values[i] = fieldMul(values[i]!, config.nInv);
  }
}

/**
 * Radix-4 forward NTT (returns new array)
 *
 * @param coefficients - Input coefficients
 * @param config - NTT configuration
 * @returns Transformed values
 */
export function nttRadix4(coefficients: FieldElement[], config: NTTConfig): FieldElement[] {
  const result = coefficients.map(cloneFieldElement);
  nttRadix4InPlace(result, config);
  return result;
}

/**
 * Radix-4 inverse NTT (returns new array)
 *
 * @param values - Input values
 * @param config - NTT configuration
 * @returns Original coefficients
 */
export function inttRadix4(values: FieldElement[], config: NTTConfig): FieldElement[] {
  const result = values.map(cloneFieldElement);
  inttRadix4InPlace(result, config);
  return result;
}

/**
 * Forward NTT using radix-4 algorithm
 *
 * @param coefficients - Polynomial coefficients
 * @param config - NTT configuration
 * @param inPlace - Whether to modify input array in place
 * @returns Transformed values
 */
export function forwardNttRadix4(
  coefficients: FieldElement[],
  config: NTTConfig,
  inPlace: boolean = false
): FieldElement[] {
  if (inPlace) {
    nttRadix4InPlace(coefficients, config);
    return coefficients;
  }
  return nttRadix4(coefficients, config);
}

/**
 * Inverse NTT using radix-4 algorithm
 *
 * @param values - Transformed values
 * @param config - NTT configuration
 * @param inPlace - Whether to modify input array in place
 * @returns Original coefficients
 */
export function inverseNttRadix4(
  values: FieldElement[],
  config: NTTConfig,
  inPlace: boolean = false
): FieldElement[] {
  if (inPlace) {
    inttRadix4InPlace(values, config);
    return values;
  }
  return inttRadix4(values, config);
}
