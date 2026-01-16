/**
 * Error handling for node-zk-accelerate
 *
 * This module provides comprehensive error types and codes for all ZK acceleration
 * operations. All errors include descriptive messages and optional details for
 * debugging.
 *
 * Requirements: 14.4, 15.1
 */

/**
 * Error codes for ZK acceleration operations
 *
 * These codes allow programmatic handling of specific error conditions.
 */
export enum ErrorCode {
  // Input validation errors
  /** Point is not on the specified elliptic curve */
  INVALID_CURVE_POINT = 'INVALID_CURVE_POINT',
  /** Field element value exceeds the field modulus */
  INVALID_FIELD_ELEMENT = 'INVALID_FIELD_ELEMENT',
  /** Scalar value is out of valid range for the curve */
  INVALID_SCALAR = 'INVALID_SCALAR',
  /** Input arrays have different lengths */
  ARRAY_LENGTH_MISMATCH = 'ARRAY_LENGTH_MISMATCH',
  /** Input size is invalid (e.g., not a power of two for NTT) */
  INVALID_INPUT_SIZE = 'INVALID_INPUT_SIZE',
  /** Input is empty when non-empty input is required */
  EMPTY_INPUT = 'EMPTY_INPUT',
  /** Field elements are from different fields */
  FIELD_MISMATCH = 'FIELD_MISMATCH',

  // Arithmetic errors
  /** Attempted division by zero or inverse of zero */
  DIVISION_BY_ZERO = 'DIVISION_BY_ZERO',
  /** Operation resulted in point at infinity unexpectedly */
  POINT_AT_INFINITY = 'POINT_AT_INFINITY',
  /** No modular inverse exists for the given value */
  NO_INVERSE = 'NO_INVERSE',

  // Hardware errors
  /** Metal GPU is not available on this system */
  METAL_UNAVAILABLE = 'METAL_UNAVAILABLE',
  /** Metal shader compilation failed */
  SHADER_COMPILATION_FAILED = 'SHADER_COMPILATION_FAILED',
  /** GPU buffer allocation failed */
  GPU_BUFFER_ALLOCATION_FAILED = 'GPU_BUFFER_ALLOCATION_FAILED',
  /** Native binding failed to load or execute */
  NATIVE_BINDING_FAILED = 'NATIVE_BINDING_FAILED',
  /** Hardware acceleration is not available */
  ACCELERATION_UNAVAILABLE = 'ACCELERATION_UNAVAILABLE',

  // File format errors
  /** Invalid or corrupted zkey file format */
  INVALID_ZKEY_FORMAT = 'INVALID_ZKEY_FORMAT',
  /** Invalid or corrupted witness file format */
  INVALID_WTNS_FORMAT = 'INVALID_WTNS_FORMAT',
  /** Invalid or corrupted R1CS file format */
  INVALID_R1CS_FORMAT = 'INVALID_R1CS_FORMAT',
  /** Curve is not supported by this library */
  UNSUPPORTED_CURVE = 'UNSUPPORTED_CURVE',
  /** Serialization or deserialization failed */
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',

  // Configuration errors
  /** Invalid configuration option provided */
  INVALID_CONFIG = 'INVALID_CONFIG',
  /** NTT size is not supported for the given field */
  UNSUPPORTED_NTT_SIZE = 'UNSUPPORTED_NTT_SIZE',

  // Internal errors
  /** An unexpected internal error occurred */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** All fallback options failed */
  FALLBACK_FAILED = 'FALLBACK_FAILED',
}

/**
 * Base error class for ZK acceleration errors
 *
 * All errors thrown by this library are instances of ZkAccelerateError,
 * allowing for easy error handling and type checking.
 *
 * @example
 * ```typescript
 * try {
 *   const result = msm(scalars, points, curve);
 * } catch (error) {
 *   if (error instanceof ZkAccelerateError) {
 *     switch (error.code) {
 *       case ErrorCode.INVALID_CURVE_POINT:
 *         console.error('Invalid point:', error.details);
 *         break;
 *       case ErrorCode.ARRAY_LENGTH_MISMATCH:
 *         console.error('Array lengths:', error.details);
 *         break;
 *     }
 *   }
 * }
 * ```
 */
