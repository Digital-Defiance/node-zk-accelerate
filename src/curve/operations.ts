/**
 * Elliptic Curve Operations
 *
 * This module provides core elliptic curve operations including point addition,
 * doubling, negation, scalar multiplication, and validation. Operations are
 * implemented using Jacobian coordinates for efficiency.
 *
 * Requirements: 5.1, 5.2, 5.3, 15.2
 */

import type {
  JacobianPoint,
  CurvePoint,
  CurveConfig,
} from '../types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import {
  createFieldElement,
  isZeroFieldElement,
  getFieldElementValue,
  fieldElementsEqual,
} from '../field/element.js';
import {
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldNeg,
  fieldSquare,
} from '../field/operations.js';
import {
  isIdentity,
  isAffinePoint,
  createJacobianIdentity,
  createAffineIdentity,
  jacobianToAffine,
  toJacobian,
  toAffine,
  isJacobianIdentity,
} from './point.js';

/**
 * Check if a point is on the curve
 * Verifies that y² = x³ + ax + b
 */
export function isOnCurve(point: CurvePoint, curve: CurveConfig): boolean {
  if (isIdentity(point)) {
    return true; // Identity is always on the curve
  }

  const affine = toAffine(point, curve);

  // Compute y²
  const y2 = fieldSquare(affine.y);

  // Compute x³
  const x2 = fieldSquare(affine.x);
  const x3 = fieldMul(x2, affine.x);

  // Compute ax
  const ax = fieldMul(curve.a, affine.x);

  // Compute x³ + ax + b
  const rhs = fieldAdd(fieldAdd(x3, ax), curve.b);

  return fieldElementsEqual(y2, rhs);
}

/**
 * Validate that a point is on the curve, throwing if not
 */
export function validateCurvePoint(point: CurvePoint, curve: CurveConfig): void {
  if (!isOnCurve(point, curve)) {
    const affine = toAffine(point, curve);
    throw new ZkAccelerateError(
      'Point is not on the curve',
      ErrorCode.INVALID_CURVE_POINT,
      {
        x: getFieldElementValue(affine.x).toString(),
        y: getFieldElementValue(affine.y).toString(),
        curve: curve.name,
      }
    );
  }
}

/**
 * Negate a point
 * For affine: (x, y) → (x, -y)
 * For Jacobian: (X, Y, Z) → (X, -Y, Z)
 */
export function pointNegate(point: CurvePoint, curve: CurveConfig): CurvePoint {
  if (isIdentity(point)) {
    if (isAffinePoint(point)) {
      return createAffineIdentity(curve);
    }
    return createJacobianIdentity(curve);
  }

  if (isAffinePoint(point)) {
    return {
      x: point.x,
      y: fieldNeg(point.y),
      isInfinity: false,
    };
  }

  const jacobian = point as JacobianPoint;
  return {
    x: jacobian.x,
    y: fieldNeg(jacobian.y),
    z: jacobian.z,
  };
}

/**
 * Point doubling in Jacobian coordinates
 *
 * For a point P = (X, Y, Z), computes 2P using the formula:
 * For curves with a = 0 (like BN254 and BLS12-381):
 *   S = 4*X*Y²
 *   M = 3*X²
 *   X' = M² - 2*S
 *   Y' = M*(S - X') - 8*Y⁴
 *   Z' = 2*Y*Z
 *
 * Requirements: 5.2
 */
