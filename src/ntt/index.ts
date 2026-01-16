/**
 * Number Theoretic Transform (NTT) Module
 *
 * This module provides hardware-accelerated NTT operations for polynomial
 * multiplication in ZK proof systems. It supports both radix-2 and radix-4
 * implementations with batch processing capabilities.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.10
 */

import type { FieldElement, FieldConfig, NTTOptions } from '../types.js';
import { createNTTConfig, type NTTConfig } from './config.js';
import { forwardNttRadix2, inverseNttRadix2 } from './radix2.js';
import { forwardNttRadix4, inverseNttRadix4 } from './radix4.js';
import { batchForwardNtt, batchInverseNtt } from './batch.js';
import {
  validateNTTInput,
  validateNTTConfig,
  validateNTTSizeForField,
  validateRadix,
} from './validation.js';

// Re-export types and utilities
export type { NTTConfig } from './config.js';
export {
  createNTTConfig,
  getBN254NTTConfig,
  getBLS12381NTTConfig,
  clearNTTConfigCache,
  getMaxNTTSize,
  isNTTSizeSupported,
  findPrimitiveRoot,
  computeTwiddleFactors,
} from './config.js';

export {
  forwardNttRadix2,
  inverseNttRadix2,
  nttRadix2,
  inttRadix2,
  nttRadix2InPlace,
  inttRadix2InPlace,
} from './radix2.js';

export {
  forwardNttRadix4,
  inverseNttRadix4,
  nttRadix4,
  inttRadix4,
  nttRadix4InPlace,
  inttRadix4InPlace,
} from './radix4.js';

export {
  batchForwardNtt,
  batchInverseNtt,
  batchNtt,
  batchForwardNttAsync,
  batchInverseNttAsync,
} from './batch.js';

export {
  validateNTTInput,
  validateNTTConfig,
  validateNTTSizeForField,
  validateRadix,
  isPowerOfTwo,
  nextPowerOfTwo,
} from './validation.js';

/**
 * Forward NTT with automatic configuration
 *
 * This is the main entry point for forward NTT computation. It automatically
 * creates the NTT configuration based on input size and field.
 *
 * @param coefficients - Polynomial coefficients
 * @param options - NTT options (radix, inPlace, accelerationHint)
 * @returns Transformed values
 */
export function forwardNtt(
  coefficients: FieldElement[],
  options: NTTOptions = {}
): FieldElement[] {
  // Validate input
  validateNTTInput(coefficients, 'Forward NTT');

  const n = coefficients.length;
  const field = coefficients[0]!.field;

  // Validate NTT size is supported
  validateNTTSizeForField(n, field);

  // Create or get cached NTT configuration
  const config = createNTTConfig(n, field);

  // Select implementation based on radix
  const radix = options.radix ?? 2;
  validateRadix(radix);

  const inPlace = options.inPlace ?? false;

  if (radix === 4) {
    return forwardNttRadix4(coefficients, config, inPlace);
  } else {
    return forwardNttRadix2(coefficients, config, inPlace);
  }
}

/**
 * Inverse NTT with automatic configuration
 *
 * This is the main entry point for inverse NTT computation.
 *
 * @param values - Transformed values
 * @param options - NTT options
 * @returns Original polynomial coefficients
 */
export function inverseNtt(
  values: FieldElement[],
  options: NTTOptions = {}
): FieldElement[] {
  // Validate input
  validateNTTInput(values, 'Inverse NTT');

  const n = values.length;
  const field = values[0]!.field;

  // Validate NTT size is supported
  validateNTTSizeForField(n, field);

  // Create or get cached NTT configuration
  const config = createNTTConfig(n, field);

  // Select implementation based on radix
  const radix = options.radix ?? 2;
  validateRadix(radix);

  const inPlace = options.inPlace ?? false;

  if (radix === 4) {
    return inverseNttRadix4(values, config, inPlace);
  } else {
    return inverseNttRadix2(values, config, inPlace);
  }
}

/**
 * Forward NTT with explicit configuration
 *
 * Use this when you have a pre-created NTT configuration for better performance
 * in repeated operations.
 *
 * @param coefficients - Polynomial coefficients
 * @param config - Pre-created NTT configuration
 * @param options - NTT options
 * @returns Transformed values
 */
export function forwardNttWithConfig(
  coefficients: FieldElement[],
  config: NTTConfig,
  options: NTTOptions = {}
): FieldElement[] {
  validateNTTConfig(coefficients, config);

  const radix = options.radix ?? 2;
  const inPlace = options.inPlace ?? false;

  if (radix === 4) {
    return forwardNttRadix4(coefficients, config, inPlace);
  } else {
    return forwardNttRadix2(coefficients, config, inPlace);
  }
}

/**
 * Inverse NTT with explicit configuration
 *
 * @param values - Transformed values
 * @param config - Pre-created NTT configuration
 * @param options - NTT options
 * @returns Original polynomial coefficients
 */
export function inverseNttWithConfig(
  values: FieldElement[],
  config: NTTConfig,
  options: NTTOptions = {}
): FieldElement[] {
  validateNTTConfig(values, config);

  const radix = options.radix ?? 2;
  const inPlace = options.inPlace ?? false;

  if (radix === 4) {
    return inverseNttRadix4(values, config, inPlace);
  } else {
    return inverseNttRadix2(values, config, inPlace);
  }
}

/**
 * NTT Engine interface for advanced usage
 *
 * Provides a stateful interface for NTT operations with a fixed configuration.
 */
export interface NTTEngine {
  /** The NTT configuration */
  readonly config: NTTConfig;

  /** Forward NTT */
  forward(coefficients: FieldElement[], options?: NTTOptions): FieldElement[];

  /** Inverse NTT */
  inverse(values: FieldElement[], options?: NTTOptions): FieldElement[];

  /** Batch forward NTT */
  batchForward(polynomials: FieldElement[][], options?: NTTOptions): FieldElement[][];

  /** Batch inverse NTT */
  batchInverse(polynomials: FieldElement[][], options?: NTTOptions): FieldElement[][];
}

/**
 * Create an NTT engine for a specific size and field
 *
 * @param n - NTT size (must be power of 2)
 * @param field - Field configuration
 * @returns NTT engine instance
 */
export function createNTTEngine(n: number, field: FieldConfig): NTTEngine {
  validateNTTSizeForField(n, field);
  const config = createNTTConfig(n, field);

  return {
    config,

    forward(coefficients: FieldElement[], options: NTTOptions = {}): FieldElement[] {
      return forwardNttWithConfig(coefficients, config, options);
    },

    inverse(values: FieldElement[], options: NTTOptions = {}): FieldElement[] {
      return inverseNttWithConfig(values, config, options);
    },

    batchForward(polynomials: FieldElement[][], options: NTTOptions = {}): FieldElement[][] {
      return batchForwardNtt(polynomials, config, options);
    },

    batchInverse(polynomials: FieldElement[][], options: NTTOptions = {}): FieldElement[][] {
      return batchInverseNtt(polynomials, config, options);
    },
  };
}
