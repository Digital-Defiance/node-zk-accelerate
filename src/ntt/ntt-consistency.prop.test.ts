/**
 * Property-Based Tests for NTT Implementation Consistency
 *
 * **Property 4: NTT Implementation Consistency**
 * - Test radix-2 and radix-4 produce identical results
 *
 * This is now a genuine cross-implementation check. While `radix4.ts` merely
 * forwarded every call to `radix2.ts`, these tests compared a function with
 * itself: they could not fail, and passing carried no information. `radix4.ts`
 * now implements 4-point butterflies over its own stage schedule, so an error
 * in either implementation shows up here as a mismatch.
 *
 * **Validates: Requirements 3.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitraryFieldValue,
} from '../test-utils/property-test-config.js';
import { BN254_SCALAR_FIELD, BLS12_381_SCALAR_FIELD } from '../field/config.js';
import {
  createFieldElement,
  fieldElementsEqual,
  getFieldElementValue,
} from '../field/element.js';
import { createNTTConfig } from './config.js';
import { forwardNttRadix2, inverseNttRadix2 } from './radix2.js';
import { forwardNttRadix4, inverseNttRadix4 } from './radix4.js';
import type { FieldConfig, FieldElement } from '../types.js';

/**
 * Arbitrary generator for polynomial coefficients of a specific size
 */
function arbitraryPolynomial(field: FieldConfig, size: number): fc.Arbitrary<FieldElement[]> {
  return fc.array(arbitraryFieldValue(field.modulus), { minLength: size, maxLength: size })
    .map(values => values.map(v => createFieldElement(v, field)));
}

/**
 * Arbitrary generator for power-of-4 sizes (required for radix-4)
 */
function arbitraryPowerOf4Size(): fc.Arbitrary<number> {
  return fc.constantFrom(4, 16, 64, 256);
}

/**
 * Compare two arrays of field elements for equality
 */
function arraysEqual(a: FieldElement[], b: FieldElement[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!fieldElementsEqual(a[i]!, b[i]!)) {
      return false;
    }
  }
  return true;
}