export function jacobianDouble(point: JacobianPoint, curve: CurveConfig): JacobianPoint {
  // Handle identity
  if (isJacobianIdentity(point)) {
    return createJacobianIdentity(curve);
  }

  // Handle Y = 0 (point of order 2)
  if (isZeroFieldElement(point.y)) {
    return createJacobianIdentity(curve);
  }

  const field = curve.field;
  const X = point.x;
  const Y = point.y;
  const Z = point.z;

  // For a = 0 curves (BN254 and BLS12-381)
  // M = 3*X²
  const X2 = fieldSquare(X);
  const three = createFieldElement(3n, field);
  const M = fieldMul(three, X2);

  // S = 4*X*Y²
  const Y2 = fieldSquare(Y);
  const XY2 = fieldMul(X, Y2);
  const four = createFieldElement(4n, field);
  const S = fieldMul(four, XY2);

  // X' = M² - 2*S
  const M2 = fieldSquare(M);
  const two = createFieldElement(2n, field);
  const twoS = fieldMul(two, S);
  const X3 = fieldSub(M2, twoS);

  // Y' = M*(S - X') - 8*Y⁴
  const SminusX3 = fieldSub(S, X3);
  const MSminusX3 = fieldMul(M, SminusX3);
  const Y4 = fieldSquare(Y2);
  const eight = createFieldElement(8n, field);
  const eightY4 = fieldMul(eight, Y4);
  const Y3 = fieldSub(MSminusX3, eightY4);

  // Z' = 2*Y*Z
  const YZ = fieldMul(Y, Z);
  const Z3 = fieldMul(two, YZ);

  return { x: X3, y: Y3, z: Z3 };
}

/**
 * Point addition in Jacobian coordinates
 *
 * For points P1 = (X1, Y1, Z1) and P2 = (X2, Y2, Z2), computes P1 + P2
 *
 * Requirements: 5.1
 */
export function jacobianAdd(
  p1: JacobianPoint,
  p2: JacobianPoint,
  curve: CurveConfig
): JacobianPoint {
  // Handle identity cases
  if (isJacobianIdentity(p1)) {
    return p2;
  }
  if (isJacobianIdentity(p2)) {
    return p1;
  }

  const field = curve.field;

  // U1 = X1 * Z2²
  const Z2_2 = fieldSquare(p2.z);
  const U1 = fieldMul(p1.x, Z2_2);

  // U2 = X2 * Z1²
  const Z1_2 = fieldSquare(p1.z);
  const U2 = fieldMul(p2.x, Z1_2);

  // S1 = Y1 * Z2³
  const Z2_3 = fieldMul(Z2_2, p2.z);
  const S1 = fieldMul(p1.y, Z2_3);

  // S2 = Y2 * Z1³
  const Z1_3 = fieldMul(Z1_2, p1.z);
  const S2 = fieldMul(p2.y, Z1_3);

  // H = U2 - U1
  const H = fieldSub(U2, U1);

  // R = S2 - S1
  const R = fieldSub(S2, S1);

  // Check if points are the same or negatives
  if (isZeroFieldElement(H)) {
    if (isZeroFieldElement(R)) {
      // Points are the same, use doubling
      return jacobianDouble(p1, curve);
    } else {
      // Points are negatives, return identity
      return createJacobianIdentity(curve);
    }
  }

  // H² and H³
  const H2 = fieldSquare(H);
  const H3 = fieldMul(H2, H);

  // U1H² = U1 * H²
  const U1H2 = fieldMul(U1, H2);

  // X3 = R² - H³ - 2*U1H²
  const R2 = fieldSquare(R);
  const two = createFieldElement(2n, field);
  const twoU1H2 = fieldMul(two, U1H2);
  const X3 = fieldSub(fieldSub(R2, H3), twoU1H2);

  // Y3 = R*(U1H² - X3) - S1*H³
  const U1H2minusX3 = fieldSub(U1H2, X3);
  const RU1H2minusX3 = fieldMul(R, U1H2minusX3);
  const S1H3 = fieldMul(S1, H3);
  const Y3 = fieldSub(RU1H2minusX3, S1H3);

  // Z3 = H * Z1 * Z2
  const Z1Z2 = fieldMul(p1.z, p2.z);
  const Z3 = fieldMul(H, Z1Z2);

  return { x: X3, y: Y3, z: Z3 };
}

/**
 * Add two curve points (any representation)
 * Converts to Jacobian, performs addition, returns in same format as first input
 */
export function pointAdd(p1: CurvePoint, p2: CurvePoint, curve: CurveConfig): CurvePoint {
  const j1 = toJacobian(p1, curve);
  const j2 = toJacobian(p2, curve);
  const result = jacobianAdd(j1, j2, curve);

  // Return in same format as first input
  if (isAffinePoint(p1)) {
    return jacobianToAffine(result, curve);
  }
  return result;
}

/**
 * Double a curve point (any representation)
 */
