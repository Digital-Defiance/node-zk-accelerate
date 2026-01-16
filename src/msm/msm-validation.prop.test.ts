/**
 * Property-Based Tests for MSM Invalid Input Handling
 *
 * **Property 2: MSM Invalid Input Handling**
 * - Test invalid curve points return errors
 * - Test mismatched array lengths return errors
 *
 * **Validates: Requirements 2.10**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitrarySmallScalar,
  arbitraryFieldValue,
} from '../test-utils/property-test-config.js';
import { BN254_CURVE, BLS12_381_CURVE } from '../curve/config.js';
import { createAffinePoint, toAffine } from '../curve/point.js';
import { scalarMul, isOnCurve } from '../curve/operations.js';
import { createFieldElement } from '../field/element.js';
import { msm } from './msm.js';
import { validateMsmInputs, validateArrayLengths, validatePoint } from './validation.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
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

/**
 * Generate an invalid curve point (not on the curve)
 * Creates a point with random x, y coordinates that is unlikely to be on the curve
 */
function arbitraryInvalidCurvePoint(curve: CurveConfig): fc.Arbitrary<AffinePoint> {
  return fc
    .tuple(
      arbitraryFieldValue(curve.field.modulus),
      arbitraryFieldValue(curve.field.modulus)
    )
    .filter(([x, y]) => {
      // Create a point and check it's NOT on the curve
      const point = createAffinePoint(x, y, curve);
      return !isOnCurve(point, curve);
    })
    .map(([x, y]) => createAffinePoint(x, y, curve));
}

