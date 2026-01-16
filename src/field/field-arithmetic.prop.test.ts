/**
 * Property-Based Tests for Field Arithmetic
 *
 * **Property 5: Field Arithmetic Algebraic Properties**
 * - Test commutativity: mul(a, b) = mul(b, a)
 * - Test associativity: mul(mul(a, b), c) = mul(a, mul(b, c))
 * - Test inverse: mul(a, inv(a)) = 1 for non-zero a
 *
 * **Validates: Requirements 4.9, 4.10**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitraryFieldValue,
  arbitraryNonZeroFieldValue,
} from '../test-utils/property-test-config.js';
import {
  BN254_FIELD,
  BLS12_381_FIELD,
} from './config.js';
import {
  createFieldElement,
  getFieldElementValue,
  fieldElementsEqual,
  isOneFieldElement,
  isZeroFieldElement,
} from './element.js';
import {
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldNeg,
  fieldInv,
  fieldSquare,
  fieldPow,
} from './operations.js';
import type { FieldConfig } from '../types.js';

/**
 * Arbitrary generator for field elements
 */
function arbitraryFieldElement(field: FieldConfig) {
  return arbitraryFieldValue(field.modulus).map((value) => createFieldElement(value, field));
}

/**
 * Arbitrary generator for non-zero field elements
 */
function arbitraryNonZeroFieldElement(field: FieldConfig) {
  return arbitraryNonZeroFieldValue(field.modulus).map((value) => createFieldElement(value, field));
}

describe('Property 5: Field Arithmetic Algebraic Properties', () => {
  describe('BN254 Field', () => {
    const field = BN254_FIELD;

    // Feature: node-zk-accelerate, Property 5: Multiplication Commutativity
    it('should satisfy mul(a, b) = mul(b, a) (commutativity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b) => {
            const ab = fieldMul(a, b);
            const ba = fieldMul(b, a);
            return fieldElementsEqual(ab, ba);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Multiplication Associativity
    it('should satisfy mul(mul(a, b), c) = mul(a, mul(b, c)) (associativity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b, c) => {
            const ab_c = fieldMul(fieldMul(a, b), c);
            const a_bc = fieldMul(a, fieldMul(b, c));
            return fieldElementsEqual(ab_c, a_bc);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Multiplicative Inverse
    it('should satisfy mul(a, inv(a)) = 1 for non-zero a (inverse property)', () => {
      fc.assert(
        fc.property(
          arbitraryNonZeroFieldElement(field),
          (a) => {
            const invA = fieldInv(a);
            const product = fieldMul(a, invA);
            return isOneFieldElement(product);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Multiplicative Identity
    it('should satisfy mul(a, 1) = a (identity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (a) => {
            const one = createFieldElement(1n, field);
            const result = fieldMul(a, one);
            return fieldElementsEqual(result, a);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Addition Commutativity
    it('should satisfy add(a, b) = add(b, a) (addition commutativity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b) => {
            const ab = fieldAdd(a, b);
            const ba = fieldAdd(b, a);
            return fieldElementsEqual(ab, ba);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Addition Associativity
    it('should satisfy add(add(a, b), c) = add(a, add(b, c)) (addition associativity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b, c) => {
            const ab_c = fieldAdd(fieldAdd(a, b), c);
            const a_bc = fieldAdd(a, fieldAdd(b, c));
            return fieldElementsEqual(ab_c, a_bc);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Additive Identity
    it('should satisfy add(a, 0) = a (additive identity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (a) => {
            const zero = createFieldElement(0n, field);
            const result = fieldAdd(a, zero);
            return fieldElementsEqual(result, a);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Additive Inverse
    it('should satisfy add(a, neg(a)) = 0 (additive inverse)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (a) => {
            const negA = fieldNeg(a);
            const result = fieldAdd(a, negA);
            return isZeroFieldElement(result);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Subtraction Definition
    it('should satisfy sub(a, b) = add(a, neg(b)) (subtraction definition)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b) => {
            const sub = fieldSub(a, b);
            const addNeg = fieldAdd(a, fieldNeg(b));
            return fieldElementsEqual(sub, addNeg);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Distributivity
    it('should satisfy mul(a, add(b, c)) = add(mul(a, b), mul(a, c)) (distributivity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b, c) => {
            const lhs = fieldMul(a, fieldAdd(b, c));
            const rhs = fieldAdd(fieldMul(a, b), fieldMul(a, c));
            return fieldElementsEqual(lhs, rhs);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Squaring Consistency
    it('should satisfy square(a) = mul(a, a) (squaring consistency)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (a) => {
            const sq = fieldSquare(a);
            const mulSelf = fieldMul(a, a);
            return fieldElementsEqual(sq, mulSelf);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Exponentiation
    it('should satisfy pow(a, 2) = square(a) (exponentiation)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (a) => {
            const pow2 = fieldPow(a, 2n);
            const sq = fieldSquare(a);
            return fieldElementsEqual(pow2, sq);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Double Negation
    it('should satisfy neg(neg(a)) = a (double negation)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (a) => {
            const doubleNeg = fieldNeg(fieldNeg(a));
            return fieldElementsEqual(doubleNeg, a);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Double Inverse
    it('should satisfy inv(inv(a)) = a for non-zero a (double inverse)', () => {
      fc.assert(
        fc.property(
          arbitraryNonZeroFieldElement(field),
          (a) => {
            const doubleInv = fieldInv(fieldInv(a));
            return fieldElementsEqual(doubleInv, a);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('BLS12-381 Field', () => {
    const field = BLS12_381_FIELD;

    // Feature: node-zk-accelerate, Property 5: Multiplication Commutativity (BLS12-381)
    it('should satisfy mul(a, b) = mul(b, a) (commutativity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b) => {
            const ab = fieldMul(a, b);
            const ba = fieldMul(b, a);
            return fieldElementsEqual(ab, ba);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Multiplication Associativity (BLS12-381)
    it('should satisfy mul(mul(a, b), c) = mul(a, mul(b, c)) (associativity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b, c) => {
            const ab_c = fieldMul(fieldMul(a, b), c);
            const a_bc = fieldMul(a, fieldMul(b, c));
            return fieldElementsEqual(ab_c, a_bc);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Multiplicative Inverse (BLS12-381)
    it('should satisfy mul(a, inv(a)) = 1 for non-zero a (inverse property)', () => {
      fc.assert(
        fc.property(
          arbitraryNonZeroFieldElement(field),
          (a) => {
            const invA = fieldInv(a);
            const product = fieldMul(a, invA);
            return isOneFieldElement(product);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Additive Inverse (BLS12-381)
    it('should satisfy add(a, neg(a)) = 0 (additive inverse)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (a) => {
            const negA = fieldNeg(a);
            const result = fieldAdd(a, negA);
            return isZeroFieldElement(result);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 5: Distributivity (BLS12-381)
    it('should satisfy mul(a, add(b, c)) = add(mul(a, b), mul(a, c)) (distributivity)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          arbitraryFieldElement(field),
          (a, b, c) => {
            const lhs = fieldMul(a, fieldAdd(b, c));
            const rhs = fieldAdd(fieldMul(a, b), fieldMul(a, c));
            return fieldElementsEqual(lhs, rhs);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
