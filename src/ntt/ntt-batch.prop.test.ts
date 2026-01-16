/**
 * Property-Based Tests for Batch NTT Correctness
 *
 * **Property 4: NTT Implementation Consistency (batch)**
 * - Test batch_ntt produces same results as individual NTTs
 *
 * **Validates: Requirements 3.4**
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
import { batchForwardNtt, batchInverseNtt } from './batch.js';
import type { FieldConfig, FieldElement } from '../types.js';

/**
 * Arbitrary generator for polynomial coefficients of a specific size
 */
function arbitraryPolynomial(field: FieldConfig, size: number): fc.Arbitrary<FieldElement[]> {
  return fc.array(arbitraryFieldValue(field.modulus), { minLength: size, maxLength: size })
    .map(values => values.map(v => createFieldElement(v, field)));
}

/**
 * Arbitrary generator for batch of polynomials
 */
function arbitraryPolynomialBatch(
  field: FieldConfig,
  polySize: number,
  batchSize: number
): fc.Arbitrary<FieldElement[][]> {
  return fc.array(arbitraryPolynomial(field, polySize), { minLength: batchSize, maxLength: batchSize });
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

describe('Property 4: NTT Implementation Consistency (batch)', () => {
  describe('BN254 Scalar Field', () => {
    const field = BN254_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 4: Batch Forward NTT Consistency
    it('should produce same results as individual forward NTTs', () => {
      const polySize = 16;
      const config = createNTTConfig(polySize, field);
      
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (batchSize) => {
            return fc.assert(
              fc.property(
                arbitraryPolynomialBatch(field, polySize, batchSize),
                (polynomials) => {
                  // Batch NTT
                  const batchResults = batchForwardNtt(polynomials, config);
                  
                  // Individual NTTs
                  const individualResults = polynomials.map(poly => 
                    forwardNttRadix2(poly, config)
                  );
                  
                  // Compare results
                  if (batchResults.length !== individualResults.length) {
                    return false;
                  }
                  
                  for (let i = 0; i < batchResults.length; i++) {
                    if (!arraysEqual(batchResults[i]!, individualResults[i]!)) {
                      return false;
                    }
                  }
                  
                  return true;
                }
              ),
              { numRuns: 20 }
            );
          }
        ),
        { numRuns: 5 }
      );
    });

    // Feature: node-zk-accelerate, Property 4: Batch Inverse NTT Consistency
    it('should produce same results as individual inverse NTTs', () => {
      const polySize = 16;
      const config = createNTTConfig(polySize, field);
      
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (batchSize) => {
            return fc.assert(
              fc.property(
                arbitraryPolynomialBatch(field, polySize, batchSize),
                (polynomials) => {
                  // Batch inverse NTT
                  const batchResults = batchInverseNtt(polynomials, config);
                  
                  // Individual inverse NTTs
                  const individualResults = polynomials.map(poly => 
                    inverseNttRadix2(poly, config)
                  );
                  
                  // Compare results
                  if (batchResults.length !== individualResults.length) {
                    return false;
                  }
                  
                  for (let i = 0; i < batchResults.length; i++) {
                    if (!arraysEqual(batchResults[i]!, individualResults[i]!)) {
                      return false;
                    }
                  }
                  
                  return true;
                }
              ),
              { numRuns: 20 }
            );
          }
        ),
        { numRuns: 5 }
      );
    });

    // Feature: node-zk-accelerate, Property 4: Batch Round-Trip
    it('should satisfy round-trip for batch NTT', () => {
      const polySize = 32;
      const config = createNTTConfig(polySize, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomialBatch(field, polySize, 3),
          (polynomials) => {
            // Forward then inverse batch NTT
            const transformed = batchForwardNtt(polynomials, config);
            const recovered = batchInverseNtt(transformed, config);
            
            // Compare with original
            for (let i = 0; i < polynomials.length; i++) {
              if (!arraysEqual(polynomials[i]!, recovered[i]!)) {
                return false;
              }
            }
            
            return true;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 4: Empty Batch
    it('should handle empty batch', () => {
      const polySize = 16;
      const config = createNTTConfig(polySize, field);
      
      const emptyBatch: FieldElement[][] = [];
      const forwardResult = batchForwardNtt(emptyBatch, config);
      const inverseResult = batchInverseNtt(emptyBatch, config);
      
      return forwardResult.length === 0 && inverseResult.length === 0;
    });

    // Feature: node-zk-accelerate, Property 4: Single Polynomial Batch
    it('should handle single polynomial batch', () => {
      const polySize = 16;
      const config = createNTTConfig(polySize, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomial(field, polySize),
          (polynomial) => {
            const batch = [polynomial];
            
            // Batch NTT
            const batchResult = batchForwardNtt(batch, config);
            
            // Individual NTT
            const individualResult = forwardNttRadix2(polynomial, config);
            
            return arraysEqual(batchResult[0]!, individualResult);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('BLS12-381 Scalar Field', () => {
    const field = BLS12_381_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 4: BLS12-381 Batch Consistency
    it('should produce same results as individual NTTs (BLS12-381)', () => {
      const polySize = 16;
      const config = createNTTConfig(polySize, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomialBatch(field, polySize, 3),
          (polynomials) => {
            // Batch NTT
            const batchResults = batchForwardNtt(polynomials, config);
            
            // Individual NTTs
            const individualResults = polynomials.map(poly => 
              forwardNttRadix2(poly, config)
            );
            
            // Compare results
            for (let i = 0; i < batchResults.length; i++) {
              if (!arraysEqual(batchResults[i]!, individualResults[i]!)) {
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

  describe('Larger Batches', () => {
    const field = BN254_SCALAR_FIELD;

    // Feature: node-zk-accelerate, Property 4: Large Batch Consistency
    it('should handle larger batches correctly', () => {
      const polySize = 8;
      const config = createNTTConfig(polySize, field);
      
      fc.assert(
        fc.property(
          arbitraryPolynomialBatch(field, polySize, 10),
          (polynomials) => {
            // Batch NTT
            const batchResults = batchForwardNtt(polynomials, config);
            
            // Individual NTTs
            const individualResults = polynomials.map(poly => 
              forwardNttRadix2(poly, config)
            );
            
            // Compare results
            for (let i = 0; i < batchResults.length; i++) {
              if (!arraysEqual(batchResults[i]!, individualResults[i]!)) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { ...PROPERTY_TEST_CONFIG, numRuns: 50 }
      );
    });
  });
});
