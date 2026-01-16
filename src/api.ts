/**
 * Public TypeScript API for @digitaldefiance/node-zk-accelerate
 *
 * This module provides a clean, type-safe public API with factory functions
 * for creating field elements and curve points, configuration options,
 * and async wrappers for all major operations.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.5, 14.6
 *
 * @module api
 */

import type {
  FieldConfig,
  FieldElement,
  AffinePoint,
  JacobianPoint,
  ProjectivePoint,
  CurvePoint,
  CurveConfig,
  Scalar,
  MSMOptions,
  NTTOptions,
  CurveName,
  Endianness,
} from './types.js';

// Re-export core types
export type {
  FieldConfig,
  FieldElement,
  AffinePoint,
  JacobianPoint,
  ProjectivePoint,
  CurvePoint,
  CurveConfig,
  Scalar,
  MSMOptions,
  NTTOptions,
  CurveName,
  Endianness,
};

// Import implementations
import {
  BN254_FIELD,
  BLS12_381_FIELD,
  BN254_SCALAR_FIELD,
  BLS12_381_SCALAR_FIELD,
  getFieldConfig,
} from './field/config.js';

import {
  createFieldElement as createFieldElementInternal,
  createFieldElementFromBytes,
  createFieldElementFromHex,
  createZeroFieldElement,
  createOneFieldElement,
  getFieldElementValue,
  isZeroFieldElement,
  isOneFieldElement,
  fieldElementsEqual,
  cloneFieldElement,
} from './field/element.js';

import {
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldNeg,
  fieldInv,
  fieldDiv,
  fieldSquare,
  fieldPow,
  batchInv,
  batchMul,
  batchAdd,
} from './field/operations.js';

import { fieldElementToBytes, fieldElementFromBytes } from './field/serialization.js';

import { BN254_CURVE, BLS12_381_CURVE, getCurveConfig, getIdentityPoint } from './curve/config.js';

import {
  createAffinePoint as createAffinePointInternal,
  createJacobianPoint as createJacobianPointInternal,
  createProjectivePoint as createProjectivePointInternal,
  createAffineIdentity,
  toAffine,
  toJacobian,
  toProjective,
  isIdentity,
  isAffinePoint,
  isJacobianPoint,
  isProjectivePoint,
  curvePointsEqual,
  affinePointsEqual,
  jacobianPointsEqual,
} from './curve/point.js';

import {
  pointAdd,
  pointDouble,
  pointNegate,
  scalarMul,
  scalarMulWindowed,
  isOnCurve,
  validateCurvePoint,
} from './curve/operations.js';

import { compressPoint, decompressPoint } from './curve/compression.js';

import { msm, msmAsync, batchMsm, msmNaive, msmWithMetadata, msmAsyncWithMetadata } from './msm/msm.js';

import {
  forwardNtt,
  inverseNtt,
  forwardNttWithConfig,
  inverseNttWithConfig,
  createNTTEngine,
  batchForwardNtt,
  batchInverseNtt,
} from './ntt/index.js';

import { detectHardwareCapabilities, type HardwareCapabilities } from './hardware.js';

// ============================================================================
// Library Configuration
// ============================================================================

/**
 * Global library configuration options
 *
 * @example
 * ```typescript
 * import { configure } from '@digitaldefiance/node-zk-accelerate';
 *
 * configure({
 *   defaultCurve: 'BN254',
 *   validateInputs: true,
 *   accelerationHint: 'auto',
 * });
 * ```
 */
