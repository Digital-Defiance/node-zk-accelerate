/**
 * Property-Based Tests for NTT Implementation Consistency
 *
 * **Property 4: NTT Implementation Consistency**
 * - Test radix-2 and radix-4 produce identical results
 *
 * **Validates: Requirements 3.3**
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitraryFieldValue,
} from '../test-utils/property-test-config.js';
import { BN254_SCALAR_FIELD, BLS12_381_SCALAR_FIELD } from '../field/config.js';
import { createFieldElement, fieldElementsEqual } from '../field/element.js';
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

  describe('Non-Power-of-4 Sizes (Radix-4 Fallback)', () => {
    const field = BN254_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 4: Radix-4 Fallback for Non-Power-of-4
    it('should fall back to radix-2 for non-power-of-4 sizes', () => {
      // Size 8 is power of 2 but not power of 4
      const size = 8;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            // Radix-4 should fall back to radix-2 for size 8
            const radix2Result = forwardNttRadix2(coefficients, config);
            const radix4Result = forwardNttRadix4(coefficients, config);
            
            return arraysEqual(radix2Result, radix4Result);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 4: Radix-4 Fallback Round-Trip
    it('should satisfy round-trip for radix-4 fallback (size 32)', () => {
      const size = 32;
      const config = createNTTConfig(size, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, size),
          (coefficients) => {
            // Size 32 is not power of 4, so radix-4 falls back to radix-2
            const transformed = forwardNttRadix4(coefficients, config);
            const recovered = inverseNttRadix4(transformed, config);
            
            return arraysEqual(coefficients, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
