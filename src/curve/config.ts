/**
 * Curve Configuration for BN254 and BLS12-381
 *
 * This module defines the curve configurations including field parameters,
 * curve equation coefficients (a, b), generator points, and curve order.
 *
 * Requirements: 2.2, 2.3, 5.4
 */

import type { CurveConfig, AffinePoint, FieldConfig } from '../types.js';
import { BN254_FIELD, BLS12_381_FIELD, BN254_SCALAR_FIELD, BLS12_381_SCALAR_FIELD } from '../field/config.js';
import { createFieldElement } from '../field/element.js';

/**
 * Create an identity (point at infinity) for a given field
 */
export function createIdentityPoint(field: FieldConfig): AffinePoint {
  return {
    x: createFieldElement(0n, field),
    y: createFieldElement(0n, field),
    isInfinity: true,
  };
}

/**
 * BN254 curve configuration
 *
 * The BN254 curve (also known as alt_bn128) is defined by:
 * y² = x³ + 3 (a = 0, b = 3)
 *
 * Generator point G is the standard generator for the curve.
 * Order is the number of points in the prime-order subgroup.
 */
export const BN254_CURVE: CurveConfig = (() => {
  const field = BN254_FIELD;

  // Curve equation: y² = x³ + ax + b where a = 0, b = 3
  const a = createFieldElement(0n, field);
  const b = createFieldElement(3n, field);

  // Generator point (standard BN254 generator)
  // G = (1, 2)
  const generator: AffinePoint = {
    x: createFieldElement(1n, field),
    y: createFieldElement(2n, field),
    isInfinity: false,
  };

  // Curve order (number of points in the prime-order subgroup)
  const order = BN254_SCALAR_FIELD.modulus;

  return {
    name: 'BN254',
    field,
    a,
    b,
    generator,
    order,
  };
})();

/**
 * BLS12-381 G1 curve configuration
 *
 * The BLS12-381 G1 curve is defined by:
 * y² = x³ + 4 (a = 0, b = 4)
 *
 * Generator point G1 is the standard generator for the G1 subgroup.
 * Order is the number of points in the prime-order subgroup.
 */
export const BLS12_381_CURVE: CurveConfig = (() => {
  const field = BLS12_381_FIELD;

  // Curve equation: y² = x³ + ax + b where a = 0, b = 4
  const a = createFieldElement(0n, field);
  const b = createFieldElement(4n, field);

  // Generator point (standard BLS12-381 G1 generator)
  // These are the standard coordinates for the BLS12-381 G1 generator
  const generatorX = 3685416753713387016781088315183077757961620795782546409894578378688607592378376318836054947676345821548104185464507n;
  const generatorY = 1339506544944476473020471379941921221584933875938349620426543736416511423956333506472724655353366534992391756441569n;

  const generator: AffinePoint = {
    x: createFieldElement(generatorX, field),
    y: createFieldElement(generatorY, field),
    isInfinity: false,
  };

  // Curve order (number of points in the prime-order subgroup)
  const order = BLS12_381_SCALAR_FIELD.modulus;

  return {
    name: 'BLS12_381',
    field,
    a,
    b,
    generator,
    order,
  };
})();

/**
 * Get curve configuration by name
 */
export function getCurveConfig(name: 'BN254' | 'BLS12_381'): CurveConfig {
  switch (name) {
    case 'BN254':
      return BN254_CURVE;
    case 'BLS12_381':
      return BLS12_381_CURVE;
  }
}

/**
 * Get the identity point (point at infinity) for a curve
 */
export function getIdentityPoint(curve: CurveConfig): AffinePoint {
  return createIdentityPoint(curve.field);
}

/**
 * Validate that a curve configuration is internally consistent
 * Checks that the generator point is on the curve
 */
export function validateCurveConfig(config: CurveConfig): boolean {
  // Import here to avoid circular dependency
  const { isOnCurve } = require('./operations.js');
  return isOnCurve(config.generator, config);
}
