/**
 * Property-Based Tests for Elliptic Curve Group Properties
 *
 * **Property 8: Elliptic Curve Group Properties**
 * - Test identity: add(P, identity) = P
 * - Test inverse: add(P, negate(P)) = identity
 * - Test doubling: double(P) = add(P, P)
 *
 * **Validates: Requirements 5.1, 5.2, 5.8**
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitrarySmallScalar,
} from '../test-utils/property-test-config.js';
import { BN254_CURVE, BLS12_381_CURVE } from './config.js';
import {
  createAffineIdentity,
  toAffine,
  affinePointsEqual,
  isIdentity,
} from './point.js';
import { pointAdd, pointDouble, pointNegate, scalarMul } from './operations.js';
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

describe('Property 8: Elliptic Curve Group Properties', () => {
  describe('BN254 Curve', () => {
    const curve = BN254_CURVE;

    // Feature: node-zk-accelerate, Property 8: Identity property
    it('should satisfy add(P, identity) = P (identity property)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const identity = createAffineIdentity(curve);
          const result = pointAdd(point, identity, curve);
          const resultAffine = toAffine(result, curve);
          return affinePointsEqual(point, resultAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Identity property (reversed)
    it('should satisfy add(identity, P) = P (identity property reversed)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const identity = createAffineIdentity(curve);
          const result = pointAdd(identity, point, curve);
          const resultAffine = toAffine(result, curve);
          return affinePointsEqual(point, resultAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Inverse property
    it('should satisfy add(P, negate(P)) = identity (inverse property)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const negated = pointNegate(point, curve);
          const result = pointAdd(point, negated, curve);
          return isIdentity(result);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Doubling consistency
    it('should satisfy double(P) = add(P, P) (doubling consistency)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const doubled = pointDouble(point, curve);
          const added = pointAdd(point, point, curve);
          const doubledAffine = toAffine(doubled, curve);
          const addedAffine = toAffine(added, curve);
          return affinePointsEqual(doubledAffine, addedAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Commutativity
    it('should satisfy add(P, Q) = add(Q, P) (commutativity)', () => {
      fc.assert(
        fc.property(
          arbitraryCurvePoint(curve),
          arbitraryCurvePoint(curve),
          (p, q) => {
            const pq = pointAdd(p, q, curve);
            const qp = pointAdd(q, p, curve);
            const pqAffine = toAffine(pq, curve);
            const qpAffine = toAffine(qp, curve);
            return affinePointsEqual(pqAffine, qpAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Associativity
    it('should satisfy add(add(P, Q), R) = add(P, add(Q, R)) (associativity)', () => {
      fc.assert(
        fc.property(
          arbitraryCurvePoint(curve),
          arbitraryCurvePoint(curve),
          arbitraryCurvePoint(curve),
          (p, q, r) => {
            const pq_r = pointAdd(pointAdd(p, q, curve), r, curve);
            const p_qr = pointAdd(p, pointAdd(q, r, curve), curve);
            const pq_rAffine = toAffine(pq_r, curve);
            const p_qrAffine = toAffine(p_qr, curve);
            return affinePointsEqual(pq_rAffine, p_qrAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Double negation
    it('should satisfy negate(negate(P)) = P (double negation)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const doubleNeg = pointNegate(pointNegate(point, curve), curve);
          const doubleNegAffine = toAffine(doubleNeg, curve);
          return affinePointsEqual(point, doubleNegAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Negation of identity
    it('should satisfy negate(identity) = identity', () => {
      const identity = createAffineIdentity(curve);
      const negated = pointNegate(identity, curve);
      if (!isIdentity(negated)) {
        throw new Error('Negation of identity should be identity');
      }
    });
  });

  describe('BLS12-381 Curve', () => {
    const curve = BLS12_381_CURVE;

    // Feature: node-zk-accelerate, Property 8: Identity property (BLS12-381)
    it('should satisfy add(P, identity) = P (identity property)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const identity = createAffineIdentity(curve);
          const result = pointAdd(point, identity, curve);
          const resultAffine = toAffine(result, curve);
          return affinePointsEqual(point, resultAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Inverse property (BLS12-381)
    it('should satisfy add(P, negate(P)) = identity (inverse property)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const negated = pointNegate(point, curve);
          const result = pointAdd(point, negated, curve);
          return isIdentity(result);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Doubling consistency (BLS12-381)
    it('should satisfy double(P) = add(P, P) (doubling consistency)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const doubled = pointDouble(point, curve);
          const added = pointAdd(point, point, curve);
          const doubledAffine = toAffine(doubled, curve);
          const addedAffine = toAffine(added, curve);
          return affinePointsEqual(doubledAffine, addedAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 8: Associativity (BLS12-381)
    it('should satisfy add(add(P, Q), R) = add(P, add(Q, R)) (associativity)', () => {
      fc.assert(
        fc.property(
          arbitraryCurvePoint(curve),
          arbitraryCurvePoint(curve),
          arbitraryCurvePoint(curve),
          (p, q, r) => {
            const pq_r = pointAdd(pointAdd(p, q, curve), r, curve);
            const p_qr = pointAdd(p, pointAdd(q, r, curve), curve);
            const pq_rAffine = toAffine(pq_r, curve);
            const p_qrAffine = toAffine(p_qr, curve);
            return affinePointsEqual(pq_rAffine, p_qrAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
