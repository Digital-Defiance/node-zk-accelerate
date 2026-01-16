/**
 * Property-Based Tests for Coordinate Representation Equivalence
 *
 * **Property 10: Coordinate Representation Equivalence**
 * - Test converting between representations preserves point
 *
 * **Validates: Requirements 5.4**
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitrarySmallScalar,
} from '../test-utils/property-test-config.js';
import { BN254_CURVE, BLS12_381_CURVE } from './config.js';
import {
  affineToProjective,
  affineToJacobian,
  projectiveToAffine,
  projectiveToJacobian,
  jacobianToAffine,
  jacobianToProjective,
  toAffine,
  toProjective,
  toJacobian,
  affinePointsEqual,
  createAffineIdentity,
} from './point.js';
import { scalarMul } from './operations.js';
import type { CurveConfig, AffinePoint } from '../types.js';

/**
 * Generate a valid curve point by scalar multiplication of the generator
 */
function arbitraryCurvePoint(curve: CurveConfig): fc.Arbitrary<AffinePoint> {
  return arbitrarySmallScalar().map((scalar) => {
    const result = scalarMul(scalar, curve.generator, curve);
    return toAffine(result, curve);
  });
}

describe('Property 10: Coordinate Representation Equivalence', () => {
  describe('BN254 Curve', () => {
    const curve = BN254_CURVE;

    // Feature: node-zk-accelerate, Property 10: Affine → Projective → Affine round-trip
    it('should preserve point through Affine → Projective → Affine conversion', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const projective = affineToProjective(point, curve);
          const recovered = projectiveToAffine(projective, curve);
          return affinePointsEqual(point, recovered);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 10: Affine → Jacobian → Affine round-trip
    it('should preserve point through Affine → Jacobian → Affine conversion', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const jacobian = affineToJacobian(point, curve);
          const recovered = jacobianToAffine(jacobian, curve);
          return affinePointsEqual(point, recovered);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 10: Projective → Jacobian → Projective round-trip
    it('should preserve point through Projective → Jacobian → Projective conversion', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const projective = affineToProjective(point, curve);
          const jacobian = projectiveToJacobian(projective, curve);
          const recoveredProjective = jacobianToProjective(jacobian, curve);
          const recoveredAffine = projectiveToAffine(recoveredProjective, curve);
          return affinePointsEqual(point, recoveredAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 10: All representations equivalent
    it('should produce equivalent affine points from all representations', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const projective = affineToProjective(point, curve);
          const jacobian = affineToJacobian(point, curve);

          const fromProjective = projectiveToAffine(projective, curve);
          const fromJacobian = jacobianToAffine(jacobian, curve);

          return (
            affinePointsEqual(point, fromProjective) &&
            affinePointsEqual(point, fromJacobian) &&
            affinePointsEqual(fromProjective, fromJacobian)
          );
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 10: Identity point conversion
    it('should preserve identity point through all conversions', () => {
      const identity = createAffineIdentity(curve);

      const projective = affineToProjective(identity, curve);
      const jacobian = affineToJacobian(identity, curve);

      const fromProjective = projectiveToAffine(projective, curve);
      const fromJacobian = jacobianToAffine(jacobian, curve);

      // All should be identity
      if (!fromProjective.isInfinity || !fromJacobian.isInfinity) {
        throw new Error('Identity not preserved through conversion');
      }
    });

    // Feature: node-zk-accelerate, Property 10: Generic toAffine/toProjective/toJacobian
    it('should work with generic conversion functions', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          // Convert through all representations using generic functions
          const asJacobian = toJacobian(point, curve);
          const asProjective = toProjective(point, curve);
          const backToAffine1 = toAffine(asJacobian, curve);
          const backToAffine2 = toAffine(asProjective, curve);

          return (
            affinePointsEqual(point, backToAffine1) &&
            affinePointsEqual(point, backToAffine2)
          );
        }),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('BLS12-381 Curve', () => {
    const curve = BLS12_381_CURVE;

    // Feature: node-zk-accelerate, Property 10: Affine → Projective → Affine round-trip (BLS12-381)
    it('should preserve point through Affine → Projective → Affine conversion', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const projective = affineToProjective(point, curve);
          const recovered = projectiveToAffine(projective, curve);
          return affinePointsEqual(point, recovered);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 10: Affine → Jacobian → Affine round-trip (BLS12-381)
    it('should preserve point through Affine → Jacobian → Affine conversion', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const jacobian = affineToJacobian(point, curve);
          const recovered = jacobianToAffine(jacobian, curve);
          return affinePointsEqual(point, recovered);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 10: All representations equivalent (BLS12-381)
    it('should produce equivalent affine points from all representations', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const projective = affineToProjective(point, curve);
          const jacobian = affineToJacobian(point, curve);

          const fromProjective = projectiveToAffine(projective, curve);
          const fromJacobian = jacobianToAffine(jacobian, curve);

          return (
            affinePointsEqual(point, fromProjective) &&
            affinePointsEqual(point, fromJacobian) &&
            affinePointsEqual(fromProjective, fromJacobian)
          );
        }),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
