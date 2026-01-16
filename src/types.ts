/**
 * Core type definitions for @digitaldefiance/node-zk-accelerate
 *
 * This module defines the fundamental types used throughout the library
 * for finite field arithmetic, elliptic curve operations, and ZK primitives.
 *
 * @module types
 */

/**
 * Field configuration for finite field arithmetic
 *
 * Defines the parameters needed for modular arithmetic operations
 * including the field modulus and Montgomery constants for efficient
 * multiplication.
 *
 * @example
 * ```typescript
 * // BN254 base field configuration
 * const field: FieldConfig = {
 *   modulus: 21888242871839275222246405745257275088696311157297823662689037894645226208583n,
 *   r: 6350874878119819312338956282401532410528162663560392320966563075034087161851n,
 *   rInv: 20988524275117001072002809824448087578619730785600314334253784976379291040311n,
 *   r2: 3096616502983703923843567936837374451735540968419076528771170197431451843209n,
 *   limbCount: 4
 * };
 * ```
 */
export interface FieldConfig {
  /** The prime modulus p of the field F_p */
  readonly modulus: bigint;
  /** Montgomery R = 2^(64*limbCount) mod p */
  readonly r: bigint;
  /** Montgomery R^-1 mod p (for converting from Montgomery form) */
  readonly rInv: bigint;
  /** Montgomery R^2 mod p (for converting to Montgomery form) */
  readonly r2: bigint;
  /** Number of 64-bit limbs needed to represent field elements */
  readonly limbCount: number;
}

/**
 * Field element in Montgomery representation
 *
 * Field elements are stored as arrays of 64-bit limbs in little-endian order.
 * The actual value is stored in Montgomery form for efficient multiplication.
 *
 * @example
 * ```typescript
 * import { createFieldElement, getFieldElementValue } from '@digitaldefiance/node-zk-accelerate';
 *
 * const elem = createFieldElement(123n);
 * const value = getFieldElementValue(elem); // 123n
 * ```
 */
export interface FieldElement {
  /** The limbs storing the Montgomery representation (little-endian) */
  readonly limbs: BigUint64Array;
  /** The field configuration this element belongs to */
  readonly field: FieldConfig;
}

/**
 * Affine point representation on an elliptic curve
 *
 * Affine coordinates (x, y) directly represent the point on the curve.
 * The point at infinity (identity) is represented with isInfinity = true.
 *
 * @example
 * ```typescript
 * import { createAffinePoint, BN254_CURVE } from '@digitaldefiance/node-zk-accelerate';
 *
 * // Create a point from coordinates
 * const point = createAffinePoint(1n, 2n, { curve: BN254_CURVE });
 *
 * // Check if it's the identity
 * if (point.isInfinity) {
 *   console.log('Point is at infinity');
 * }
 * ```
 */
export interface AffinePoint {
  /** X coordinate as a field element */
  readonly x: FieldElement;
  /** Y coordinate as a field element */
  readonly y: FieldElement;
  /** True if this is the point at infinity (identity element) */
  readonly isInfinity: boolean;
}

/**
 * Projective point representation (X, Y, Z) represents affine (X/Z, Y/Z)
 *
 * Projective coordinates avoid expensive field inversions during point
 * operations. The point at infinity has Z = 0.
 *
 * @example
 * ```typescript
 * import { toProjective, BN254_CURVE } from '@digitaldefiance/node-zk-accelerate';
 *
 * const projective = toProjective(affinePoint, BN254_CURVE);
 * ```
 */
export interface ProjectivePoint {
  /** X coordinate (projective) */
  readonly x: FieldElement;
  /** Y coordinate (projective) */
  readonly y: FieldElement;
  /** Z coordinate (projective) - point at infinity when Z = 0 */
  readonly z: FieldElement;
}

/**
 * Jacobian point representation (X, Y, Z) represents affine (X/Z², Y/Z³)
 *
 * Jacobian coordinates are the most efficient for point addition and
 * doubling operations. The point at infinity has Z = 0.
 *
 * @example
 * ```typescript
 * import { toJacobian, pointAdd, BN254_CURVE } from '@digitaldefiance/node-zk-accelerate';
 *
 * const j1 = toJacobian(point1, BN254_CURVE);
 * const j2 = toJacobian(point2, BN254_CURVE);
 * const sum = pointAdd(j1, j2, BN254_CURVE);
 * ```
 */
