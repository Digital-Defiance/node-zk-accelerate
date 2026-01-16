/**
 * Property-Based Tests for Batch Inversion
 *
 * **Property 6: Batch Inversion Correctness**
 * - Verify batch_inv produces same results as individual inv calls
 *
 * **Validates: Requirements 4.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitraryNonZeroFieldValue,
} from '../test-utils/property-test-config.js';
import {
  BN254_FIELD,
  BLS12_381_FIELD,
} from './config.js';
import {
  createFieldElement,
  fieldElementsEqual,
} from './element.js';
import {
  fieldInv,
  batchInv,
} from './operations.js';
import type { FieldConfig, FieldElement } from '../types.js';

/**
 * Arbitrary generator for non-zero field elements
 */
function arbitraryNonZeroFieldElement(field: FieldConfig) {
  return arbitraryNonZeroFieldValue(field.modulus).map((value) => createFieldElement(value, field));
}

/**
 * Arbitrary generator for arrays of non-zero field elements
 */
function arbitraryNonZeroFieldElementArray(
  field: FieldConfig,
  minLength: number = 1,
  maxLength: number = 50
) {
  return fc.array(arbitraryNonZeroFieldElement(field), { minLength, maxLength });
}

describe('Property 6: Batch Inversion Correctness', () => {
  describe('BN254 Field', () => {
    const field = BN254_FIELD;

    // Feature: node-zk-accelerate, Property 6: Batch Inversion Equivalence
    it('should produce same results as individual inv calls', () => {
      fc.assert(
        fc.property(
          arbitraryNonZeroFieldElementArray(field, 1, 20),
          (elements) => {
            // Compute batch inversion
            const batchResults = batchInv(elements);

            // Compute individual inversions
            const individualResults = elements.map((e) => fieldInv(e));

            // Verify lengths match
            if (batchResults.length !== individualResults.length) {
              return false;
            }

            // Verify each result matches
            for (let i = 0; i < batchResults.length; i++) {
              if (!fieldElementsEqual(batchResults[i]!, individualResults[i]!)) {
                return false;
              }
            }

            return true;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 6: Batch Inversion Single Element
    it('should handle single element correctly', () => {
      fc.assert(
        fc.property(
          arbitraryNonZeroFieldElement(field),
          (element) => {
            const batchResult = batchInv([element]);
            const individualResult = fieldInv(element);

            return (
              batchResult.length === 1 &&
              fieldElementsEqual(batchResult[0]!, individualResult)
            );
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 6: Batch Inversion Empty Array
    it('should handle empty array correctly', () => {
      const result = batchInv([]);
      expect(result).toEqual([]);
    });

    // Feature: node-zk-accelerate, Property 6: Batch Inversion Preserves Order
    it('should preserve element order', () => {
      fc.assert(
        fc.property(
          arbitraryNonZeroFieldElementArray(field, 2, 10),
          (elements) => {
            const batchResults = batchInv(elements);

            // Verify each inverse is correct by multiplying with original
            for (let i = 0; i < elements.length; i++) {
              const product = fieldMul(elements[i]!, batchResults[i]!);
              if (!isOneFieldElement(product)) {
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

  describe('BLS12-381 Field', () => {
    const field = BLS12_381_FIELD;

    // Feature: node-zk-accelerate, Property 6: Batch Inversion Equivalence (BLS12-381)
    it('should produce same results as individual inv calls', () => {
      fc.assert(
        fc.property(
          arbitraryNonZeroFieldElementArray(field, 1, 20),
          (elements) => {
            // Compute batch inversion
            const batchResults = batchInv(elements);

            // Compute individual inversions
            const individualResults = elements.map((e) => fieldInv(e));

            // Verify lengths match
            if (batchResults.length !== individualResults.length) {
              return false;
            }

            // Verify each result matches
            for (let i = 0; i < batchResults.length; i++) {
              if (!fieldElementsEqual(batchResults[i]!, individualResults[i]!)) {
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

// Import additional functions needed for tests
import { fieldMul } from './operations.js';
import { isOneFieldElement } from './element.js';
