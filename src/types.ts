/**
 * Core type definitions for node-zk-accelerate
 */

/**
 * Field configuration for finite field arithmetic
 */
export interface FieldConfig {
  readonly modulus: bigint;
  readonly r: bigint; // Montgomery R = 2^256 mod p
  readonly rInv: bigint; // R^-1 mod p
  readonly r2: bigint; // R^2 mod p for conversion
  readonly limbCount: number;
}

/**
 * Field element in Montgomery representation
 */
export interface FieldElement {
  readonly limbs: BigUint64Array;
  readonly field: FieldConfig;
}

/**
 * Affine point representation
 */
export interface AffinePoint {
  readonly x: FieldElement;
  readonly y: FieldElement;
  readonly isInfinity: boolean;
}

/**
 * Projective point representation (X, Y, Z) represents affine (X/Z, Y/Z)
 */
export interface ProjectivePoint {
  readonly x: FieldElement;
  readonly y: FieldElement;
  readonly z: FieldElement;
}

/**
 * Jacobian point representation (X, Y, Z) represents affine (X/Z², Y/Z³)
 */
export interface JacobianPoint {
  readonly x: FieldElement;
  readonly y: FieldElement;
  readonly z: FieldElement;
}

/**
 * Union type for curve points
 */
export type CurvePoint = AffinePoint | ProjectivePoint | JacobianPoint;

/**
 * Supported curve names
 */
export type CurveName = 'BN254' | 'BLS12_381';

/**
 * Curve configuration
 */
export interface CurveConfig {
  readonly name: CurveName;
  readonly field: FieldConfig;
  readonly a: FieldElement;
  readonly b: FieldElement;
  readonly generator: AffinePoint;
  readonly order: bigint;
}

/**
 * Scalar value for curve operations
 */
export interface Scalar {
  readonly value: bigint;
  readonly curve: CurveConfig;
}

/**
 * MSM computation options
 */
export interface MSMOptions {
  curve?: CurveName;
  accelerationHint?: 'cpu' | 'gpu' | 'hybrid' | 'auto';
  windowSize?: number;
  gpuThreshold?: number;
  validateInputs?: boolean;
}

/**
 * NTT computation options
 */
export interface NTTOptions {
  radix?: 2 | 4;
  inPlace?: boolean;
  accelerationHint?: 'cpu' | 'gpu' | 'auto';
}

/**
 * Byte order for serialization
 */
export type Endianness = 'be' | 'le';
