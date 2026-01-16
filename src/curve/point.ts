/**
 * Point Representations and Conversions
 *
 * This module provides different point representations (Affine, Projective, Jacobian)
 * and conversion functions between them. Jacobian coordinates are most efficient
 * for point addition and doubling operations.
 *
 * Coordinate systems:
 * - Affine: (x, y) where the point is (x, y)
 * - Projective: (X, Y, Z) where the point is (X/Z, Y/Z)
 * - Jacobian: (X, Y, Z) where the point is (X/Z², Y/Z³)
 *
 * Requirements: 5.4
 */

import type {
  AffinePoint,
  ProjectivePoint,
  JacobianPoint,
  CurvePoint,
  CurveConfig,
  FieldElement,
} from '../types.js';
import {
  createFieldElement,
  isZeroFieldElement,
  fieldElementsEqual,
  getFieldElementValue,
} from '../field/element.js';
import { fieldMul, fieldInv, fieldSquare } from '../field/operations.js';

/**
 * Type guard for AffinePoint
 */
export function isAffinePoint(point: CurvePoint): point is AffinePoint {
  return 'isInfinity' in point && !('z' in point);
}

/**
 * Type guard for ProjectivePoint
 */
export function isProjectivePoint(point: CurvePoint): point is ProjectivePoint {
  return 'z' in point && !('isInfinity' in point);
}

/**
 * Type guard for JacobianPoint
 */
export function isJacobianPoint(point: CurvePoint): point is JacobianPoint {
  return 'z' in point && !('isInfinity' in point);
}

/**
 * Check if an affine point is the identity (point at infinity)
 */
export function isAffineIdentity(point: AffinePoint): boolean {
  return point.isInfinity;
}

/**
 * Check if a projective point is the identity (point at infinity)
 * In projective coordinates, the identity has Z = 0
 */
export function isProjectiveIdentity(point: ProjectivePoint): boolean {
  return isZeroFieldElement(point.z);
}

/**
 * Check if a Jacobian point is the identity (point at infinity)
 * In Jacobian coordinates, the identity has Z = 0
 */
export function isJacobianIdentity(point: JacobianPoint): boolean {
  return isZeroFieldElement(point.z);
}

/**
 * Check if any curve point is the identity
 */
export function isIdentity(point: CurvePoint): boolean {
  if (isAffinePoint(point)) {
    return isAffineIdentity(point);
  }
  // Both Projective and Jacobian use Z = 0 for identity
  return isZeroFieldElement((point as ProjectivePoint | JacobianPoint).z);
}

/**
 * Create an affine identity point (point at infinity)
 */
export function createAffineIdentity(curve: CurveConfig): AffinePoint {
  return {
    x: createFieldElement(0n, curve.field),
    y: createFieldElement(0n, curve.field),
    isInfinity: true,
  };
}

/**
 * Create a projective identity point (point at infinity)
 * Convention: (0, 1, 0) represents the identity
 */
export function createProjectiveIdentity(curve: CurveConfig): ProjectivePoint {
  return {
    x: createFieldElement(0n, curve.field),
    y: createFieldElement(1n, curve.field),
    z: createFieldElement(0n, curve.field),
  };
}

/**
 * Create a Jacobian identity point (point at infinity)
 * Convention: (1, 1, 0) represents the identity
 */
export function createJacobianIdentity(curve: CurveConfig): JacobianPoint {
  return {
    x: createFieldElement(1n, curve.field),
    y: createFieldElement(1n, curve.field),
    z: createFieldElement(0n, curve.field),
  };
}

/**
 * Create an affine point from coordinates
 */
export function createAffinePoint(
  x: bigint | FieldElement,
  y: bigint | FieldElement,
  curve: CurveConfig
): AffinePoint {
  const xElem = typeof x === 'bigint' ? createFieldElement(x, curve.field) : x;
  const yElem = typeof y === 'bigint' ? createFieldElement(y, curve.field) : y;

  return {
    x: xElem,
    y: yElem,
    isInfinity: false,
  };
}

/**
 * Create a projective point from coordinates
 */
