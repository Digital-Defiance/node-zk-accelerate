/**
 * Property-Based Tests for NTT Round-Trip
 *
 * **Property 3: NTT Round-Trip**
 * - Test forward_ntt then inverse_ntt returns original
 * - Test for various power-of-two sizes
 *
 * **Validates: Requirements 3.1, 3.2, 3.9**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitraryFieldValue,
} from '../test-utils/property-test-config.js';
import { BN254_SCALAR_FIELD, BLS12_381_SCALAR_FIELD } from '../field/config.js';
import { createFieldElement, getFieldElementValue, fieldElementsEqual } from '../field/element.js';
import { createNTTConfig } from './config.js';
import { forwardNttRadix2, inverseNttRadix2 } from './radix2.js';
import type { FieldConfig, FieldElement } from '../types.js';

/**
 * Arbitrary generator for polynomial coefficients of a specific size
 */
function arbitraryPolynomial(field: FieldConfig, size: number): fc.Arbitrary<FieldElement[]> {
  return fc.array(arbitraryFieldValue(field.modulus), { minLength: size, maxLength: size })
    .map(values => values.map(v => createFieldElement(v, field)));
}

/**
 * Arbitrary generator for power-of-two sizes suitable for NTT
 * Using smaller sizes for faster tests
 */
function arbitraryNttSize(): fc.Arbitrary<number> {
  return fc.constantFrom(4, 8, 16, 32, 64);
}

describe('Property 3: NTT Round-Trip', () => {
  describe('BN254 Scalar Field', () => {
    const field = BN254_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (Radix-2)
    it('should satisfy forward_ntt then inverse_ntt returns original (radix-2)', () => {
      fc.assert(
        fc.property(
          arbitraryNttSize(),
          (size) => {
            return fc.assert(
              fc.property(
                arbitraryPolynomial(field, size),
                (coefficients) => {
                  const config = createNTTConfig(size, field);
                  
                  // Forward NTT
                  const transformed = forwardNttRadix2(coefficients, config);
                  
                  // Inverse NTT
                  const recovered = inverseNttRadix2(transformed, config);
                  
                  // Check all coefficients match
                  if (recovered.length !== coefficients.length) {
                    return false;
                  }
                  
                  for (let i = 0; i < coefficients.length; i++) {
                    if (!fieldElementsEqual(coefficients[i]!, recovered[i]!)) {
                      return false;
                    }
                  }
                  
                  return true;
                }
              ),
              { numRuns: 10 } // Fewer runs per size since we test multiple sizes
            );
          }
        ),
        { numRuns: 5 } // Test 5 different sizes
      );
    });

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (Fixed Size 16)
    it('should satisfy round-trip for size 16', () => {
      const size = 16;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const transformed = forwardNttRadix2(coefficients, config);
            const recovered = inverseNttRadix2(transformed, config);
            
            for (let i = 0; i < coefficients.length; i++) {
              if (!fieldElementsEqual(coefficients[i]!, recovered[i]!)) {
                return false;
              }
            }
            return true;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (Fixed Size 64)
    it('should satisfy round-trip for size 64', () => {
      const size = 64;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const transformed = forwardNttRadix2(coefficients, config);
            const recovered = inverseNttRadix2(transformed, config);
            
            for (let i = 0; i < coefficients.length; i++) {
              if (!fieldElementsEqual(coefficients[i]!, recovered[i]!)) {
                return false;
              }
            }
            return true;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (Fixed Size 256)
    it('should satisfy round-trip for size 256', () => {
      const size = 256;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const transformed = forwardNttRadix2(coefficients, config);
            const recovered = inverseNttRadix2(transformed, config);
            
            for (let i = 0; i < coefficients.length; i++) {
              if (!fieldElementsEqual(coefficients[i]!, recovered[i]!)) {
                return false;
              }
            }
            return true;
          }
        ),
        { ...PROPERTY_TEST_CONFIG, numRuns: 50 } // Fewer runs for larger size
      );
    });
  });

  describe('BLS12-381 Scalar Field', () => {
    const field = BLS12_381_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (BLS12-381)
    it('should satisfy forward_ntt then inverse_ntt returns original', () => {
      const size = 32;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const transformed = forwardNttRadix2(coefficients, config);
            const recovered = inverseNttRadix2(transformed, config);
            
            for (let i = 0; i < coefficients.length; i++) {
              if (!fieldElementsEqual(coefficients[i]!, recovered[i]!)) {
                return false;
              }
            }
            return true;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Edge Cases', () => {
    const field = BN254_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (Size 1)
    it('should handle size 1 (trivial case)', () => {
      const size = 1;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const transformed = forwardNttRadix2(coefficients, config);
            const recovered = inverseNttRadix2(transformed, config);
            
            return fieldElementsEqual(coefficients[0]!, recovered[0]!);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (Size 2)
    it('should handle size 2', () => {
      const size = 2;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            const transformed = forwardNttRadix2(coefficients, config);
            const recovered = inverseNttRadix2(transformed, config);
            
            for (let i = 0; i < coefficients.length; i++) {
              if (!fieldElementsEqual(coefficients[i]!, recovered[i]!)) {
                return false;
              }
            }
            return true;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (Zero Polynomial)
    it('should handle zero polynomial', () => {
      const size = 16;
      const config = createNTTConfig(size, field);
      
      // Create zero polynomial
      const zeros = Array(size).fill(null).map(() => createFieldElement(0n, field));
      
      const transformed = forwardNttRadix2(zeros, config);
      const recovered = inverseNttRadix2(transformed, config);
      
      for (let i = 0; i < size; i++) {
        expect(getFieldElementValue(recovered[i]!)).toBe(0n);
      }
    });

    // Feature: node-zk-accelerate, Property 3: NTT Round-Trip (Constant Polynomial)
    it('should handle constant polynomial', () => {
      const size = 16;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryFieldValue(field.modulus),
          (constant) => {
            // Create polynomial with constant in first position, zeros elsewhere
            const coefficients = Array(size).fill(null).map((_, i) => 
              createFieldElement(i === 0 ? constant : 0n, field)
            );
            
            const transformed = forwardNttRadix2(coefficients, config);
            const recovered = inverseNttRadix2(transformed, config);
            
            for (let i = 0; i < coefficients.length; i++) {
              if (!fieldElementsEqual(coefficients[i]!, recovered[i]!)) {
                return false;
              }
            }
            return true;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
