/**
 * Property-Based Tests for MSM Correctness
 *
 * **Property 1: MSM Correctness**
 * - Test MSM result equals sum of individual scalar multiplications
 * - Test for various input sizes
 *
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitrarySmallScalar,
} from '../test-utils/property-test-config.js';
import { BN254_CURVE, BLS12_381_CURVE } from '../curve/config.js';
import { toAffine, affinePointsEqual, createAffineIdentity } from '../curve/point.js';
import { scalarMul, pointAdd } from '../curve/operations.js';
import { msm, msmNaive } from './msm.js';
import { pippengerMsm } from './pippenger.js';
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
 * Generate an array of scalar-point pairs for MSM testing
 */
function arbitraryMsmInput(
  curve: CurveConfig,
  minSize: number = 1,
  maxSize: number = 16
): fc.Arbitrary<{ scalars: bigint[]; points: AffinePoint[] }> {
  return fc
    .integer({ min: minSize, max: maxSize })
    .chain((size) =>
      fc.tuple(
        fc.array(arbitrarySmallScalar(), { minLength: size, maxLength: size }),
        fc.array(arbitraryCurvePoint(curve), { minLength: size, maxLength: size })
      )
    )
    .map(([scalars, points]) => ({ scalars, points }));
}

/**
 * Compute MSM naively by summing individual scalar multiplications
 */
function computeMsmNaively(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig
): CurvePoint {
  let result: CurvePoint = createAffineIdentity(curve);
  for (let i = 0; i < scalars.length; i++) {
    const product = scalarMul(scalars[i]!, points[i]!, curve);
    result = pointAdd(result, product, curve);
  }
  return result;
}

describe('Property 1: MSM Correctness', () => {
  describe('BN254 Curve', () => {
    const curve = BN254_CURVE;

    // Feature: node-zk-accelerate, Property 1: MSM equals sum of scalar multiplications
    it('should satisfy MSM(scalars, points) = Σ(sᵢ · Pᵢ)', () => {
      fc.assert(
        fc.property(arbitraryMsmInput(curve, 1, 16), ({ scalars, points }) => {
          const msmResult = msm(scalars, points, curve, { validateInputs: false });
          const naiveResult = computeMsmNaively(scalars, points, curve);
          const msmAffine = toAffine(msmResult, curve);
          const naiveAffine = toAffine(naiveResult, curve);
          return affinePointsEqual(msmAffine, naiveAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 1: Pippenger equals naive MSM
    it('should produce same result as naive MSM implementation', () => {
      fc.assert(
        fc.property(arbitraryMsmInput(curve, 1, 16), ({ scalars, points }) => {
          const pippengerResult = pippengerMsm(scalars, points, curve);
          const naiveResult = msmNaive(scalars, points, curve);
          const pippengerAffine = toAffine(pippengerResult, curve);
          const naiveAffine = toAffine(naiveResult, curve);
          return affinePointsEqual(pippengerAffine, naiveAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 1: MSM with single point
    it('should satisfy MSM([s], [P]) = s · P', () => {
      fc.assert(
        fc.property(
          arbitrarySmallScalar(),
          arbitraryCurvePoint(curve),
          (scalar, point) => {
            const msmResult = msm([scalar], [point], curve, { validateInputs: false });
            const scalarMulResult = scalarMul(scalar, point, curve);
            const msmAffine = toAffine(msmResult, curve);
            const scalarMulAffine = toAffine(scalarMulResult, curve);
            return affinePointsEqual(msmAffine, scalarMulAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 1: MSM with empty input
    it('should return identity for empty input', () => {
      const result = msm([], [], curve, { validateInputs: false });
      const resultAffine = toAffine(result, curve);
      const identity = createAffineIdentity(curve);
      return affinePointsEqual(resultAffine, identity);
    });

    // Feature: node-zk-accelerate, Property 1: MSM with zero scalars
    it('should handle zero scalars correctly', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryCurvePoint(curve), { minLength: 1, maxLength: 8 }),
          (points) => {
            const zeroScalars = points.map(() => 0n);
            const result = msm(zeroScalars, points, curve, { validateInputs: false });
            const resultAffine = toAffine(result, curve);
            const identity = createAffineIdentity(curve);
            return affinePointsEqual(resultAffine, identity);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 1: MSM linearity
    it('should satisfy MSM([s1, s2], [P, P]) = (s1 + s2) · P', () => {
      fc.assert(
        fc.property(
          arbitrarySmallScalar(),
          arbitrarySmallScalar(),
          arbitraryCurvePoint(curve),
          (s1, s2, point) => {
            const msmResult = msm([s1, s2], [point, point], curve, { validateInputs: false });
            const sumScalar = s1 + s2;
            const scalarMulResult = scalarMul(sumScalar, point, curve);
            const msmAffine = toAffine(msmResult, curve);
            const scalarMulAffine = toAffine(scalarMulResult, curve);
            return affinePointsEqual(msmAffine, scalarMulAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 1: MSM with different window sizes
    it('should produce consistent results with different window sizes', () => {
      fc.assert(
        fc.property(arbitraryMsmInput(curve, 4, 16), ({ scalars, points }) => {
          const result4 = pippengerMsm(scalars, points, curve, 4);
          const result8 = pippengerMsm(scalars, points, curve, 8);
          const result4Affine = toAffine(result4, curve);
          const result8Affine = toAffine(result8, curve);
          return affinePointsEqual(result4Affine, result8Affine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('BLS12-381 Curve', () => {
    const curve = BLS12_381_CURVE;

    // Feature: node-zk-accelerate, Property 1: MSM equals sum of scalar multiplications (BLS12-381)
    it('should satisfy MSM(scalars, points) = Σ(sᵢ · Pᵢ)', () => {
      fc.assert(
        fc.property(arbitraryMsmInput(curve, 1, 8), ({ scalars, points }) => {
          const msmResult = msm(scalars, points, curve, { validateInputs: false });
          const naiveResult = computeMsmNaively(scalars, points, curve);
          const msmAffine = toAffine(msmResult, curve);
          const naiveAffine = toAffine(naiveResult, curve);
          return affinePointsEqual(msmAffine, naiveAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 1: MSM with single point (BLS12-381)
    it('should satisfy MSM([s], [P]) = s · P', () => {
      fc.assert(
        fc.property(
          arbitrarySmallScalar(),
          arbitraryCurvePoint(curve),
          (scalar, point) => {
            const msmResult = msm([scalar], [point], curve, { validateInputs: false });
            const scalarMulResult = scalarMul(scalar, point, curve);
            const msmAffine = toAffine(msmResult, curve);
            const scalarMulAffine = toAffine(scalarMulResult, curve);
            return affinePointsEqual(msmAffine, scalarMulAffine);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 1: Pippenger equals naive MSM (BLS12-381)
    it('should produce same result as naive MSM implementation', () => {
      fc.assert(
        fc.property(arbitraryMsmInput(curve, 1, 8), ({ scalars, points }) => {
          const pippengerResult = pippengerMsm(scalars, points, curve);
          const naiveResult = msmNaive(scalars, points, curve);
          const pippengerAffine = toAffine(pippengerResult, curve);
          const naiveAffine = toAffine(naiveResult, curve);
          return affinePointsEqual(pippengerAffine, naiveAffine);
        }),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