export function createProjectivePoint(
  x: bigint | FieldElement,
  y: bigint | FieldElement,
  z: bigint | FieldElement,
  curve: CurveConfig
): ProjectivePoint {
  const xElem = typeof x === 'bigint' ? createFieldElement(x, curve.field) : x;
  const yElem = typeof y === 'bigint' ? createFieldElement(y, curve.field) : y;
  const zElem = typeof z === 'bigint' ? createFieldElement(z, curve.field) : z;

  return {
    x: xElem,
    y: yElem,
    z: zElem,
  };
}

/**
 * Create a Jacobian point from coordinates
 */
export function createJacobianPoint(
  x: bigint | FieldElement,
  y: bigint | FieldElement,
  z: bigint | FieldElement,
  curve: CurveConfig
): JacobianPoint {
  const xElem = typeof x === 'bigint' ? createFieldElement(x, curve.field) : x;
  const yElem = typeof y === 'bigint' ? createFieldElement(y, curve.field) : y;
  const zElem = typeof z === 'bigint' ? createFieldElement(z, curve.field) : z;

  return {
    x: xElem,
    y: yElem,
    z: zElem,
  };
}

/**
 * Convert an affine point to projective coordinates
 * (x, y) → (x, y, 1) for non-identity
 * identity → (0, 1, 0)
 */
export function affineToProjective(point: AffinePoint, curve: CurveConfig): ProjectivePoint {
  if (point.isInfinity) {
    return createProjectiveIdentity(curve);
  }

  return {
    x: point.x,
    y: point.y,
    z: createFieldElement(1n, curve.field),
  };
}

/**
 * Convert an affine point to Jacobian coordinates
 * (x, y) → (x, y, 1) for non-identity
 * identity → (1, 1, 0)
 */
export function affineToJacobian(point: AffinePoint, curve: CurveConfig): JacobianPoint {
  if (point.isInfinity) {
    return createJacobianIdentity(curve);
  }

  return {
    x: point.x,
    y: point.y,
    z: createFieldElement(1n, curve.field),
  };
}

/**
 * Convert a projective point to affine coordinates
 * (X, Y, Z) → (X/Z, Y/Z) for non-identity
 * (0, 1, 0) → identity
 */
export function projectiveToAffine(point: ProjectivePoint, curve: CurveConfig): AffinePoint {
  if (isProjectiveIdentity(point)) {
    return createAffineIdentity(curve);
  }

  const zInv = fieldInv(point.z);
  const x = fieldMul(point.x, zInv);
  const y = fieldMul(point.y, zInv);

  return {
    x,
    y,
    isInfinity: false,
  };
}

/**
 * Convert a projective point to Jacobian coordinates
 * (X, Y, Z) → (X*Z, Y*Z², Z) for non-identity
 */
export function projectiveToJacobian(point: ProjectivePoint, curve: CurveConfig): JacobianPoint {
  if (isProjectiveIdentity(point)) {
    return createJacobianIdentity(curve);
  }

  // Projective (X, Y, Z) represents (X/Z, Y/Z)
  // Jacobian (X', Y', Z') represents (X'/Z'², Y'/Z'³)
  // We want X'/Z'² = X/Z and Y'/Z'³ = Y/Z
  // Setting Z' = Z gives us X' = X*Z and Y' = Y*Z²
  const z2 = fieldSquare(point.z);
  const x = fieldMul(point.x, point.z);
  const y = fieldMul(point.y, z2);

  return {
    x,
    y,
    z: point.z,
  };
}

/**
 * Convert a Jacobian point to affine coordinates
 * (X, Y, Z) → (X/Z², Y/Z³) for non-identity
 * (1, 1, 0) → identity
 */
export function jacobianToAffine(point: JacobianPoint, curve: CurveConfig): AffinePoint {
  if (isJacobianIdentity(point)) {
    return createAffineIdentity(curve);
  }

  const zInv = fieldInv(point.z);
  const zInv2 = fieldSquare(zInv);
  const zInv3 = fieldMul(zInv2, zInv);

  const x = fieldMul(point.x, zInv2);
  const y = fieldMul(point.y, zInv3);

  return {
    x,
    y,
    isInfinity: false,
  };
}

/**
 * Convert a Jacobian point to projective coordinates
 * (X, Y, Z) → (X*Z, Y, Z³) for non-identity
 */
