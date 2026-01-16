/**
 * Property-Based Tests for Input Validation
 *
 * **Property 14: Input Validation Correctness**
 * - Test invalid curve points are rejected
 * - Test out-of-range field elements are rejected
 * - Test mismatched array lengths are rejected
 *
 * **Validates: Requirements 15.2, 15.3, 15.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitrarySmallScalar,
  arbitraryFieldValue,
} from './test-utils/property-test-config.js';
import { BN254_CURVE, BLS12_381_CURVE } from './curve/config.js';
import { BN254_FIELD, BLS12_381_FIELD } from './field/config.js';
import { createAffinePoint, toAffine } from './curve/point.js';
import { scalarMul, isOnCurve } from './curve/operations.js';
import { createFieldElement, getFieldElementValue } from './field/element.js';
import { ZkAccelerateError, ErrorCode } from './errors.js';
import {
  validateFieldValue,
  validateFieldElement,
  validateCurvePoint,
  validateScalar,
  validateArrayLengthsMatch,
  validateFieldElementArray,
  validateCurvePointArray,
  validateScalarArray,
  validateNonZeroFieldElement,
  resetValidationConfig,
  setValidationConfig,
  withoutValidation,
} from './validation.js';
import type { CurveConfig, AffinePoint, FieldConfig } from './types.js';

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

/**
 * Generate a field value that exceeds the modulus
 */
function arbitraryOutOfRangeFieldValue(field: FieldConfig): fc.Arbitrary<bigint> {
  return fc.bigInt({ min: field.modulus, max: field.modulus * 2n });
}

/**
 * Generate a scalar that exceeds the curve order
 */
function arbitraryOutOfRangeScalar(curve: CurveConfig): fc.Arbitrary<bigint> {
  return fc.bigInt({ min: curve.order, max: curve.order * 2n });
}

