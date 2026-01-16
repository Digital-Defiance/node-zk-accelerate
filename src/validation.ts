/**
 * Comprehensive Input Validation Module
 *
 * This module provides centralized validation functions for all public API
 * functions. Validation can be disabled for performance-critical code paths.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.6
 */

import type {
  FieldElement,
  FieldConfig,
  CurvePoint,
  CurveConfig,
} from './types.js';
import {
  ZkAccelerateError,
  ErrorCode,
  invalidCurvePointError,
  invalidFieldElementError,
  invalidScalarError,
  arrayLengthMismatchError,
  emptyInputError,
  fieldMismatchError,
  divisionByZeroError,
} from './errors.js';
import { getFieldElementValue, isZeroFieldElement } from './field/element.js';
import { isOnCurve } from './curve/operations.js';
import { toAffine, isIdentity } from './curve/point.js';

/**
 * Global validation configuration
 */
export interface ValidationConfig {
  /** Enable/disable all validation (default: true) */
  enabled: boolean;
  /** Enable/disable curve point validation (default: true) */
  validateCurvePoints: boolean;
  /** Enable/disable field element validation (default: true) */
  validateFieldElements: boolean;
  /** Enable/disable scalar validation (default: true) */
  validateScalars: boolean;
}

/**
 * Default validation configuration
 */
const defaultValidationConfig: ValidationConfig = {
  enabled: true,
  validateCurvePoints: true,
  validateFieldElements: true,
  validateScalars: true,
};

/**
 * Current validation configuration (can be modified at runtime)
 */
let currentValidationConfig: ValidationConfig = { ...defaultValidationConfig };

/**
 * Get the current validation configuration
 */
export function getValidationConfig(): Readonly<ValidationConfig> {
  return { ...currentValidationConfig };
}

/**
 * Set the validation configuration
 *
 * @param config - Partial configuration to merge with current config
 */
export function setValidationConfig(config: Partial<ValidationConfig>): void {
  currentValidationConfig = { ...currentValidationConfig, ...config };
}

/**
 * Reset validation configuration to defaults
 */
export function resetValidationConfig(): void {
  currentValidationConfig = { ...defaultValidationConfig };
}

/**
 * Run a function with validation temporarily disabled
 *
 * @param fn - Function to run without validation
 * @returns The result of the function
 */
export function withoutValidation<T>(fn: () => T): T {
  const previousConfig = { ...currentValidationConfig };
  currentValidationConfig.enabled = false;
  try {
    return fn();
  } finally {
    currentValidationConfig = previousConfig;
  }
}

/**
 * Check if validation is currently enabled
 */
export function isValidationEnabled(): boolean {
  return currentValidationConfig.enabled;
}

// ============================================================================
// Field Element Validation
// ============================================================================

/**
 * Validate that a field element value is within the field modulus
 *
 * @param value - The bigint value to validate
 * @param field - The field configuration
 * @param index - Optional index for error reporting
 * @throws ZkAccelerateError if value exceeds modulus
 */
export function validateFieldValue(
  value: bigint,
  field: FieldConfig,
  index?: number
): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateFieldElements) {
    return;
  }

  if (value < 0n) {
    throw new ZkAccelerateError(
      'Field element value must be non-negative',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { value: value.toString(), index }
    );
  }

  if (value >= field.modulus) {
    throw invalidFieldElementError(value.toString(), field.modulus.toString(), index);
  }
}

/**
 * Validate a field element
 *
 * @param element - The field element to validate
 * @param index - Optional index for error reporting
 * @throws ZkAccelerateError if element is invalid
 */
export function validateFieldElement(element: FieldElement, index?: number): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateFieldElements) {
    return;
  }

  const value = getFieldElementValue(element);
  validateFieldValue(value, element.field, index);
}

/**
 * Validate that two field elements are from the same field
 *
 * @param a - First field element
 * @param b - Second field element
 * @throws ZkAccelerateError if fields don't match
 */
