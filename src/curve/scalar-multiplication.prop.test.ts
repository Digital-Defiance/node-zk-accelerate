/**
 * Property-Based Tests for Scalar Multiplication
 *
 * **Property 11: Scalar Multiplication Correctness**
 * - Test scalar_mul(s, P) equals adding P s times (for small s)
 * - Test scalar_mul(a+b, P) = add(scalar_mul(a, P), scalar_mul(b, P))
 *
 * **Validates: Requirements 5.3**
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
import { pointAdd, scalarMul, scalarMulWindowed } from './operations.js';
import type { CurveConfig, AffinePoint, CurvePoint } from '../types.js';

/**
 * Generate a valid curve point by scalar multiplication of the generator
 */
function arbitraryCurvePoint(curve: CurveConfig): fc.Arbitrary<AffinePoint> {
  return arbitrarySmallScalar().map((scalar) => {
    const result = scalarMul(scalar, curve.generator, curve);
    return toAffine(result, curve);
  });
}

/**
 * Arbitrary generator for very small scalars (for naive multiplication test)
 */
function arbitraryVerySmallScalar(): fc.Arbitrary<bigint> {
  return fc.bigInt({ min: 1n, max: 20n });
}

/**
 * Naive scalar multiplication by repeated addition
 * Used to verify the optimized implementation
 */
function naiveScalarMul(scalar: bigint, point: CurvePoint, curve: CurveConfig): CurvePoint {
  if (scalar === 0n) {
    return createAffineIdentity(curve);
  }

  let result: CurvePoint = createAffineIdentity(curve);
  for (let i = 0n; i < scalar; i++) {
    result = pointAdd(result, point, curve);
  }
  return result;
}