export function jacobianToProjective(point: JacobianPoint, curve: CurveConfig): ProjectivePoint {
  if (isJacobianIdentity(point)) {
    return createProjectiveIdentity(curve);
  }

  // Jacobian (X, Y, Z) represents (X/Z², Y/Z³)
  // Projective (X', Y', Z') represents (X'/Z', Y'/Z')
  // We want X'/Z' = X/Z² and Y'/Z' = Y/Z³
  // Setting Z' = Z³ gives us X' = X*Z and Y' = Y
  const z3 = fieldMul(fieldSquare(point.z), point.z);
  const x = fieldMul(point.x, point.z);

  return {
    x,
    y: point.y,
    z: z3,
  };
}

/**
 * Convert any curve point to affine coordinates
 */
export function toAffine(point: CurvePoint, curve: CurveConfig): AffinePoint {
  if (isAffinePoint(point)) {
    return point;
  }

  // Both ProjectivePoint and JacobianPoint have the same structure
  // We need to determine which one it is based on context
  // For now, we'll treat all non-affine points as Jacobian since that's
  // what we use internally for efficiency
  return jacobianToAffine(point as JacobianPoint, curve);
}

/**
 * Convert any curve point to projective coordinates
 */
export function toProjective(point: CurvePoint, curve: CurveConfig): ProjectivePoint {
  if (isAffinePoint(point)) {
    return affineToProjective(point, curve);
  }

  // Treat as Jacobian
  return jacobianToProjective(point as JacobianPoint, curve);
}

/**
 * Convert any curve point to Jacobian coordinates
 */
export function toJacobian(point: CurvePoint, curve: CurveConfig): JacobianPoint {
  if (isAffinePoint(point)) {
    return affineToJacobian(point, curve);
  }

  // Already Jacobian (or Projective with same structure)
  return point as JacobianPoint;
}

/**
 * Check if two affine points are equal
 */
export function affinePointsEqual(a: AffinePoint, b: AffinePoint): boolean {
  if (a.isInfinity && b.isInfinity) {
    return true;
  }
  if (a.isInfinity || b.isInfinity) {
    return false;
  }
  return fieldElementsEqual(a.x, b.x) && fieldElementsEqual(a.y, b.y);
}

/**
 * Check if two Jacobian points are equal
 * Two Jacobian points (X1, Y1, Z1) and (X2, Y2, Z2) are equal if:
 * X1 * Z2² = X2 * Z1² and Y1 * Z2³ = Y2 * Z1³
 */
export function jacobianPointsEqual(a: JacobianPoint, b: JacobianPoint): boolean {
  const aIsIdentity = isJacobianIdentity(a);
  const bIsIdentity = isJacobianIdentity(b);

  if (aIsIdentity && bIsIdentity) {
    return true;
  }
  if (aIsIdentity || bIsIdentity) {
    return false;
  }

  const z1_2 = fieldSquare(a.z);
  const z2_2 = fieldSquare(b.z);
  const z1_3 = fieldMul(z1_2, a.z);
  const z2_3 = fieldMul(z2_2, b.z);

  const x1z2_2 = fieldMul(a.x, z2_2);
  const x2z1_2 = fieldMul(b.x, z1_2);
  const y1z2_3 = fieldMul(a.y, z2_3);
  const y2z1_3 = fieldMul(b.y, z1_3);

  return fieldElementsEqual(x1z2_2, x2z1_2) && fieldElementsEqual(y1z2_3, y2z1_3);
}

/**
 * Check if two curve points are equal (converts to affine for comparison)
 */
export function curvePointsEqual(a: CurvePoint, b: CurvePoint, curve: CurveConfig): boolean {
  const aAffine = toAffine(a, curve);
  const bAffine = toAffine(b, curve);
  return affinePointsEqual(aAffine, bAffine);
}

/**
 * Clone an affine point
 */
export function cloneAffinePoint(point: AffinePoint, curve: CurveConfig): AffinePoint {
  if (point.isInfinity) {
    return createAffineIdentity(curve);
  }
  return {
    x: createFieldElement(getFieldElementValue(point.x), curve.field),
    y: createFieldElement(getFieldElementValue(point.y), curve.field),
    isInfinity: false,
  };
}

/**
 * Clone a Jacobian point
 */
export function cloneJacobianPoint(point: JacobianPoint, curve: CurveConfig): JacobianPoint {
  return {
    x: createFieldElement(getFieldElementValue(point.x), curve.field),
    y: createFieldElement(getFieldElementValue(point.y), curve.field),
    z: createFieldElement(getFieldElementValue(point.z), curve.field),
  };
}