export function validateSameField(a: FieldElement, b: FieldElement): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateFieldElements) {
    return;
  }

  if (a.field.modulus !== b.field.modulus) {
    throw fieldMismatchError(a.field.modulus.toString(), b.field.modulus.toString());
  }
}

/**
 * Validate an array of field elements
 *
 * @param elements - Array of field elements to validate
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if any element is invalid
 */
export function validateFieldElementArray(
  elements: FieldElement[],
  operation: string = 'Operation'
): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateFieldElements) {
    return;
  }

  if (elements.length === 0) {
    throw emptyInputError(operation);
  }

  const firstField = elements[0]!.field;

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i]!;

    // Validate element value
    validateFieldElement(elem, i);

    // Validate same field
    if (elem.field.modulus !== firstField.modulus) {
      throw fieldMismatchError(firstField.modulus.toString(), elem.field.modulus.toString(), i);
    }
  }
}

/**
 * Validate that a field element is non-zero
 *
 * @param element - The field element to validate
 * @param index - Optional index for error reporting
 * @throws ZkAccelerateError if element is zero
 */
export function validateNonZeroFieldElement(element: FieldElement, index?: number): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateFieldElements) {
    return;
  }

  if (isZeroFieldElement(element)) {
    throw divisionByZeroError(index);
  }
}

// ============================================================================
// Curve Point Validation
// ============================================================================

/**
 * Validate that a point is on the curve
 *
 * @param point - The curve point to validate
 * @param curve - The curve configuration
 * @param index - Optional index for error reporting
 * @throws ZkAccelerateError if point is not on the curve
 */
export function validateCurvePoint(
  point: CurvePoint,
  curve: CurveConfig,
  index?: number
): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateCurvePoints) {
    return;
  }

  // Identity point is always valid
  if (isIdentity(point)) {
    return;
  }

  if (!isOnCurve(point, curve)) {
    const affine = toAffine(point, curve);
    throw invalidCurvePointError(
      getFieldElementValue(affine.x).toString(),
      getFieldElementValue(affine.y).toString(),
      curve.name,
      index
    );
  }
}

/**
 * Validate an array of curve points
 *
 * @param points - Array of curve points to validate
 * @param curve - The curve configuration
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if any point is invalid
 */
export function validateCurvePointArray(
  points: CurvePoint[],
  curve: CurveConfig,
  operation: string = 'Operation'
): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateCurvePoints) {
    return;
  }

  if (points.length === 0) {
    throw emptyInputError(operation);
  }

  for (let i = 0; i < points.length; i++) {
    validateCurvePoint(points[i]!, curve, i);
  }
}

// ============================================================================
// Scalar Validation
// ============================================================================

/**
 * Validate that a scalar is within the valid range for a curve
 *
 * @param scalar - The scalar value to validate
 * @param curveOrder - The curve's group order
 * @param index - Optional index for error reporting
 * @throws ZkAccelerateError if scalar is out of range
 */
export function validateScalar(
  scalar: bigint,
  curveOrder: bigint,
  index?: number
): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateScalars) {
    return;
  }

  if (scalar < 0n) {
    throw invalidScalarError(scalar.toString(), curveOrder.toString(), index);
  }

  if (scalar >= curveOrder) {
    throw invalidScalarError(scalar.toString(), curveOrder.toString(), index);
  }
}

/**
 * Validate an array of scalars
 *
 * @param scalars - Array of scalar values to validate
 * @param curveOrder - The curve's group order
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if any scalar is invalid
 */
export function validateScalarArray(
  scalars: bigint[],
  curveOrder: bigint,
  operation: string = 'Operation'
): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateScalars) {
    return;
  }

  if (scalars.length === 0) {
    throw emptyInputError(operation);
  }

  for (let i = 0; i < scalars.length; i++) {
    validateScalar(scalars[i]!, curveOrder, i);
  }
}

// ============================================================================
// Array Validation
// ============================================================================

/**
 * Validate that two arrays have the same length
 *
 * @param arr1 - First array
 * @param arr2 - Second array
 * @param arr1Name - Name of first array for error messages
 * @param arr2Name - Name of second array for error messages
 * @throws ZkAccelerateError if lengths don't match
 */