export interface JacobianPoint {
  /** X coordinate (Jacobian) */
  readonly x: FieldElement;
  /** Y coordinate (Jacobian) */
  readonly y: FieldElement;
  /** Z coordinate (Jacobian) - point at infinity when Z = 0 */
  readonly z: FieldElement;
}

/**
 * Union type for curve points in any coordinate representation
 *
 * Functions that accept CurvePoint can work with affine, projective,
 * or Jacobian coordinates. Use type guards (isAffinePoint, etc.) to
 * determine the specific type.
 */
export type CurvePoint = AffinePoint | ProjectivePoint | JacobianPoint;

/**
 * Supported elliptic curve names
 *
 * - BN254: Also known as alt_bn128, used in Ethereum and many ZK-SNARKs
 * - BLS12_381: 128-bit security, used in Zcash and Ethereum 2.0
 */
export type CurveName = 'BN254' | 'BLS12_381';

/**
 * Elliptic curve configuration
 *
 * Defines all parameters needed for curve operations including the
 * base field, curve equation coefficients, generator point, and order.
 *
 * @example
 * ```typescript
 * import { BN254_CURVE, scalarMul } from '@digitaldefiance/node-zk-accelerate';
 *
 * // Use the generator point
 * const G = BN254_CURVE.generator;
 *
 * // Scalar multiplication
 * const P = scalarMul(123n, G, BN254_CURVE);
 * ```
 */
export interface CurveConfig {
  /** Curve identifier */
  readonly name: CurveName;
  /** Base field configuration */
  readonly field: FieldConfig;
  /** Curve parameter 'a' in y² = x³ + ax + b */
  readonly a: FieldElement;
  /** Curve parameter 'b' in y² = x³ + ax + b */
  readonly b: FieldElement;
  /** Generator point of the prime-order subgroup */
  readonly generator: AffinePoint;
  /** Order of the prime-order subgroup */
  readonly order: bigint;
}

/**
 * Scalar value for elliptic curve operations
 *
 * Scalars are integers used for scalar multiplication on curves.
 * They should be in the range [0, order-1] for the associated curve.
 *
 * @example
 * ```typescript
 * import { createScalar, msm, BN254_CURVE } from '@digitaldefiance/node-zk-accelerate';
 *
 * const scalar = createScalar(123n, { curve: BN254_CURVE });
 * const result = msm([scalar], [point], BN254_CURVE);
 * ```
 */
export interface Scalar {
  /** The scalar value as a bigint */
  readonly value: bigint;
  /** The curve this scalar is associated with */
  readonly curve: CurveConfig;
}

/**
 * Options for Multi-Scalar Multiplication (MSM) computation
 *
 * @example
 * ```typescript
 * import { msm, BN254_CURVE } from '@digitaldefiance/node-zk-accelerate';
 *
 * const result = msm(scalars, points, BN254_CURVE, {
 *   accelerationHint: 'gpu',
 *   validateInputs: true,
 *   windowSize: 16,
 * });
 * ```
 */
export interface MSMOptions {
  /** Curve to use (default: derived from inputs or global config) */
  curve?: CurveName;
  /** Hardware acceleration preference */
  accelerationHint?: 'cpu' | 'gpu' | 'hybrid' | 'auto';
  /** Window size for Pippenger's algorithm (auto-selected if not specified) */
  windowSize?: number;
  /** Minimum points to trigger GPU acceleration (default: 4096) */
  gpuThreshold?: number;
  /** Whether to validate inputs before computation (default: true) */
  validateInputs?: boolean;
}

/**
 * Options for Number Theoretic Transform (NTT) computation
 *
 * @example
 * ```typescript
 * import { forwardNtt } from '@digitaldefiance/node-zk-accelerate';
 *
 * const transformed = forwardNtt(coefficients, {
 *   radix: 4,
 *   inPlace: false,
 *   accelerationHint: 'auto',
 * });
 * ```
 */
export interface NTTOptions {
  /** NTT radix (2 or 4, default: 2) */
  radix?: 2 | 4;
  /** Whether to perform in-place transformation (default: false) */
  inPlace?: boolean;
  /** Hardware acceleration preference */
  accelerationHint?: 'cpu' | 'gpu' | 'auto';
}

/**
 * Byte order for serialization operations
 *
 * - 'be': Big-endian (most significant byte first)
 * - 'le': Little-endian (least significant byte first)
 */
export type Endianness = 'be' | 'le';