export interface ZkAccelerateConfig {
  /** Default curve to use when not specified (default: 'BN254') */
  defaultCurve?: CurveName;
  /** Whether to validate inputs by default (default: true) */
  validateInputs?: boolean;
  /** Default acceleration hint (default: 'auto') */
  accelerationHint?: 'cpu' | 'gpu' | 'hybrid' | 'auto';
  /** GPU threshold for automatic GPU dispatch (default: 1024) */
  gpuThreshold?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

// Global configuration state
let globalConfig: Required<ZkAccelerateConfig> = {
  defaultCurve: 'BN254',
  validateInputs: true,
  accelerationHint: 'auto',
  gpuThreshold: 1024,
  debug: false,
};

/**
 * Configure global library settings
 *
 * @param config - Configuration options to set
 *
 * @example
 * ```typescript
 * configure({
 *   defaultCurve: 'BLS12_381',
 *   validateInputs: false, // Disable for performance
 *   accelerationHint: 'gpu',
 * });
 * ```
 */
export function configure(config: ZkAccelerateConfig): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get the current library configuration
 *
 * @returns Current configuration settings
 */
export function getConfig(): Readonly<Required<ZkAccelerateConfig>> {
  return { ...globalConfig };
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  globalConfig = {
    defaultCurve: 'BN254',
    validateInputs: true,
    accelerationHint: 'auto',
    gpuThreshold: 1024,
    debug: false,
  };
}

// ============================================================================
// Field Element Factory Functions
// ============================================================================

/**
 * Input types accepted for creating field elements
 */
export type FieldElementInput = bigint | number | string | Uint8Array;

/**
 * Options for creating field elements
 */
export interface CreateFieldElementOptions {
  /** Field configuration (default: BN254 base field) */
  field?: FieldConfig;
  /** Curve name to derive field from */
  curve?: CurveName;
  /** Field type when using curve name */
  fieldType?: 'base' | 'scalar';
  /** Byte order for Uint8Array input (default: 'be') */
  endian?: Endianness;
}

/**
 * Create a field element from various input types
 *
 * Accepts BigInt, number, hex string, or byte array inputs.
 * The value is automatically reduced modulo the field modulus.
 *
 * @param value - The value to convert to a field element
 * @param options - Options for field configuration and parsing
 * @returns A new field element
 *
 * @example
 * ```typescript
 * // From BigInt
 * const a = createFieldElement(123n);
 *
 * // From number
 * const b = createFieldElement(456);
 *
 * // From hex string
 * const c = createFieldElement('0x1a2b3c');
 *
 * // From bytes (big-endian)
 * const d = createFieldElement(new Uint8Array([1, 2, 3, 4]), { endian: 'be' });
 *
 * // With specific field
 * const e = createFieldElement(789n, { curve: 'BLS12_381', fieldType: 'scalar' });
 * ```
 */
export function createFieldElement(
  value: FieldElementInput,
  options: CreateFieldElementOptions = {}
): FieldElement {
  // Determine field configuration
  let field: FieldConfig;
  if (options.field) {
    field = options.field;
  } else if (options.curve) {
    field = getFieldConfig(options.curve, options.fieldType ?? 'base');
  } else {
    field = getFieldConfig(globalConfig.defaultCurve, 'base');
  }

  // Handle different input types
  if (value instanceof Uint8Array) {
    return createFieldElementFromBytes(value, field, options.endian ?? 'be');
  }

  if (typeof value === 'string') {
    return createFieldElementFromHex(value, field);
  }

  if (typeof value === 'number') {
    return createFieldElementInternal(BigInt(value), field);
  }

  return createFieldElementInternal(value, field);
}

/**
 * Create the zero element for a field
 *
 * @param options - Options for field configuration
 * @returns The zero field element
 *
 * @example
 * ```typescript
 * const zero = createZero({ curve: 'BN254' });
 * ```
 */
export function createZero(options: CreateFieldElementOptions = {}): FieldElement {
  const field = options.field ?? getFieldConfig(options.curve ?? globalConfig.defaultCurve, options.fieldType ?? 'base');
  return createZeroFieldElement(field);
}

/**
 * Create the one element (multiplicative identity) for a field
 *
 * @param options - Options for field configuration
 * @returns The one field element
 *
 * @example
 * ```typescript
 * const one = createOne({ curve: 'BN254' });
 * ```
 */
export function createOne(options: CreateFieldElementOptions = {}): FieldElement {
  const field = options.field ?? getFieldConfig(options.curve ?? globalConfig.defaultCurve, options.fieldType ?? 'base');
  return createOneFieldElement(field);
}

// ============================================================================
// Curve Point Factory Functions
// ============================================================================

/**
 * Options for creating curve points
 */
export interface CreatePointOptions {
  /** Curve configuration */
  curve?: CurveConfig;
  /** Curve name to use */
  curveName?: CurveName;
}

/**
 * Create an affine curve point from coordinates
 *
 * @param x - X coordinate (BigInt or FieldElement)
 * @param y - Y coordinate (BigInt or FieldElement)
 * @param options - Options for curve configuration
 * @returns A new affine point
 *
 * @example
 * ```typescript
 * // From BigInt coordinates
 * const p = createAffinePoint(1n, 2n);
 *
 * // With specific curve
 * const q = createAffinePoint(x, y, { curveName: 'BLS12_381' });
 * ```
 */
export function createAffinePoint(
  x: bigint | FieldElement,
  y: bigint | FieldElement,
  options: CreatePointOptions = {}
): AffinePoint {
  const curve = options.curve ?? getCurveConfig(options.curveName ?? globalConfig.defaultCurve);
  return createAffinePointInternal(x, y, curve);
}

/**
 * Create a Jacobian curve point from coordinates
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @param options - Options for curve configuration
 * @returns A new Jacobian point
 */
export function createJacobianPoint(
  x: bigint | FieldElement,
  y: bigint | FieldElement,
  z: bigint | FieldElement,
  options: CreatePointOptions = {}
): JacobianPoint {
  const curve = options.curve ?? getCurveConfig(options.curveName ?? globalConfig.defaultCurve);
  return createJacobianPointInternal(x, y, z, curve);
}

/**
 * Create a projective curve point from coordinates
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @param options - Options for curve configuration
 * @returns A new projective point
 */
export function createProjectivePoint(
  x: bigint | FieldElement,
  y: bigint | FieldElement,
  z: bigint | FieldElement,
  options: CreatePointOptions = {}
): ProjectivePoint {
  const curve = options.curve ?? getCurveConfig(options.curveName ?? globalConfig.defaultCurve);
  return createProjectivePointInternal(x, y, z, curve);
}

/**
 * Create the identity point (point at infinity)
 *
 * @param options - Options for curve configuration
 * @returns The identity point
 *
 * @example
 * ```typescript
 * const identity = createIdentity({ curveName: 'BN254' });
 * ```
 */
export function createIdentity(options: CreatePointOptions = {}): AffinePoint {
  const curve = options.curve ?? getCurveConfig(options.curveName ?? globalConfig.defaultCurve);
  return createAffineIdentity(curve);
}

/**
 * Get the generator point for a curve
 *
 * @param options - Options for curve configuration
 * @returns The curve generator point
 *
 * @example
 * ```typescript
 * const G = getGenerator({ curveName: 'BN254' });
 * ```
 */
export function getGenerator(options: CreatePointOptions = {}): AffinePoint {
  const curve = options.curve ?? getCurveConfig(options.curveName ?? globalConfig.defaultCurve);
  return curve.generator;
}

/**
 * Create a scalar value for curve operations
 *
 * @param value - The scalar value
 * @param options - Options for curve configuration
 * @returns A scalar object
 *
 * @example
 * ```typescript
 * const s = createScalar(123n);
 * const result = msm([s], [point], 'BN254');
 * ```
 */
export function createScalar(
  value: bigint | number,
  options: CreatePointOptions = {}
): Scalar {
  const curve = options.curve ?? getCurveConfig(options.curveName ?? globalConfig.defaultCurve);
  const scalarValue = typeof value === 'number' ? BigInt(value) : value;
  return { value: scalarValue, curve };
}

// ============================================================================
// Re-exports with JSDoc
// ============================================================================

// Field configurations
export {
  BN254_FIELD,
  BLS12_381_FIELD,
  BN254_SCALAR_FIELD,
  BLS12_381_SCALAR_FIELD,
  getFieldConfig,
};

// Field element utilities
export {
  getFieldElementValue,
  isZeroFieldElement,
  isOneFieldElement,
  fieldElementsEqual,
  cloneFieldElement,
};

// Field arithmetic
export {
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldNeg,
  fieldInv,
  fieldDiv,
  fieldSquare,
  fieldPow,
  batchInv,
  batchMul,
  batchAdd,
};

// Field serialization
export { fieldElementToBytes, fieldElementFromBytes };

// Curve configurations
export { BN254_CURVE, BLS12_381_CURVE, getCurveConfig, getIdentityPoint };

// Point utilities
export {
  toAffine,
  toJacobian,
  toProjective,
  isIdentity,
  isAffinePoint,
  isJacobianPoint,
  isProjectivePoint,
  curvePointsEqual,
  affinePointsEqual,
  jacobianPointsEqual,
};

// Curve operations
export {
  pointAdd,
  pointDouble,
  pointNegate,
  scalarMul,
  scalarMulWindowed,
  isOnCurve,
  validateCurvePoint,
};

// Point compression
export { compressPoint, decompressPoint };

// MSM operations
export { msm, msmAsync, batchMsm, msmNaive, msmWithMetadata, msmAsyncWithMetadata };

// NTT operations
export {
  forwardNtt,
  inverseNtt,
  forwardNttWithConfig,
  inverseNttWithConfig,
  createNTTEngine,
  batchForwardNtt,
  batchInverseNtt,
};

// Hardware detection
export { detectHardwareCapabilities };
export type { HardwareCapabilities };