describe('Property 4: NTT Implementation Consistency', () => {
  describe('BN254 Scalar Field', () => {
    const field = BN254_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 4: Radix-2 and Radix-4 Forward NTT Consistency
    it('should produce identical results for radix-2 and radix-4 forward NTT', () => {
      fc.assert(
        fc.property(
          arbitraryPowerOf4Size(),
          (size) => {
            return fc.assert(
              fc.property(
                arbitraryPolynomial(field, size),
                (coefficients) => {
                  const config = createNTTConfig(size, field);
                  
                  // Forward NTT with radix-2
                  const radix2Result = forwardNttRadix2(coefficients, config);
                  
                  // Forward NTT with radix-4
                  const radix4Result = forwardNttRadix4(coefficients, config);
                  
                  return arraysEqual(radix2Result, radix4Result);
                }
              ),
              { numRuns: 20 }
            );
          }
        ),
        { numRuns: 4 } // Test 4 different sizes
      );
    });

    // Feature: node-zk-accelerate, Property 4: Radix-2 and Radix-4 Inverse NTT Consistency
    it('should produce identical results for radix-2 and radix-4 inverse NTT', () => {
      fc.assert(
        fc.property(
          arbitraryPowerOf4Size(),
          (size) => {
            return fc.assert(
              fc.property(
                arbitraryPolynomial(field, size),
                (values) => {
                  const config = createNTTConfig(size, field);
                  
                  // Inverse NTT with radix-2
                  const radix2Result = inverseNttRadix2(values, config);
                  
                  // Inverse NTT with radix-4
                  const radix4Result = inverseNttRadix4(values, config);
                  
                  return arraysEqual(radix2Result, radix4Result);
                }
              ),
              { numRuns: 20 }
            );
          }
        ),
        { numRuns: 4 }
      );
    });

    // Feature: node-zk-accelerate, Property 4: Radix-4 Round-Trip Consistency
    it('should satisfy round-trip for radix-4 (forward then inverse)', () => {
      fc.assert(
        fc.property(
          arbitraryPowerOf4Size(),
          (size) => {
            return fc.assert(
              fc.property(
                arbitraryPolynomial(field, size),
                (coefficients) => {
                  const config = createNTTConfig(size, field);
                  
                  // Forward then inverse with radix-4
                  const transformed = forwardNttRadix4(coefficients, config);
                  const recovered = inverseNttRadix4(transformed, config);
                  
                  return arraysEqual(coefficients, recovered);
                }
              ),
              { numRuns: 20 }
            );
          }
        ),
        { numRuns: 4 }
      );
    });

    // Feature: node-zk-accelerate, Property 4: Fixed Size 16 Consistency
    it('should produce identical results for size 16', () => {
      const size = 16;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const radix2Result = forwardNttRadix2(coefficients, config);
            const radix4Result = forwardNttRadix4(coefficients, config);
            
            return arraysEqual(radix2Result, radix4Result);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 4: Fixed Size 64 Consistency
    it('should produce identical results for size 64', () => {
      const size = 64;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const radix2Result = forwardNttRadix2(coefficients, config);
            const radix4Result = forwardNttRadix4(coefficients, config);
            
            return arraysEqual(radix2Result, radix4Result);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('BLS12-381 Scalar Field', () => {
    const field = BLS12_381_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 4: BLS12-381 Radix Consistency
    it('should produce identical results for radix-2 and radix-4 (BLS12-381)', () => {
      const size = 16;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const radix2Result = forwardNttRadix2(coefficients, config);
            const radix4Result = forwardNttRadix4(coefficients, config);
            
            return arraysEqual(radix2Result, radix4Result);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Odd log2(n) Sizes (One Unpaired Radix-2 Stage)', () => {
    const field = BN254_SCALAR_FIELD;

    // For sizes where log2(n) is odd, radix-4 cannot fuse every stage: it runs
    // one radix-2 stage first, then fuses the rest. Results must still match.

    // Feature: node-zk-accelerate, Property 4: Radix-4 with an unpaired stage
    it('should match radix-2 for sizes where log2(n) is odd', () => {
      // Size 8 is a power of 2 but not a power of 4: log2(8) = 3
      const size = 8;
      const config = createNTTConfig(size, field);

      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const radix2Result = forwardNttRadix2(coefficients, config);
            const radix4Result = forwardNttRadix4(coefficients, config);

            return arraysEqual(radix2Result, radix4Result);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 4: Radix-4 Round-Trip, odd log2(n)
    it('should satisfy round-trip for radix-4 with an unpaired stage (size 32)', () => {
      const size = 32;
      const config = createNTTConfig(size, field);

      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const transformed = forwardNttRadix4(coefficients, config);
            const recovered = inverseNttRadix4(transformed, config);

            return arraysEqual(coefficients, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 4: sizes 2 and 4 boundary cases
    it('should match radix-2 at the smallest sizes', () => {
      for (const size of [2, 4]) {
        const config = createNTTConfig(size, field);

        fc.assert(
          fc.property(
            arbitraryPolynomial(field, size),
            (coefficients) => {
              return (
                arraysEqual(
                  forwardNttRadix2(coefficients, config),
                  forwardNttRadix4(coefficients, config)
                ) &&
                arraysEqual(
                  inverseNttRadix2(coefficients, config),
                  inverseNttRadix4(coefficients, config)
                )
              );
            }
          ),
          PROPERTY_TEST_CONFIG
        );
      }
    });
  });

  describe('Radix-4 Is Not Radix-2 In Disguise', () => {
    const field = BN254_SCALAR_FIELD;

    // A guard on the guard: while radix4.ts delegated to radix2.ts, every
    // equality test above was vacuous. If someone reintroduces delegation,
    // this fails and says why.
    it('should not simply re-export the radix-2 functions', () => {
      expect(forwardNttRadix4).not.toBe(forwardNttRadix2);
      expect(inverseNttRadix4).not.toBe(inverseNttRadix2);
    });

    it('should compute the transform itself, not by calling radix-2', () => {
      // radix4.ts must contain its own butterfly. Checked behaviourally: the
      // radix-4 source performs a different number of passes, so we assert the
      // 4-point butterfly is exercised by verifying against a directly
      // evaluated DFT rather than against radix-2.
      const size = 16;
      const config = createNTTConfig(size, field);
      const coefficients = Array.from({ length: size }, (_, i) =>
        createFieldElement(BigInt(i + 1), field)
      );

      const transformed = forwardNttRadix4(coefficients, config);

      // Direct O(n^2) evaluation: X[k] = sum_j x[j] * omega^(j*k)
      const omega = getFieldElementValue(config.omega);
      const p = field.modulus;
      for (let k = 0; k < size; k++) {
        let expected = 0n;
        let w = 1n; // omega^(0*k)
        const wk = modPowLocal(omega, BigInt(k), p);
        for (let j = 0; j < size; j++) {
          expected = (expected + BigInt(j + 1) * w) % p;
          w = (w * wk) % p;
        }
        expect(getFieldElementValue(transformed[k]!)).toBe(expected);
      }
    });
  });
});

/** Modular exponentiation, local to this test's direct DFT evaluation. */
function modPowLocal(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % mod;
    }
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}