export class ZkAccelerateError extends Error {
  /**
   * Create a new ZkAccelerateError
   *
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param details - Optional details object with relevant context
   */
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ZkAccelerateError';
    Object.setPrototypeOf(this, ZkAccelerateError.prototype);
  }

  /**
   * Create a string representation of the error including details
   */
  override toString(): string {
    let str = `${this.name} [${this.code}]: ${this.message}`;
    if (this.details) {
      str += ` (${JSON.stringify(this.details)})`;
    }
    return str;
  }

  /**
   * Convert error to a plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Type guard to check if an error is a ZkAccelerateError
 */
export function isZkAccelerateError(error: unknown): error is ZkAccelerateError {
  return error instanceof ZkAccelerateError;
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create an error for invalid curve points
 *
 * @param x - X coordinate as string
 * @param y - Y coordinate as string
 * @param curve - Curve name
 * @param index - Optional index in array
 */
export function invalidCurvePointError(
  x: string,
  y: string,
  curve: string,
  index?: number
): ZkAccelerateError {
  const details: Record<string, unknown> = { x, y, curve };
  if (index !== undefined) {
    details['index'] = index;
  }
  return new ZkAccelerateError('Point is not on the curve', ErrorCode.INVALID_CURVE_POINT, details);
}

/**
 * Create an error for invalid field elements
 *
 * @param value - The invalid value as string
 * @param modulus - The field modulus as string
 * @param index - Optional index in array
 */
export function invalidFieldElementError(
  value: string,
  modulus: string,
  index?: number
): ZkAccelerateError {
  const details: Record<string, unknown> = { value, modulus };
  if (index !== undefined) {
    details['index'] = index;
  }
  return new ZkAccelerateError(
    'Field element exceeds modulus',
    ErrorCode.INVALID_FIELD_ELEMENT,
    details
  );
}

/**
 * Create an error for invalid scalar values
 *
 * @param value - The invalid scalar value as string
 * @param curveOrder - The curve order as string
 * @param index - Optional index in array
 */
export function invalidScalarError(
  value: string,
  curveOrder: string,
  index?: number
): ZkAccelerateError {
  const details: Record<string, unknown> = { value, curveOrder };
  if (index !== undefined) {
    details['index'] = index;
  }
  return new ZkAccelerateError('Scalar value is out of range', ErrorCode.INVALID_SCALAR, details);
}

/**
 * Create an error for array length mismatch
 *
 * @param scalarsLength - Length of scalars array
 * @param pointsLength - Length of points array
 */
export function arrayLengthMismatchError(
  scalarsLength: number,
  pointsLength: number
): ZkAccelerateError {
  return new ZkAccelerateError(
    'Scalar and point arrays must have the same length',
    ErrorCode.ARRAY_LENGTH_MISMATCH,
    { scalarsLength, pointsLength }
  );
}

/**
 * Create an error for invalid input size (non-power-of-two)
 *
 * @param operation - Name of the operation
 * @param actualSize - The actual input size
 */
export function invalidInputSizeError(operation: string, actualSize: number): ZkAccelerateError {
  const nextPow2 = actualSize <= 0 ? 1 : Math.pow(2, Math.ceil(Math.log2(actualSize)));
  return new ZkAccelerateError(
    `${operation} requires input length to be a power of two`,
    ErrorCode.INVALID_INPUT_SIZE,
    { actualSize, suggestion: `Use ${nextPow2} instead` }
  );
}

/**
 * Create an error for empty input
 *
 * @param operation - Name of the operation
 */
export function emptyInputError(operation: string): ZkAccelerateError {
  return new ZkAccelerateError(
    `${operation} requires non-empty input`,
    ErrorCode.EMPTY_INPUT,
    { operation }
  );
}

/**
 * Create an error for field mismatch
 *
 * @param expectedModulus - Expected field modulus as string
 * @param actualModulus - Actual field modulus as string
 * @param index - Optional index where mismatch occurred
 */
export function fieldMismatchError(
  expectedModulus: string,
  actualModulus: string,
  index?: number
): ZkAccelerateError {
  const details: Record<string, unknown> = { expectedModulus, actualModulus };
  if (index !== undefined) {
    details['index'] = index;
  }
  return new ZkAccelerateError(
    'Field elements must be from the same field',
    ErrorCode.FIELD_MISMATCH,
    details
  );
}

/**
 * Create an error for division by zero
 *
 * @param index - Optional index in array
 */
export function divisionByZeroError(index?: number): ZkAccelerateError {
  const details: Record<string, unknown> = {};
  if (index !== undefined) {
    details['index'] = index;
  }
  return new ZkAccelerateError(
    'Cannot compute inverse of zero element',
    ErrorCode.DIVISION_BY_ZERO,
    Object.keys(details).length > 0 ? details : undefined
  );
}

/**
 * Create an error for Metal unavailability
 */
export function metalUnavailableError(): ZkAccelerateError {
  return new ZkAccelerateError(
    'Metal GPU is not available on this system',
    ErrorCode.METAL_UNAVAILABLE
  );
}

/**
 * Create an error for native binding failures
 *
 * @param reason - Reason for the failure
 */
export function nativeBindingError(reason: string): ZkAccelerateError {
  return new ZkAccelerateError(
    `Native binding failed: ${reason}`,
    ErrorCode.NATIVE_BINDING_FAILED,
    { reason }
  );
}

/**
 * Create an error for unsupported curve
 *
 * @param curveName - Name of the unsupported curve
 */
export function unsupportedCurveError(curveName: string): ZkAccelerateError {
  return new ZkAccelerateError(
    `Curve '${curveName}' is not supported`,
    ErrorCode.UNSUPPORTED_CURVE,
    { curveName, supportedCurves: ['BN254', 'BLS12_381'] }
  );
}

/**
 * Create an error for serialization failures
 *
 * @param operation - 'serialize' or 'deserialize'
 * @param reason - Reason for the failure
 */
export function serializationError(
  operation: 'serialize' | 'deserialize',
  reason: string
): ZkAccelerateError {
  return new ZkAccelerateError(
    `Failed to ${operation}: ${reason}`,
    ErrorCode.SERIALIZATION_ERROR,
    { operation, reason }
  );
}

/**
 * Create an error for unsupported NTT size
 *
 * @param size - The unsupported NTT size
 * @param modulus - The field modulus as string
 */
export function unsupportedNttSizeError(size: number, modulus: string): ZkAccelerateError {
  return new ZkAccelerateError(
    `NTT size ${size} is not supported for this field (${size} must divide p-1)`,
    ErrorCode.UNSUPPORTED_NTT_SIZE,
    { size, modulus }
  );
}

/**
 * Create an error for invalid configuration
 *
 * @param option - Name of the invalid option
 * @param value - The invalid value
 * @param validValues - Optional list of valid values
 */
export function invalidConfigError(
  option: string,
  value: unknown,
  validValues?: unknown[]
): ZkAccelerateError {
  const details: Record<string, unknown> = { option, value };
  if (validValues) {
    details['validValues'] = validValues;
  }
  return new ZkAccelerateError(
    `Invalid configuration option '${option}': ${value}`,
    ErrorCode.INVALID_CONFIG,
    details
  );
}

/**
 * Create an internal error
 *
 * @param message - Error message
 * @param details - Optional details
 */
export function internalError(message: string, details?: Record<string, unknown>): ZkAccelerateError {
  return new ZkAccelerateError(message, ErrorCode.INTERNAL_ERROR, details);
}