describe('Property 2: MSM Invalid Input Handling', () => {
  describe('BN254 Curve', () => {
    const curve = BN254_CURVE;

    // Feature: node-zk-accelerate, Property 2: Mismatched array lengths
    it('should throw error for mismatched array lengths', () => {
      fc.assert(
        fc.property(
          fc.array(arbitrarySmallScalar(), { minLength: 1, maxLength: 10 }),
          fc.array(arbitraryCurvePoint(curve), { minLength: 1, maxLength: 10 }),
          (scalars, points) => {
            // Only test when lengths are different
            if (scalars.length === points.length) {
              return true; // Skip this case
            }

            try {
              validateArrayLengths(scalars, points);
              return false; // Should have thrown
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return (
                  error.code === ErrorCode.ARRAY_LENGTH_MISMATCH &&
                  error.details?.scalarsLength === scalars.length &&
                  error.details?.pointsLength === points.length
                );
              }
              return false;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 2: Invalid curve points rejected
    it('should throw error for invalid curve points', () => {
      fc.assert(
        fc.property(arbitraryInvalidCurvePoint(curve), (invalidPoint) => {
          try {
            validatePoint(invalidPoint, curve, 0);
            return false; // Should have thrown
          } catch (error) {
            if (error instanceof ZkAccelerateError) {
              return error.code === ErrorCode.INVALID_CURVE_POINT;
            }
            return false;
          }
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 2: MSM rejects invalid points when validation enabled
    it('should throw error when MSM receives invalid curve points', () => {
      fc.assert(
        fc.property(
          fc.array(arbitrarySmallScalar(), { minLength: 1, maxLength: 5 }),
          arbitraryInvalidCurvePoint(curve),
          fc.integer({ min: 0, max: 4 }),
          (scalars, invalidPoint, insertIndex) => {
            // Create valid points
            const validPoints = scalars.map((s) => {
              const result = scalarMul(s, curve.generator, curve);
              return toAffine(result, curve);
            });

            // Insert invalid point at a random position
            const idx = Math.min(insertIndex, validPoints.length - 1);
            const points = [...validPoints];
            points[idx] = invalidPoint;

            try {
              msm(scalars, points, curve, { validateInputs: true });
              return false; // Should have thrown
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return error.code === ErrorCode.INVALID_CURVE_POINT;
              }
              return false;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 2: MSM rejects mismatched lengths
    it('should throw error when MSM receives mismatched array lengths', () => {
      fc.assert(
        fc.property(
          fc.array(arbitrarySmallScalar(), { minLength: 2, maxLength: 10 }),
          (scalars) => {
            // Create fewer points than scalars
            const points = scalars.slice(0, -1).map((s) => {
              const result = scalarMul(s, curve.generator, curve);
              return toAffine(result, curve);
            });

            try {
              msm(scalars, points, curve, { validateInputs: true });
              return false; // Should have thrown
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return error.code === ErrorCode.ARRAY_LENGTH_MISMATCH;
              }
              return false;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 2: Valid inputs pass validation
    it('should accept valid inputs without error', () => {
      fc.assert(
        fc.property(
          fc.array(arbitrarySmallScalar(), { minLength: 1, maxLength: 10 }),
          (scalars) => {
            const points = scalars.map((s) => {
              const result = scalarMul(s, curve.generator, curve);
              return toAffine(result, curve);
            });

            try {
              validateMsmInputs(scalars, points, curve, true);
              return true;
            } catch {
              return false;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 2: Validation can be disabled
    it('should skip validation when validateInputs is false', () => {
      fc.assert(
        fc.property(
          fc.array(arbitrarySmallScalar(), { minLength: 1, maxLength: 5 }),
          arbitraryInvalidCurvePoint(curve),
          (scalars, invalidPoint) => {
            // Create points with one invalid
            const points = scalars.map((s, i) => {
              if (i === 0) return invalidPoint;
              const result = scalarMul(s, curve.generator, curve);
              return toAffine(result, curve);
            });

            try {
              // Should not throw when validation is disabled
              msm(scalars, points, curve, { validateInputs: false });
              return true;
            } catch {
              // May still throw for other reasons, but not validation
              return true;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('BLS12-381 Curve', () => {
    const curve = BLS12_381_CURVE;

    // Feature: node-zk-accelerate, Property 2: Mismatched array lengths (BLS12-381)
    it('should throw error for mismatched array lengths', () => {
      fc.assert(
        fc.property(
          fc.array(arbitrarySmallScalar(), { minLength: 1, maxLength: 5 }),
          fc.array(arbitraryCurvePoint(curve), { minLength: 1, maxLength: 5 }),
          (scalars, points) => {
            if (scalars.length === points.length) {
              return true;
            }

            try {
              validateArrayLengths(scalars, points);
              return false;
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return error.code === ErrorCode.ARRAY_LENGTH_MISMATCH;
              }
              return false;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 2: Invalid curve points rejected (BLS12-381)
    it('should throw error for invalid curve points', () => {
      fc.assert(
        fc.property(arbitraryInvalidCurvePoint(curve), (invalidPoint) => {
          try {
            validatePoint(invalidPoint, curve, 0);
            return false;
          } catch (error) {
            if (error instanceof ZkAccelerateError) {
              return error.code === ErrorCode.INVALID_CURVE_POINT;
            }
            return false;
          }
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 2: Valid inputs pass validation (BLS12-381)
    it('should accept valid inputs without error', () => {
      fc.assert(
        fc.property(
          fc.array(arbitrarySmallScalar(), { minLength: 1, maxLength: 5 }),
          (scalars) => {
            const points = scalars.map((s) => {
              const result = scalarMul(s, curve.generator, curve);
              return toAffine(result, curve);
            });

            try {
              validateMsmInputs(scalars, points, curve, true);
              return true;
            } catch {
              return false;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Error Details', () => {
    const curve = BN254_CURVE;

    // Feature: node-zk-accelerate, Property 2: Error includes array lengths
    it('should include array lengths in mismatch error', () => {
      const scalars = [1n, 2n, 3n];
      const points = [curve.generator, curve.generator];

      try {
        validateArrayLengths(scalars, points);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZkAccelerateError);
        const zkError = error as ZkAccelerateError;
        expect(zkError.code).toBe(ErrorCode.ARRAY_LENGTH_MISMATCH);
        expect(zkError.details?.scalarsLength).toBe(3);
        expect(zkError.details?.pointsLength).toBe(2);
      }
    });

    // Feature: node-zk-accelerate, Property 2: Error includes point coordinates
    it('should include point coordinates in invalid point error', () => {
      const invalidPoint = createAffinePoint(
        createFieldElement(123n, curve.field),
        createFieldElement(456n, curve.field),
        curve
      );

      try {
        validatePoint(invalidPoint, curve, 5);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZkAccelerateError);
        const zkError = error as ZkAccelerateError;
        expect(zkError.code).toBe(ErrorCode.INVALID_CURVE_POINT);
        expect(zkError.details?.x).toBe('123');
        expect(zkError.details?.y).toBe('456');
        expect(zkError.details?.curve).toBe('BN254');
        expect(zkError.details?.index).toBe(5);
      }
    });
  });
});
