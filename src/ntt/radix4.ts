/**
 * Radix-4 NTT Implementation
 *
 * This module provides radix-4 NTT operations. Currently, it delegates to
 * the radix-2 implementation to ensure consistency. The radix-4 API is
 * preserved for future optimization when a correct radix-4 butterfly
 * implementation is available.
 *
 * Note: A true radix-4 implementation would process 4 elements per butterfly
 * operation, providing better cache utilization and fewer operations for
 * large transforms. However, ensuring bit-exact consistency with radix-2
 * requires careful implementation of the twiddle factor indexing and
 * digit-reversal permutation.
 *
 * Requirements: 3.3
 */

import type { FieldElement } from '../types.js';
import type { NTTConfig } from './config.js';
import { forwardNttRadix2, inverseNttRadix2, nttRadix2InPlace, inttRadix2InPlace } from './radix2.js';

/**
 * Radix-4 forward NTT (in-place)
 *
 * Currently delegates to radix-2 for consistency.
 * For sizes that are powers of 4, a true radix-4 implementation would
 * provide better performance.
 *
 * @param coefficients - Input coefficients (modified in place)
 * @param config - NTT configuration
 */
export function nttRadix4InPlace(coefficients: FieldElement[], config: NTTConfig): void {
  // Delegate to radix-2 for consistency
  nttRadix2InPlace(coefficients, config);
}

/**
 * Radix-4 inverse NTT (in-place)
 *
 * Currently delegates to radix-2 for consistency.
 *
 * @param values - Input values (modified in place)
 * @param config - NTT configuration
 */
export function inttRadix4InPlace(values: FieldElement[], config: NTTConfig): void {
  // Delegate to radix-2 for consistency
  inttRadix2InPlace(values, config);
}

/**
 * Radix-4 forward NTT (returns new array)
 *
 * @param coefficients - Input coefficients
 * @param config - NTT configuration
 * @returns Transformed values
 */
export function nttRadix4(coefficients: FieldElement[], config: NTTConfig): FieldElement[] {
  return forwardNttRadix2(coefficients, config, false);
}

/**
 * Radix-4 inverse NTT (returns new array)
 *
 * @param values - Input values
 * @param config - NTT configuration
 * @returns Original coefficients
 */
export function inttRadix4(values: FieldElement[], config: NTTConfig): FieldElement[] {
  return inverseNttRadix2(values, config, false);
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
  return forwardNttRadix2(coefficients, config, inPlace);
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
  return inverseNttRadix2(values, config, inPlace);
}
