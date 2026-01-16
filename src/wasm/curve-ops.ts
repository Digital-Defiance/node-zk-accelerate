/**
 * @digitaldefiance/node-zk-accelerate
 * WASM Fallback - Curve Operations
 *
 * Pure JavaScript implementations of elliptic curve operations
 * for use when native bindings are unavailable.
 *
 * Requirements: 13.5, 13.7
 */

import type { AffinePoint, JacobianPoint, CurveConfig, Scalar } from '../types.js';
import {
  wasmFieldAdd,
  wasmFieldSub,
  wasmFieldMul,
  wasmFieldInv,
  createFieldElementFromBigint,
} from './field-ops.js';

import { getFieldValue } from './field-ops.js';

/**
 * Check if a Jacobian point is the identity (Z = 0)
 */
function isJacobianIdentity(point: JacobianPoint): boolean {
  return getFieldValue(point.z) === 0n;
}

/**
 * Create the identity point for a curve
 */
function createIdentity(curve: CurveConfig): JacobianPoint {
  const field = curve.field;
  return {
    x: createFieldElementFromBigint(1n, field),
    y: createFieldElementFromBigint(1n, field),
    z: createFieldElementFromBigint(0n, field),
  };
}

/**
 * Convert affine point to Jacobian coordinates
 */
function affineToJacobian(point: AffinePoint, curve: CurveConfig): JacobianPoint {
  if (point.isInfinity) {
    return createIdentity(curve);
  }

  const field = curve.field;
  return {
    x: point.x,
    y: point.y,
    z: createFieldElementFromBigint(1n, field),
  };
}

/**
 * Convert Jacobian point to affine coordinates
 */
function jacobianToAffine(point: JacobianPoint, curve: CurveConfig): AffinePoint {
  if (isJacobianIdentity(point)) {
    const field = curve.field;
    return {
      x: createFieldElementFromBigint(0n, field),
      y: createFieldElementFromBigint(0n, field),
      isInfinity: true,
    };
  }

  // x_affine = X / Z^2
  // y_affine = Y / Z^3
  const zInv = wasmFieldInv(point.z);
  const zInv2 = wasmFieldMul(zInv, zInv);
  const zInv3 = wasmFieldMul(zInv2, zInv);

  const x = wasmFieldMul(point.x, zInv2);
  const y = wasmFieldMul(point.y, zInv3);

  return {
    x,
    y,
    isInfinity: false,
  };
}

/**
 * Point addition in Jacobian coordinates
 * Uses the standard formulas for Jacobian addition
 */
export function wasmPointAdd(
  p1: AffinePoint | JacobianPoint,
  p2: AffinePoint | JacobianPoint,
  curve: CurveConfig
): JacobianPoint {
  // Convert to Jacobian if needed
  const j1: JacobianPoint = 'z' in p1 ? p1 : affineToJacobian(p1 as AffinePoint, curve);
  const j2: JacobianPoint = 'z' in p2 ? p2 : affineToJacobian(p2 as AffinePoint, curve);

  // Handle identity cases
  if (isJacobianIdentity(j1)) return j2;
  if (isJacobianIdentity(j2)) return j1;

  // Z1^2, Z2^2
  const z1z1 = wasmFieldMul(j1.z, j1.z);
  const z2z2 = wasmFieldMul(j2.z, j2.z);

  // U1 = X1 * Z2^2, U2 = X2 * Z1^2
  const u1 = wasmFieldMul(j1.x, z2z2);
  const u2 = wasmFieldMul(j2.x, z1z1);

  // S1 = Y1 * Z2^3, S2 = Y2 * Z1^3
  const z1z1z1 = wasmFieldMul(z1z1, j1.z);
  const z2z2z2 = wasmFieldMul(z2z2, j2.z);
  const s1 = wasmFieldMul(j1.y, z2z2z2);
  const s2 = wasmFieldMul(j2.y, z1z1z1);

  // H = U2 - U1
  const h = wasmFieldSub(u2, u1);

  // Check if points are the same (H = 0)
  if (getFieldValue(h) === 0n) {
    // Check if S1 = S2 (same point, need to double)
    const sDiff = wasmFieldSub(s2, s1);
    if (getFieldValue(sDiff) === 0n) {
      return wasmPointDouble(j1, curve);
    }
    // Points are inverses, return identity
    return createIdentity(curve);
  }

  // R = S2 - S1
  const r = wasmFieldSub(s2, s1);

  // H^2, H^3
  const hh = wasmFieldMul(h, h);
  const hhh = wasmFieldMul(hh, h);

  // V = U1 * H^2
  const v = wasmFieldMul(u1, hh);

  // X3 = R^2 - H^3 - 2*V
  const rr = wasmFieldMul(r, r);
  const x3 = wasmFieldSub(wasmFieldSub(rr, hhh), wasmFieldAdd(v, v));

  // Y3 = R * (V - X3) - S1 * H^3
  const vMinusX3 = wasmFieldSub(v, x3);
  const rTimesVMinusX3 = wasmFieldMul(r, vMinusX3);
  const s1TimesHhh = wasmFieldMul(s1, hhh);
  const y3 = wasmFieldSub(rTimesVMinusX3, s1TimesHhh);

  // Z3 = Z1 * Z2 * H
  const z1z2 = wasmFieldMul(j1.z, j2.z);
  const z3 = wasmFieldMul(z1z2, h);

  return { x: x3, y: y3, z: z3 };
}

