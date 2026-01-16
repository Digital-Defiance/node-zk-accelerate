/**
 * Batch NTT Implementation
 *
 * This module provides batch NTT operations for processing multiple
 * polynomials efficiently. In a native implementation, this would use
 * thread pools for CPU parallelism.
 *
 * Requirements: 3.4
 */

import type { FieldElement, NTTOptions } from '../types.js';
import type { NTTConfig } from './config.js';
import { forwardNttRadix2, inverseNttRadix2 } from './radix2.js';
import { forwardNttRadix4, inverseNttRadix4 } from './radix4.js';

/**
 * Batch forward NTT
 *
 * Processes multiple polynomials with the same NTT configuration.
 * In a native implementation, this would parallelize across CPU cores.
 *
 * @param polynomials - Array of polynomial coefficient arrays
 * @param config - NTT configuration (all polynomials must have same size)
 * @param options - NTT options including radix selection
 * @returns Array of transformed polynomials
 */
export function batchForwardNtt(
  polynomials: FieldElement[][],
  config: NTTConfig,
  options: NTTOptions = {}
): FieldElement[][] {
  if (polynomials.length === 0) {
    return [];
  }

  const radix = options.radix ?? 2;
  const inPlace = options.inPlace ?? false;

  // Validate all polynomials have the correct size
  for (let i = 0; i < polynomials.length; i++) {
    const poly = polynomials[i]!;
    if (poly.length !== config.n) {
      throw new Error(
        `Polynomial ${i} has length ${poly.length}, expected ${config.n}`
      );
    }
  }

  // Select NTT implementation based on radix
  const nttFn = radix === 4 ? forwardNttRadix4 : forwardNttRadix2;

  // Process each polynomial
  // In a native implementation, this would be parallelized
  const results: FieldElement[][] = new Array(polynomials.length);

  for (let i = 0; i < polynomials.length; i++) {
    results[i] = nttFn(polynomials[i]!, config, inPlace);
  }

  return results;
}

/**
 * Batch inverse NTT
 *
 * Processes multiple transformed polynomials with the same NTT configuration.
 *
 * @param transformedPolynomials - Array of transformed polynomial arrays
 * @param config - NTT configuration
 * @param options - NTT options including radix selection
 * @returns Array of original polynomial coefficients
 */
export function batchInverseNtt(
  transformedPolynomials: FieldElement[][],
  config: NTTConfig,
  options: NTTOptions = {}
): FieldElement[][] {
  if (transformedPolynomials.length === 0) {
    return [];
  }

  const radix = options.radix ?? 2;
  const inPlace = options.inPlace ?? false;

  // Validate all polynomials have the correct size
  for (let i = 0; i < transformedPolynomials.length; i++) {
    const poly = transformedPolynomials[i]!;
    if (poly.length !== config.n) {
      throw new Error(
        `Polynomial ${i} has length ${poly.length}, expected ${config.n}`
      );
    }
  }

  // Select inverse NTT implementation based on radix
  const inttFn = radix === 4 ? inverseNttRadix4 : inverseNttRadix2;

  // Process each polynomial
  const results: FieldElement[][] = new Array(transformedPolynomials.length);

  for (let i = 0; i < transformedPolynomials.length; i++) {
    results[i] = inttFn(transformedPolynomials[i]!, config, inPlace);
  }

  return results;
}

/**
 * Batch NTT with direction parameter
 *
 * Unified interface for batch forward and inverse NTT.
 *
 * @param polynomials - Array of polynomial arrays
 * @param direction - 'forward' or 'inverse'
 * @param config - NTT configuration
 * @param options - NTT options
 * @returns Transformed polynomials
 */
export function batchNtt(
  polynomials: FieldElement[][],
  direction: 'forward' | 'inverse',
  config: NTTConfig,
  options: NTTOptions = {}
): FieldElement[][] {
  if (direction === 'forward') {
    return batchForwardNtt(polynomials, config, options);
  } else {
    return batchInverseNtt(polynomials, config, options);
  }
}

/**
 * Parallel batch NTT using Promise.all
 *
 * This provides async parallelism for batch NTT operations.
 * Useful when combined with worker threads in a native implementation.
 *
 * @param polynomials - Array of polynomial arrays
 * @param config - NTT configuration
 * @param options - NTT options
 * @returns Promise resolving to transformed polynomials
 */
export async function batchForwardNttAsync(
  polynomials: FieldElement[][],
  config: NTTConfig,
  options: NTTOptions = {}
): Promise<FieldElement[][]> {
  if (polynomials.length === 0) {
    return [];
  }

  const radix = options.radix ?? 2;
  const nttFn = radix === 4 ? forwardNttRadix4 : forwardNttRadix2;

  // Create promises for each polynomial
  const promises = polynomials.map((poly) =>
    Promise.resolve(nttFn(poly, config, false))
  );

  return Promise.all(promises);
}

/**
 * Parallel batch inverse NTT using Promise.all
 *
 * @param transformedPolynomials - Array of transformed polynomial arrays
 * @param config - NTT configuration
 * @param options - NTT options
 * @returns Promise resolving to original coefficients
 */
export async function batchInverseNttAsync(
  transformedPolynomials: FieldElement[][],
  config: NTTConfig,
  options: NTTOptions = {}
): Promise<FieldElement[][]> {
  if (transformedPolynomials.length === 0) {
    return [];
  }

  const radix = options.radix ?? 2;
  const inttFn = radix === 4 ? inverseNttRadix4 : inverseNttRadix2;

  const promises = transformedPolynomials.map((poly) =>
    Promise.resolve(inttFn(poly, config, false))
  );

  return Promise.all(promises);
}