describe('Property 14: Input Validation Correctness', () => {
  beforeEach(() => {
    resetValidationConfig();
  });

  afterEach(() => {
    resetValidationConfig();
  });

  describe('Field Element Validation', () => {
    describe('BN254 Field', () => {
      const field = BN254_FIELD;

      // Feature: node-zk-accelerate, Property 14: Out-of-range field elements rejected
      it('should reject field values that exceed the modulus', () => {
        fc.assert(
          fc.property(arbitraryOutOfRangeFieldValue(field), (value) => {
            try {
              validateFieldValue(value, field);
              return false; // Should have thrown
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return error.code === ErrorCode.INVALID_FIELD_ELEMENT;
              }
              return false;
            }
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 14: Valid field values accepted
      it('should accept valid field values', () => {
        fc.assert(
          fc.property(arbitraryFieldValue(field.modulus), (value) => {
            try {
              validateFieldValue(value, field);
              return true;
            } catch {
              return false;
            }
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 14: Negative field values rejected
      it('should reject negative field values', () => {
        fc.assert(
          fc.property(
            fc.bigInt({ min: -1000000n, max: -1n }),
            (value) => {
              try {
                validateFieldValue(value, field);
                return false; // Should have thrown
              } catch (error) {
                if (error instanceof ZkAccelerateError) {
                  return error.code === ErrorCode.INVALID_FIELD_ELEMENT;
                }
                return false;
              }
            }
          ),
          PROPERTY_TEST_CONFIG
        );
      });
    });

    describe('BLS12-381 Field', () => {
      const field = BLS12_381_FIELD;

      // Feature: node-zk-accelerate, Property 14: Out-of-range field elements rejected (BLS12-381)
      it('should reject field values that exceed the modulus', () => {
        fc.assert(
          fc.property(arbitraryOutOfRangeFieldValue(field), (value) => {
            try {
              validateFieldValue(value, field);
              return false;
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return error.code === ErrorCode.INVALID_FIELD_ELEMENT;
              }
              return false;
            }
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 14: Valid field values accepted (BLS12-381)
      it('should accept valid field values', () => {
        fc.assert(
          fc.property(arbitraryFieldValue(field.modulus), (value) => {
            try {
              validateFieldValue(value, field);
              return true;
            } catch {
              return false;
            }
          }),
          PROPERTY_TEST_CONFIG
        );
      });
    });
  });

  describe('Curve Point Validation', () => {
    describe('BN254 Curve', () => {
      const curve = BN254_CURVE;

      // Feature: node-zk-accelerate, Property 14: Invalid curve points rejected
      it('should reject points not on the curve', () => {
        fc.assert(
          fc.property(arbitraryInvalidCurvePoint(curve), (invalidPoint) => {
            try {
              validateCurvePoint(invalidPoint, curve);
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

      // Feature: node-zk-accelerate, Property 14: Valid curve points accepted
      it('should accept valid curve points', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (validPoint) => {
            try {
              validateCurvePoint(validPoint, curve);
              return true;
            } catch {
              return false;
            }
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 14: Error includes point coordinates
      it('should include point coordinates in error details', () => {
        fc.assert(
          fc.property(arbitraryInvalidCurvePoint(curve), (invalidPoint) => {
            try {
              validateCurvePoint(invalidPoint, curve, 5);
              return false;
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return (
                  error.code === ErrorCode.INVALID_CURVE_POINT &&
                  error.details?.x !== undefined &&
                  error.details?.y !== undefined &&
                  error.details?.curve === 'BN254' &&
                  error.details?.index === 5
                );
              }
              return false;
            }
          }),
          PROPERTY_TEST_CONFIG
        );
      });
    });

    describe('BLS12-381 Curve', () => {
      const curve = BLS12_381_CURVE;

      // Feature: node-zk-accelerate, Property 14: Invalid curve points rejected (BLS12-381)
      it('should reject points not on the curve', () => {
        fc.assert(
          fc.property(arbitraryInvalidCurvePoint(curve), (invalidPoint) => {
            try {
              validateCurvePoint(invalidPoint, curve);
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

      // Feature: node-zk-accelerate, Property 14: Valid curve points accepted (BLS12-381)
      it('should accept valid curve points', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (validPoint) => {
            try {
              validateCurvePoint(validPoint, curve);
              return true;
            } catch {
              return false;
            }
          }),
          PROPERTY_TEST_CONFIG
        );
      });
    });
  });

  describe('Scalar Validation', () => {
    describe('BN254 Curve', () => {
      const curve = BN254_CURVE;

      // Feature: node-zk-accelerate, Property 14: Out-of-range scalars rejected
      it('should reject scalars that exceed the curve order', () => {
        fc.assert(
          fc.property(arbitraryOutOfRangeScalar(curve), (scalar) => {
            try {
              validateScalar(scalar, curve.order);
              return false; // Should have thrown
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return error.code === ErrorCode.INVALID_SCALAR;
              }
              return false;
            }
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 14: Valid scalars accepted
      it('should accept valid scalars', () => {
        fc.assert(
          fc.property(
            fc.bigInt({ min: 0n, max: curve.order - 1n }),
            (scalar) => {
              try {
                validateScalar(scalar, curve.order);
                return true;
              } catch {
                return false;
              }
            }
          ),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 14: Negative scalars rejected
      it('should reject negative scalars', () => {
        fc.assert(
          fc.property(
            fc.bigInt({ min: -1000000n, max: -1n }),
            (scalar) => {
              try {
                validateScalar(scalar, curve.order);
                return false;
              } catch (error) {
                if (error instanceof ZkAccelerateError) {
                  return error.code === ErrorCode.INVALID_SCALAR;
                }
                return false;
              }
            }
          ),
          PROPERTY_TEST_CONFIG
        );
      });
    });
  });

  describe('Array Length Validation', () => {
    // Feature: node-zk-accelerate, Property 14: Mismatched array lengths rejected
    it('should reject arrays with different lengths', () => {
      fc.assert(
        fc.property(
          fc.array(fc.bigInt({ min: 1n, max: 1000n }), { minLength: 1, maxLength: 10 }),
          fc.array(fc.bigInt({ min: 1n, max: 1000n }), { minLength: 1, maxLength: 10 }),
          (arr1, arr2) => {
            if (arr1.length === arr2.length) {
              return true; // Skip when lengths match
            }

            try {
              validateArrayLengthsMatch(arr1, arr2);
              return false; // Should have thrown
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return (
                  error.code === ErrorCode.ARRAY_LENGTH_MISMATCH &&
                  error.details?.scalarsLength === arr1.length &&
                  error.details?.pointsLength === arr2.length
                );
              }
              return false;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 14: Matching array lengths accepted
    it('should accept arrays with matching lengths', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (length) => {
            const arr1 = new Array(length).fill(1n);
            const arr2 = new Array(length).fill(2n);

            try {
              validateArrayLengthsMatch(arr1, arr2);
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

  describe('Validation Configuration', () => {
    const curve = BN254_CURVE;

    // Feature: node-zk-accelerate, Property 14: Validation can be disabled
    it('should skip validation when disabled', () => {
      fc.assert(
        fc.property(arbitraryInvalidCurvePoint(curve), (invalidPoint) => {
          setValidationConfig({ enabled: false });

          try {
            // Should not throw when validation is disabled
            validateCurvePoint(invalidPoint, curve);
            return true;
          } catch {
            return false;
          }
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 14: withoutValidation helper works
    it('should skip validation within withoutValidation block', () => {
      fc.assert(
        fc.property(arbitraryInvalidCurvePoint(curve), (invalidPoint) => {
          try {
            const result = withoutValidation(() => {
              validateCurvePoint(invalidPoint, curve);
              return 'success';
            });
            return result === 'success';
          } catch {
            return false;
          }
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 14: Selective validation disabling
    it('should allow selective validation disabling', () => {
      fc.assert(
        fc.property(
          arbitraryInvalidCurvePoint(curve),
          arbitraryOutOfRangeFieldValue(curve.field),
          (invalidPoint, outOfRangeValue) => {
            // Disable only curve point validation
            setValidationConfig({ validateCurvePoints: false });

            try {
              // Curve point validation should pass (disabled)
              validateCurvePoint(invalidPoint, curve);

              // Field validation should still fail (enabled)
              validateFieldValue(outOfRangeValue, curve.field);
              return false; // Should have thrown
            } catch (error) {
              if (error instanceof ZkAccelerateError) {
                return error.code === ErrorCode.INVALID_FIELD_ELEMENT;
              }
              return false;
            }
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Zero Element Validation', () => {
    const field = BN254_FIELD;

    // Feature: node-zk-accelerate, Property 14: Zero elements rejected for inversion
    it('should reject zero elements for inversion', () => {
      const zeroElement = createFieldElement(0n, field);

      try {
        validateNonZeroFieldElement(zeroElement);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZkAccelerateError);
        expect((error as ZkAccelerateError).code).toBe(ErrorCode.DIVISION_BY_ZERO);
      }
    });

    // Feature: node-zk-accelerate, Property 14: Non-zero elements accepted for inversion
    it('should accept non-zero elements for inversion', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 1n, max: field.modulus - 1n }),
          (value) => {
            const element = createFieldElement(value, field);
            try {
              validateNonZeroFieldElement(element);
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
    const field = BN254_FIELD;

    // Feature: node-zk-accelerate, Property 14: Field element error includes value and modulus
    it('should include value and modulus in field element error', () => {
      const outOfRangeValue = field.modulus + 100n;

      try {
        validateFieldValue(outOfRangeValue, field);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZkAccelerateError);
        const zkError = error as ZkAccelerateError;
        expect(zkError.code).toBe(ErrorCode.INVALID_FIELD_ELEMENT);
        expect(zkError.details?.value).toBe(outOfRangeValue.toString());
        expect(zkError.details?.modulus).toBe(field.modulus.toString());
      }
    });

    // Feature: node-zk-accelerate, Property 14: Scalar error includes value and curve order
    it('should include value and curve order in scalar error', () => {
      const outOfRangeScalar = curve.order + 100n;

      try {
        validateScalar(outOfRangeScalar, curve.order, 3);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZkAccelerateError);
        const zkError = error as ZkAccelerateError;
        expect(zkError.code).toBe(ErrorCode.INVALID_SCALAR);
        expect(zkError.details?.value).toBe(outOfRangeScalar.toString());
        expect(zkError.details?.curveOrder).toBe(curve.order.toString());
        expect(zkError.details?.index).toBe(3);
      }
    });

    // Feature: node-zk-accelerate, Property 14: Array length error includes both lengths
    it('should include both lengths in array mismatch error', () => {
      const arr1 = [1n, 2n, 3n];
      const arr2 = [1n, 2n];

      try {
        validateArrayLengthsMatch(arr1, arr2);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZkAccelerateError);
        const zkError = error as ZkAccelerateError;
        expect(zkError.code).toBe(ErrorCode.ARRAY_LENGTH_MISMATCH);
        expect(zkError.details?.scalarsLength).toBe(3);
        expect(zkError.details?.pointsLength).toBe(2);
      }
    });
  });
});