/**
 * Point doubling in Jacobian coordinates
 */
export function wasmPointDouble(point: JacobianPoint, curve: CurveConfig): JacobianPoint {
  // Handle identity
  if (isJacobianIdentity(point)) {
    return createIdentity(curve);
  }

  // A = X^2
  const a = wasmFieldMul(point.x, point.x);

  // B = Y^2
  const b = wasmFieldMul(point.y, point.y);

  // C = B^2
  const c = wasmFieldMul(b, b);

  // D = 2 * ((X + B)^2 - A - C)
  const xPlusB = wasmFieldAdd(point.x, b);
  const xPlusBSquared = wasmFieldMul(xPlusB, xPlusB);
  const d = wasmFieldAdd(
    wasmFieldSub(wasmFieldSub(xPlusBSquared, a), c),
    wasmFieldSub(wasmFieldSub(xPlusBSquared, a), c)
  );

  // E = 3 * A (for a = 0 curves like BN254 and BLS12-381)
  const e = wasmFieldAdd(wasmFieldAdd(a, a), a);

  // F = E^2
  const f = wasmFieldMul(e, e);

  // X3 = F - 2 * D
  const x3 = wasmFieldSub(f, wasmFieldAdd(d, d));

  // Y3 = E * (D - X3) - 8 * C
  const dMinusX3 = wasmFieldSub(d, x3);
  const eTimesDMinusX3 = wasmFieldMul(e, dMinusX3);
  const c2 = wasmFieldAdd(c, c);
  const c4 = wasmFieldAdd(c2, c2);
  const c8 = wasmFieldAdd(c4, c4);
  const y3 = wasmFieldSub(eTimesDMinusX3, c8);

  // Z3 = 2 * Y * Z
  const yz = wasmFieldMul(point.y, point.z);
  const z3 = wasmFieldAdd(yz, yz);

  return { x: x3, y: y3, z: z3 };
}

/**
 * Scalar multiplication using double-and-add algorithm
 */
export function wasmScalarMul(
  scalar: Scalar | bigint,
  point: AffinePoint | JacobianPoint,
  curve: CurveConfig
): JacobianPoint {
  const s = typeof scalar === 'bigint' ? scalar : scalar.value;

  // Handle edge cases
  if (s === 0n) {
    return createIdentity(curve);
  }

  // Convert to Jacobian
  const p: JacobianPoint = 'z' in point ? point : affineToJacobian(point as AffinePoint, curve);

  if (isJacobianIdentity(p)) {
    return createIdentity(curve);
  }

  // Double-and-add algorithm
  let result = createIdentity(curve);
  let current = p;

  let remaining = s;
  while (remaining > 0n) {
    if (remaining & 1n) {
      result = wasmPointAdd(result, current, curve);
    }
    current = wasmPointDouble(current, curve);
    remaining >>= 1n;
  }

  return result;
}

/**
 * Check if a point is on the curve
 * Verifies y^2 = x^3 + ax + b
 */
export function wasmIsOnCurve(point: AffinePoint, curve: CurveConfig): boolean {
  if (point.isInfinity) {
    return true;
  }

  // y^2
  const y2 = wasmFieldMul(point.y, point.y);

  // x^3
  const x2 = wasmFieldMul(point.x, point.x);
  const x3 = wasmFieldMul(x2, point.x);

  // ax
  const ax = wasmFieldMul(curve.a, point.x);

  // x^3 + ax + b
  const rhs = wasmFieldAdd(wasmFieldAdd(x3, ax), curve.b);

  return getFieldValue(y2) === getFieldValue(rhs);
}

// Export jacobianToAffine for use in other modules
export { jacobianToAffine };
