/**
 * Error handling for node-zk-accelerate
 */

/**
 * Error codes for ZK acceleration operations
 */
export enum ErrorCode {
  // Input validation errors
  INVALID_CURVE_POINT = 'INVALID_CURVE_POINT',
  INVALID_FIELD_ELEMENT = 'INVALID_FIELD_ELEMENT',
  INVALID_SCALAR = 'INVALID_SCALAR',
  ARRAY_LENGTH_MISMATCH = 'ARRAY_LENGTH_MISMATCH',
  INVALID_INPUT_SIZE = 'INVALID_INPUT_SIZE',

  // Arithmetic errors
  DIVISION_BY_ZERO = 'DIVISION_BY_ZERO',
  POINT_AT_INFINITY = 'POINT_AT_INFINITY',

  // Hardware errors
  METAL_UNAVAILABLE = 'METAL_UNAVAILABLE',
  SHADER_COMPILATION_FAILED = 'SHADER_COMPILATION_FAILED',
  GPU_BUFFER_ALLOCATION_FAILED = 'GPU_BUFFER_ALLOCATION_FAILED',
  NATIVE_BINDING_FAILED = 'NATIVE_BINDING_FAILED',

  // File format errors
  INVALID_ZKEY_FORMAT = 'INVALID_ZKEY_FORMAT',
  INVALID_WTNS_FORMAT = 'INVALID_WTNS_FORMAT',
  INVALID_R1CS_FORMAT = 'INVALID_R1CS_FORMAT',
  UNSUPPORTED_CURVE = 'UNSUPPORTED_CURVE',

  // Internal errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  FALLBACK_FAILED = 'FALLBACK_FAILED',
}

/**
 * Base error class for ZK acceleration errors
 */
export class ZkAccelerateError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ZkAccelerateError';
    Object.setPrototypeOf(this, ZkAccelerateError.prototype);
  }
}

/**
 * Create an error for invalid curve points
 */
export function invalidCurvePointError(
  x: string,
  y: string,
  curve: string
): ZkAccelerateError {
  return new ZkAccelerateError('Point is not on the curve', ErrorCode.INVALID_CURVE_POINT, {
    x,
    y,
    curve,
  });
}

/**
 * Create an error for invalid field elements
 */
export function invalidFieldElementError(value: string, modulus: string): ZkAccelerateError {
  return new ZkAccelerateError('Field element exceeds modulus', ErrorCode.INVALID_FIELD_ELEMENT, {
    value,
    modulus,
  });
}

/**
 * Create an error for array length mismatch
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
 */
export function invalidInputSizeError(operation: string, actualSize: number): ZkAccelerateError {
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(actualSize)));
  return new ZkAccelerateError(
    `${operation} requires input length to be a power of two`,
    ErrorCode.INVALID_INPUT_SIZE,
    { actualSize, suggestion: `Use ${nextPow2} instead` }
  );
}

/**
 * Create an error for division by zero
 */
export function divisionByZeroError(): ZkAccelerateError {
  return new ZkAccelerateError(
    'Cannot compute inverse of zero element',
    ErrorCode.DIVISION_BY_ZERO
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
 */
export function nativeBindingError(reason: string): ZkAccelerateError {
  return new ZkAccelerateError(
    `Native binding failed: ${reason}`,
    ErrorCode.NATIVE_BINDING_FAILED,
    { reason }
  );
}
