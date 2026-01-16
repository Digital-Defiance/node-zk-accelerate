/**
 * NTT Input Validation
 *
 * This module provides validation functions for NTT inputs to ensure
 * correct operation and provide descriptive error messages.
 *
 * Requirements: 3.10
 */

import type { FieldConfig, FieldElement } from '../types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import type { NTTConfig } from './config.js';
import { isNTTSizeSupported } from './config.js';

/**
 * Check if a number is a power of two
 */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Get the next power of two greater than or equal to n
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Validate that the input length is a power of two
 *
 * @param length - The input length to validate
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if length is not a power of two
 */
export function validatePowerOfTwo(length: number, operation: string = 'NTT'): void {
  if (!isPowerOfTwo(length)) {
    const suggestion = nextPowerOfTwo(length);
    throw new ZkAccelerateError(
      `${operation} requires input length to be a power of two`,
      ErrorCode.INVALID_INPUT_SIZE,
      {
        actualSize: length,
        suggestion: `Use ${suggestion} instead (pad with zeros if needed)`,
      }
    );
  }
}

/**
 * Validate NTT input array
 *
 * Checks that:
 * 1. Array is not empty
 * 2. Length is a power of two
 * 3. All elements are from the same field
 *
 * @param coefficients - The input array to validate
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if validation fails
 */
export function validateNTTInput(
  coefficients: FieldElement[],
  operation: string = 'NTT'
): void {
  if (coefficients.length === 0) {
    throw new ZkAccelerateError(
      `${operation} requires non-empty input`,
      ErrorCode.INVALID_INPUT_SIZE,
      { actualSize: 0 }
    );
  }

  validatePowerOfTwo(coefficients.length, operation);

  // Check all elements are from the same field
  const firstField = coefficients[0]!.field;
  for (let i = 1; i < coefficients.length; i++) {
    const elem = coefficients[i]!;
    if (elem.field.modulus !== firstField.modulus) {
      throw new ZkAccelerateError(
        `${operation} requires all elements to be from the same field`,
        ErrorCode.INVALID_FIELD_ELEMENT,
        {
          index: i,
          expectedModulus: firstField.modulus.toString(),
          actualModulus: elem.field.modulus.toString(),
        }
      );
    }
  }
}

/**
 * Validate NTT configuration matches input
 *
 * @param coefficients - The input array
 * @param config - The NTT configuration
 * @throws ZkAccelerateError if configuration doesn't match
 */
export function validateNTTConfig(
  coefficients: FieldElement[],
  config: NTTConfig
): void {
  if (coefficients.length !== config.n) {
    throw new ZkAccelerateError(
      `Input length ${coefficients.length} does not match NTT config size ${config.n}`,
      ErrorCode.INVALID_INPUT_SIZE,
      {
        inputLength: coefficients.length,
        configSize: config.n,
      }
    );
  }

  // Check field compatibility
  if (coefficients.length > 0) {
    const inputField = coefficients[0]!.field;
    if (inputField.modulus !== config.field.modulus) {
      throw new ZkAccelerateError(
        'Input field does not match NTT config field',
        ErrorCode.INVALID_FIELD_ELEMENT,
        {
          inputModulus: inputField.modulus.toString(),
          configModulus: config.field.modulus.toString(),
        }
      );
    }
  }
}

/**
 * Validate that NTT size is supported for a given field
 *
 * @param n - The NTT size
 * @param field - The field configuration
 * @throws ZkAccelerateError if size is not supported
 */
export function validateNTTSizeForField(n: number, field: FieldConfig): void {
  if (!isPowerOfTwo(n)) {
    throw new ZkAccelerateError(
      'NTT size must be a power of two',
      ErrorCode.INVALID_INPUT_SIZE,
      { size: n }
    );
  }

  if (!isNTTSizeSupported(n, field)) {
    throw new ZkAccelerateError(
      `NTT size ${n} is not supported for this field (${n} must divide p-1)`,
      ErrorCode.INVALID_INPUT_SIZE,
      {
        size: n,
        modulus: field.modulus.toString(),
        pMinus1: (field.modulus - 1n).toString(),
      }
    );
  }
}

/**
 * Validate batch NTT input
 *
 * @param polynomials - Array of polynomial arrays
 * @param config - NTT configuration
 * @throws ZkAccelerateError if validation fails
 */
export function validateBatchNTTInput(
  polynomials: FieldElement[][],
  config: NTTConfig
): void {
  for (let i = 0; i < polynomials.length; i++) {
    const poly = polynomials[i]!;
    if (poly.length !== config.n) {
      throw new ZkAccelerateError(
        `Polynomial ${i} has length ${poly.length}, expected ${config.n}`,
        ErrorCode.INVALID_INPUT_SIZE,
        {
          polynomialIndex: i,
          actualLength: poly.length,
          expectedLength: config.n,
        }
      );
    }
  }
}

/**
 * Validate radix option
 *
 * @param radix - The radix value
 * @throws ZkAccelerateError if radix is invalid
 */
export function validateRadix(radix: number): void {
  if (radix !== 2 && radix !== 4) {
    throw new ZkAccelerateError(
      `Invalid NTT radix: ${radix}. Must be 2 or 4`,
      ErrorCode.INVALID_INPUT_SIZE,
      { radix, validValues: [2, 4] }
    );
  }
}