describe('Property 11: Scalar Multiplication Correctness', () => {
  describe('BN254 Curve', () => {
    const curve = BN254_CURVE;

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication equals repeated addition
    it('should satisfy scalar_mul(s, P) = P + P + ... + P (s times) for small s', () => {
      fc.assert(
        fc.property(
          arbitraryVerySmallScalar(),
          arbitraryCurvePoint(curve),
          (scalar, point) => {
            const optimized = scalarMul(scalar, point, curve);
            const naive = naiveScalarMul(scalar, point, curve);
            const optimizedAffine = toAffine(optimized, curve);
            const naiveAffine = toAffine(naive, curve);
            return affinePointsEqual(optimizedAffine, naiveAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication distributivity
    it('should satisfy scalar_mul(a+b, P) = add(scalar_mul(a, P), scalar_mul(b, P))', () => {
      fc.assert(
        fc.property(
          arbitrarySmallScalar(),
          arbitrarySmallScalar(),
          arbitraryCurvePoint(curve),
          (a, b, point) => {
            const sumScalar = a + b;
            const lhs = scalarMul(sumScalar, point, curve);
            const aP = scalarMul(a, point, curve);
            const bP = scalarMul(b, point, curve);
            const rhs = pointAdd(aP, bP, curve);
            const lhsAffine = toAffine(lhs, curve);
            const rhsAffine = toAffine(rhs, curve);
            return affinePointsEqual(lhsAffine, rhsAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication by 1
    it('should satisfy scalar_mul(1, P) = P', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const result = scalarMul(1n, point, curve);
          const resultAffine = toAffine(result, curve);
          return affinePointsEqual(point, resultAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication by 0
    it('should satisfy scalar_mul(0, P) = identity', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const result = scalarMul(0n, point, curve);
          return isIdentity(result);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication by 2 equals doubling
    it('should satisfy scalar_mul(2, P) = add(P, P)', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const doubled = scalarMul(2n, point, curve);
          const added = pointAdd(point, point, curve);
          const doubledAffine = toAffine(doubled, curve);
          const addedAffine = toAffine(added, curve);
          return affinePointsEqual(doubledAffine, addedAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication associativity
    it('should satisfy scalar_mul(a, scalar_mul(b, P)) = scalar_mul(a*b, P)', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 1n, max: 100n }),
          fc.bigInt({ min: 1n, max: 100n }),
          arbitraryCurvePoint(curve),
          (a, b, point) => {
            const bP = scalarMul(b, point, curve);
            const a_bP = scalarMul(a, bP, curve);
            const abP = scalarMul(a * b, point, curve);
            const a_bPAffine = toAffine(a_bP, curve);
            const abPAffine = toAffine(abP, curve);
            return affinePointsEqual(a_bPAffine, abPAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Windowed scalar multiplication consistency
    it('should produce same result with windowed and basic scalar multiplication', () => {
      fc.assert(
        fc.property(
          arbitrarySmallScalar(),
          arbitraryCurvePoint(curve),
          (scalar, point) => {
            const basic = scalarMul(scalar, point, curve);
            const windowed = scalarMulWindowed(scalar, point, curve, 4);
            const basicAffine = toAffine(basic, curve);
            const windowedAffine = toAffine(windowed, curve);
            return affinePointsEqual(basicAffine, windowedAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Generator multiplication
    it('should correctly multiply the generator point', () => {
      fc.assert(
        fc.property(arbitrarySmallScalar(), (scalar) => {
          const result = scalarMul(scalar, curve.generator, curve);
          // Verify by computing scalar * G using naive method for small scalars
          if (scalar <= 20n) {
            const naive = naiveScalarMul(scalar, curve.generator, curve);
            const resultAffine = toAffine(result, curve);
            const naiveAffine = toAffine(naive, curve);
            return affinePointsEqual(resultAffine, naiveAffine);
          }
          // For larger scalars, just verify it's not identity (unless scalar is 0)
          return !isIdentity(result);
        }),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('BLS12-381 Curve', () => {
    const curve = BLS12_381_CURVE;

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication equals repeated addition (BLS12-381)
    it('should satisfy scalar_mul(s, P) = P + P + ... + P (s times) for small s', () => {
      fc.assert(
        fc.property(
          arbitraryVerySmallScalar(),
          arbitraryCurvePoint(curve),
          (scalar, point) => {
            const optimized = scalarMul(scalar, point, curve);
            const naive = naiveScalarMul(scalar, point, curve);
            const optimizedAffine = toAffine(optimized, curve);
            const naiveAffine = toAffine(naive, curve);
            return affinePointsEqual(optimizedAffine, naiveAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication distributivity (BLS12-381)
    it('should satisfy scalar_mul(a+b, P) = add(scalar_mul(a, P), scalar_mul(b, P))', () => {
      fc.assert(
        fc.property(
          arbitrarySmallScalar(),
          arbitrarySmallScalar(),
          arbitraryCurvePoint(curve),
          (a, b, point) => {
            const sumScalar = a + b;
            const lhs = scalarMul(sumScalar, point, curve);
            const aP = scalarMul(a, point, curve);
            const bP = scalarMul(b, point, curve);
            const rhs = pointAdd(aP, bP, curve);
            const lhsAffine = toAffine(lhs, curve);
            const rhsAffine = toAffine(rhs, curve);
            return affinePointsEqual(lhsAffine, rhsAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication by 0 (BLS12-381)
    it('should satisfy scalar_mul(0, P) = identity', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const result = scalarMul(0n, point, curve);
          return isIdentity(result);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 11: Scalar multiplication associativity (BLS12-381)
    it('should satisfy scalar_mul(a, scalar_mul(b, P)) = scalar_mul(a*b, P)', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 1n, max: 100n }),
          fc.bigInt({ min: 1n, max: 100n }),
          arbitraryCurvePoint(curve),
          (a, b, point) => {
            const bP = scalarMul(b, point, curve);
            const a_bP = scalarMul(a, bP, curve);
            const abP = scalarMul(a * b, point, curve);
            const a_bPAffine = toAffine(a_bP, curve);
            const abPAffine = toAffine(abP, curve);
            return affinePointsEqual(a_bPAffine, abPAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