export function pointDouble(point: CurvePoint, curve: CurveConfig): CurvePoint {
  const jacobian = toJacobian(point, curve);
  const result = jacobianDouble(jacobian, curve);

  // Return in same format as input
  if (isAffinePoint(point)) {
    return jacobianToAffine(result, curve);
  }
  return result;
}

/**
 * Scalar multiplication using double-and-add algorithm
 *
 * Computes scalar * point using the binary method.
 * For larger scalars, a windowed method would be more efficient.
 *
 * Requirements: 5.3
 */
export function scalarMul(scalar: bigint, point: CurvePoint, curve: CurveConfig): CurvePoint {
  // Handle edge cases
  if (scalar === 0n) {
    if (isAffinePoint(point)) {
      return createAffineIdentity(curve);
    }
    return createJacobianIdentity(curve);
  }

  if (scalar < 0n) {
    // Negate scalar and point
    scalar = -scalar;
    point = pointNegate(point, curve);
  }

  if (scalar === 1n) {
    return point;
  }

  if (isIdentity(point)) {
    if (isAffinePoint(point)) {
      return createAffineIdentity(curve);
    }
    return createJacobianIdentity(curve);
  }

  // Convert to Jacobian for efficient computation
  let result = createJacobianIdentity(curve);
  let base = toJacobian(point, curve);

  // Double-and-add algorithm
  while (scalar > 0n) {
    if (scalar & 1n) {
      result = jacobianAdd(result, base, curve);
    }
    base = jacobianDouble(base, curve);
    scalar >>= 1n;
  }

  // Return in same format as input
  if (isAffinePoint(point)) {
    return jacobianToAffine(result, curve);
  }
  return result;
}

/**
 * Windowed scalar multiplication for larger scalars
 *
 * Uses a fixed window size for better performance on larger scalars.
 * Precomputes [1]P, [2]P, ..., [2^w - 1]P and uses them for multiplication.
 */
export function scalarMulWindowed(
  scalar: bigint,
  point: CurvePoint,
  curve: CurveConfig,
  windowSize: number = 4
): CurvePoint {
  // For small scalars, use simple double-and-add
  if (scalar < (1n << BigInt(windowSize * 2))) {
    return scalarMul(scalar, point, curve);
  }

  // Handle edge cases
  if (scalar === 0n) {
    if (isAffinePoint(point)) {
      return createAffineIdentity(curve);
    }
    return createJacobianIdentity(curve);
  }

  if (scalar < 0n) {
    scalar = -scalar;
    point = pointNegate(point, curve);
  }

  if (isIdentity(point)) {
    if (isAffinePoint(point)) {
      return createAffineIdentity(curve);
    }
    return createJacobianIdentity(curve);
  }

  // Convert to Jacobian
  const baseJacobian = toJacobian(point, curve);

  // Precompute [1]P, [2]P, ..., [2^w - 1]P
  const numPrecomputed = 1 << windowSize;
  const precomputed: JacobianPoint[] = new Array(numPrecomputed);
  precomputed[0] = createJacobianIdentity(curve);
  precomputed[1] = baseJacobian;

  for (let i = 2; i < numPrecomputed; i++) {
    precomputed[i] = jacobianAdd(precomputed[i - 1]!, baseJacobian, curve);
  }

  // Process scalar in windows
  let result = createJacobianIdentity(curve);
  const mask = BigInt(numPrecomputed - 1);

  // Find the highest bit position
  let bits = 0n;
  let temp = scalar;
  while (temp > 0n) {
    bits++;
    temp >>= 1n;
  }

  // Round up to multiple of window size
  const numWindows = Number((bits + BigInt(windowSize) - 1n) / BigInt(windowSize));

  for (let i = numWindows - 1; i >= 0; i--) {
    // Double windowSize times
    for (let j = 0; j < windowSize; j++) {
      result = jacobianDouble(result, curve);
    }

    // Extract window bits
    const shift = BigInt(i * windowSize);
    const windowBits = Number((scalar >> shift) & mask);

    // Add precomputed value
    if (windowBits > 0) {
      result = jacobianAdd(result, precomputed[windowBits]!, curve);
    }
  }

  // Return in same format as input
  if (isAffinePoint(point)) {
    return jacobianToAffine(result, curve);
  }
  return result;
}
