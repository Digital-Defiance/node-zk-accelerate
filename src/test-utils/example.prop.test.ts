/**
 * Example Property-Based Tests for node-zk-accelerate
 *
 * This file demonstrates how to write property-based tests using fast-check
 * and the test utilities provided by this library.
 *
 * These examples validate the testing infrastructure and serve as templates
 * for future property tests.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  BN254_BASE_MODULUS,
  BLS12_381_BASE_MODULUS,
  arbitraryCurveName,
  arbitraryFieldValue,
  arbitraryNonZeroFieldValue,
  arbitraryPowerOfTwo,
  arbitraryEndianness,
  getBaseModulus,
  isPowerOfTwo,
  modAdd,
  modSub,
  modMul,
  modNeg,
  modInverse,
  modPow,
} from './property-test-config.js';
import {
  createFieldElement,
  createZeroElement,
  createOneElement,
  fieldElementsEqual,
  addFieldElements,
  subFieldElements,
  mulFieldElements,
  negFieldElement,
  invFieldElement,
  isZeroElement,
  isOneElement,
} from './field-comparison.js';

describe('Property-Based Testing Infrastructure', () => {
  describe('Arbitrary Generators', () => {
    it('should generate valid curve names', () => {
      fc.assert(
        fc.property(arbitraryCurveName(), (curve) => {
          expect(['BN254', 'BLS12_381']).toContain(curve);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    it('should generate field values within modulus', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(fc.constant(modulus), arbitraryFieldValue(modulus));
          }),
          ([modulus, value]) => {
            expect(value).toBeGreaterThanOrEqual(0n);
            expect(value).toBeLessThan(modulus);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    it('should generate non-zero field values', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(fc.constant(modulus), arbitraryNonZeroFieldValue(modulus));
          }),
          ([modulus, value]) => {
            expect(value).toBeGreaterThan(0n);
            expect(value).toBeLessThan(modulus);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    it('should generate valid power-of-two sizes', () => {
      fc.assert(
        fc.property(arbitraryPowerOfTwo(2, 12), (size) => {
          expect(isPowerOfTwo(size)).toBe(true);
          expect(size).toBeGreaterThanOrEqual(4);
          expect(size).toBeLessThanOrEqual(4096);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    it('should generate valid endianness values', () => {
      fc.assert(
        fc.property(arbitraryEndianness(), (endian) => {
          expect(['be', 'le']).toContain(endian);
        }),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Modular Arithmetic Helpers', () => {
    // Feature: node-zk-accelerate, Example Property: Modular Addition Commutativity
    it('should satisfy a + b = b + a (mod p)', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(
              fc.constant(modulus),
              arbitraryFieldValue(modulus),
              arbitraryFieldValue(modulus)
            );
          }),
          ([modulus, a, b]) => {
            const ab = modAdd(a, b, modulus);
            const ba = modAdd(b, a, modulus);
            expect(ab).toBe(ba);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Modular Multiplication Commutativity
    it('should satisfy a * b = b * a (mod p)', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(
              fc.constant(modulus),
              arbitraryFieldValue(modulus),
              arbitraryFieldValue(modulus)
            );
          }),
          ([modulus, a, b]) => {
            const ab = modMul(a, b, modulus);
            const ba = modMul(b, a, modulus);
            expect(ab).toBe(ba);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Modular Additive Identity
    it('should satisfy a + 0 = a (mod p)', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(fc.constant(modulus), arbitraryFieldValue(modulus));
          }),
          ([modulus, a]) => {
            const result = modAdd(a, 0n, modulus);
            expect(result).toBe(a);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Modular Multiplicative Identity
    it('should satisfy a * 1 = a (mod p)', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(fc.constant(modulus), arbitraryFieldValue(modulus));
          }),
          ([modulus, a]) => {
            const result = modMul(a, 1n, modulus);
            expect(result).toBe(a);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Modular Additive Inverse
    it('should satisfy a + (-a) = 0 (mod p)', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(fc.constant(modulus), arbitraryFieldValue(modulus));
          }),
          ([modulus, a]) => {
            const negA = modNeg(a, modulus);
            const result = modAdd(a, negA, modulus);
            expect(result).toBe(0n);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Modular Multiplicative Inverse
    it('should satisfy a * a^(-1) = 1 (mod p) for non-zero a', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(fc.constant(modulus), arbitraryNonZeroFieldValue(modulus));
          }),
          ([modulus, a]) => {
            const invA = modInverse(a, modulus);
            const result = modMul(a, invA, modulus);
            expect(result).toBe(1n);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Modular Subtraction Definition
    it('should satisfy a - b = a + (-b) (mod p)', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(
              fc.constant(modulus),
              arbitraryFieldValue(modulus),
              arbitraryFieldValue(modulus)
            );
          }),
          ([modulus, a, b]) => {
            const sub = modSub(a, b, modulus);
            const addNeg = modAdd(a, modNeg(b, modulus), modulus);
            expect(sub).toBe(addNeg);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Fermat's Little Theorem
    it('should satisfy a^(p-1) = 1 (mod p) for non-zero a (Fermat)', () => {
      // Use smaller modulus for performance
      const smallPrime = 65537n; // 2^16 + 1, a Fermat prime
      fc.assert(
        fc.property(
          fc.bigInt({ min: 1n, max: smallPrime - 1n }),
          (a) => {
            const result = modPow(a, smallPrime - 1n, smallPrime);
            expect(result).toBe(1n);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Field Element Utilities', () => {
    // Feature: node-zk-accelerate, Example Property: Field Element Creation
    it('should create field elements with values reduced mod p', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            // Generate values that might exceed modulus
            return fc.tuple(fc.constant(modulus), fc.bigInt({ min: 0n, max: modulus * 2n }));
          }),
          ([modulus, value]) => {
            const elem = createFieldElement(value, modulus);
            expect(elem.value).toBeGreaterThanOrEqual(0n);
            expect(elem.value).toBeLessThan(modulus);
            expect(elem.value).toBe(value % modulus);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Field Element Addition
    it('should add field elements correctly', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(
              fc.constant(modulus),
              arbitraryFieldValue(modulus),
              arbitraryFieldValue(modulus)
            );
          }),
          ([modulus, a, b]) => {
            const elemA = createFieldElement(a, modulus);
            const elemB = createFieldElement(b, modulus);
            const sum = addFieldElements(elemA, elemB);
            expect(sum.value).toBe(modAdd(a, b, modulus));
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Field Element Multiplication
    it('should multiply field elements correctly', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(
              fc.constant(modulus),
              arbitraryFieldValue(modulus),
              arbitraryFieldValue(modulus)
            );
          }),
          ([modulus, a, b]) => {
            const elemA = createFieldElement(a, modulus);
            const elemB = createFieldElement(b, modulus);
            const product = mulFieldElements(elemA, elemB);
            expect(product.value).toBe(modMul(a, b, modulus));
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Field Element Inverse
    it('should compute field element inverse correctly', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.tuple(fc.constant(modulus), arbitraryNonZeroFieldValue(modulus));
          }),
          ([modulus, a]) => {
            const elemA = createFieldElement(a, modulus);
            const invA = invFieldElement(elemA);
            const product = mulFieldElements(elemA, invA);
            expect(isOneElement(product)).toBe(true);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Example Property: Zero and One Elements
    it('should correctly identify zero and one elements', () => {
      fc.assert(
        fc.property(
          arbitraryCurveName().chain((curve) => {
            const modulus = getBaseModulus(curve);
            return fc.constant(modulus);
          }),
          (modulus) => {
            const zero = createZeroElement(modulus);
            const one = createOneElement(modulus);

            expect(isZeroElement(zero)).toBe(true);
            expect(isOneElement(zero)).toBe(false);
            expect(isZeroElement(one)).toBe(false);
            expect(isOneElement(one)).toBe(true);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