export function validateArrayLengthsMatch<T, U>(
  arr1: T[],
  arr2: U[],
  _arr1Name: string = 'scalars',
  _arr2Name: string = 'points'
): void {
  if (!currentValidationConfig.enabled) {
    return;
  }

  if (arr1.length !== arr2.length) {
    throw arrayLengthMismatchError(arr1.length, arr2.length);
  }
}

/**
 * Validate that an array is non-empty
 *
 * @param arr - Array to validate
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if array is empty
 */
export function validateNonEmptyArray<T>(arr: T[], operation: string = 'Operation'): void {
  if (!currentValidationConfig.enabled) {
    return;
  }

  if (arr.length === 0) {
    throw emptyInputError(operation);
  }
}

// ============================================================================
// MSM-specific Validation
// ============================================================================

/**
 * Comprehensive MSM input validation
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - The curve configuration
 * @param validatePoints - Whether to validate that points are on the curve
 * @throws ZkAccelerateError if any validation fails
 */
export function validateMsmInputsComprehensive(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig,
  validatePoints: boolean = true
): void {
  if (!currentValidationConfig.enabled) {
    return;
  }

  // Validate array lengths match
  validateArrayLengthsMatch(scalars, points);

  // Validate scalars
  validateScalarArray(scalars, curve.order, 'MSM');

  // Validate points if enabled
  if (validatePoints && currentValidationConfig.validateCurvePoints) {
    validateCurvePointArray(points, curve, 'MSM');
  }
}

// ============================================================================
// NTT-specific Validation
// ============================================================================

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
 * Validate that a number is a power of two
 *
 * @param n - The number to validate
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if n is not a power of two
 */
export function validatePowerOfTwo(n: number, operation: string = 'NTT'): void {
  if (!currentValidationConfig.enabled) {
    return;
  }

  if (!isPowerOfTwo(n)) {
    const suggestion = nextPowerOfTwo(n);
    throw new ZkAccelerateError(
      `${operation} requires input length to be a power of two`,
      ErrorCode.INVALID_INPUT_SIZE,
      {
        actualSize: n,
        suggestion: `Use ${suggestion} instead (pad with zeros if needed)`,
      }
    );
  }
}

/**
 * Comprehensive NTT input validation
 *
 * @param coefficients - Array of field elements
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if any validation fails
 */
export function validateNttInputComprehensive(
  coefficients: FieldElement[],
  operation: string = 'NTT'
): void {
  if (!currentValidationConfig.enabled) {
    return;
  }

  // Validate non-empty
  validateNonEmptyArray(coefficients, operation);

  // Validate power of two
  validatePowerOfTwo(coefficients.length, operation);

  // Validate field elements
  validateFieldElementArray(coefficients, operation);
}

// ============================================================================
// Serialization Validation
// ============================================================================

/**
 * Validate byte array length for field element deserialization
 *
 * @param bytes - The byte array
 * @param expectedLength - Expected length in bytes
 * @param operation - Name of the operation for error messages
 * @throws ZkAccelerateError if length is incorrect
 */
export function validateByteArrayLength(
  bytes: Uint8Array,
  expectedLength: number,
  operation: string = 'Deserialization'
): void {
  if (!currentValidationConfig.enabled) {
    return;
  }

  if (bytes.length !== expectedLength) {
    throw new ZkAccelerateError(
      `${operation} expects ${expectedLength} bytes, got ${bytes.length}`,
      ErrorCode.INVALID_INPUT_SIZE,
      { expectedLength, actualLength: bytes.length }
    );
  }
}

/**
 * Validate that deserialized value is within field modulus
 *
 * @param value - The deserialized bigint value
 * @param field - The field configuration
 * @throws ZkAccelerateError if value exceeds modulus
 */
export function validateDeserializedFieldValue(value: bigint, field: FieldConfig): void {
  if (!currentValidationConfig.enabled || !currentValidationConfig.validateFieldElements) {
    return;
  }

  if (value >= field.modulus) {
    throw invalidFieldElementError(value.toString(), field.modulus.toString());
  }
}
