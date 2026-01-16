/**
 * Property-Based Tests for Field Element Serialization
 *
 * **Property 7: Field Element Serialization Round-Trip**
 * - Test serialize then deserialize returns original
 * - Test both endianness options
 *
 * **Validates: Requirements 4.7, 4.8**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitraryFieldValue,
  arbitraryEndianness,
} from '../test-utils/property-test-config.js';
import {
  BN254_FIELD,
  BLS12_381_FIELD,
} from './config.js';
import {
  createFieldElement,
  getFieldElementValue,
  fieldElementsEqual,
} from './element.js';
import {
  fieldElementToBytes,
  fieldElementFromBytes,
  fieldElementToHex,
  fieldElementFromHex,
  fieldElementsToBytes,
  fieldElementsFromBytes,
  getFieldByteSize,
} from './serialization.js';
import type { FieldConfig, Endianness } from '../types.js';

/**
 * Arbitrary generator for field elements
 */
function arbitraryFieldElement(field: FieldConfig) {
  return arbitraryFieldValue(field.modulus).map((value) => createFieldElement(value, field));
}

/**
 * Arbitrary generator for arrays of field elements
 */
function arbitraryFieldElementArray(
  field: FieldConfig,
  minLength: number = 1,
  maxLength: number = 20
) {
  return fc.array(arbitraryFieldElement(field), { minLength, maxLength });
}

describe('Property 7: Field Element Serialization Round-Trip', () => {
  describe('BN254 Field', () => {
    const field = BN254_FIELD;

    // Feature: node-zk-accelerate, Property 7: Bytes Round-Trip (Big-Endian)
    it('should round-trip through bytes (big-endian)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (element) => {
            const bytes = fieldElementToBytes(element, 'be');
            const recovered = fieldElementFromBytes(bytes, field, 'be');
            return fieldElementsEqual(element, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Bytes Round-Trip (Little-Endian)
    it('should round-trip through bytes (little-endian)', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (element) => {
            const bytes = fieldElementToBytes(element, 'le');
            const recovered = fieldElementFromBytes(bytes, field, 'le');
            return fieldElementsEqual(element, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Bytes Round-Trip (Any Endianness)
    it('should round-trip through bytes with any endianness', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryEndianness(),
          (element, endian) => {
            const bytes = fieldElementToBytes(element, endian);
            const recovered = fieldElementFromBytes(bytes, field, endian);
            return fieldElementsEqual(element, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Hex Round-Trip
    it('should round-trip through hex string', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (element) => {
            const hex = fieldElementToHex(element, true);
            const recovered = fieldElementFromHex(hex, field);
            return fieldElementsEqual(element, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Hex Round-Trip (No Prefix)
    it('should round-trip through hex string without prefix', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (element) => {
            const hex = fieldElementToHex(element, false);
            const recovered = fieldElementFromHex(hex, field);
            return fieldElementsEqual(element, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Batch Bytes Round-Trip
    it('should round-trip multiple elements through bytes', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElementArray(field, 1, 10),
          arbitraryEndianness(),
          (elements, endian) => {
            const bytes = fieldElementsToBytes(elements, endian);
            const recovered = fieldElementsFromBytes(bytes, field, endian);

            if (elements.length !== recovered.length) {
              return false;
            }

            for (let i = 0; i < elements.length; i++) {
              if (!fieldElementsEqual(elements[i]!, recovered[i]!)) {
                return false;
              }
            }

            return true;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Byte Size Consistency
    it('should produce consistent byte sizes', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryEndianness(),
          (element, endian) => {
            const bytes = fieldElementToBytes(element, endian);
            const expectedSize = getFieldByteSize(field);
            return bytes.length === expectedSize;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Value Preservation
    it('should preserve the underlying value', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryEndianness(),
          (element, endian) => {
            const originalValue = getFieldElementValue(element);
            const bytes = fieldElementToBytes(element, endian);
            const recovered = fieldElementFromBytes(bytes, field, endian);
            const recoveredValue = getFieldElementValue(recovered);
            return originalValue === recoveredValue;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('BLS12-381 Field', () => {
    const field = BLS12_381_FIELD;

    // Feature: node-zk-accelerate, Property 7: Bytes Round-Trip (BLS12-381)
    it('should round-trip through bytes with any endianness', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          arbitraryEndianness(),
          (element, endian) => {
            const bytes = fieldElementToBytes(element, endian);
            const recovered = fieldElementFromBytes(bytes, field, endian);
            return fieldElementsEqual(element, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Hex Round-Trip (BLS12-381)
    it('should round-trip through hex string', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElement(field),
          (element) => {
            const hex = fieldElementToHex(element, true);
            const recovered = fieldElementFromHex(hex, field);
            return fieldElementsEqual(element, recovered);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 7: Batch Bytes Round-Trip (BLS12-381)
    it('should round-trip multiple elements through bytes', () => {
      fc.assert(
        fc.property(
          arbitraryFieldElementArray(field, 1, 10),
          arbitraryEndianness(),
          (elements, endian) => {
            const bytes = fieldElementsToBytes(elements, endian);
            const recovered = fieldElementsFromBytes(bytes, field, endian);

            if (elements.length !== recovered.length) {
              return false;
            }

            for (let i = 0; i < elements.length; i++) {
              if (!fieldElementsEqual(elements[i]!, recovered[i]!)) {
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
    // Feature: node-zk-accelerate, Property 7: Zero Element
    it('should correctly serialize and deserialize zero', () => {
      const zeroElement = createFieldElement(0n, BN254_FIELD);
      
      const bytesBe = fieldElementToBytes(zeroElement, 'be');
      const bytesLe = fieldElementToBytes(zeroElement, 'le');
      
      const recoveredBe = fieldElementFromBytes(bytesBe, BN254_FIELD, 'be');
      const recoveredLe = fieldElementFromBytes(bytesLe, BN254_FIELD, 'le');
      
      expect(fieldElementsEqual(zeroElement, recoveredBe)).toBe(true);
      expect(fieldElementsEqual(zeroElement, recoveredLe)).toBe(true);
    });

    // Feature: node-zk-accelerate, Property 7: One Element
    it('should correctly serialize and deserialize one', () => {
      const oneElement = createFieldElement(1n, BN254_FIELD);
      
      const bytesBe = fieldElementToBytes(oneElement, 'be');
      const bytesLe = fieldElementToBytes(oneElement, 'le');
      
      const recoveredBe = fieldElementFromBytes(bytesBe, BN254_FIELD, 'be');
      const recoveredLe = fieldElementFromBytes(bytesLe, BN254_FIELD, 'le');
      
      expect(fieldElementsEqual(oneElement, recoveredBe)).toBe(true);
      expect(fieldElementsEqual(oneElement, recoveredLe)).toBe(true);
    });

    // Feature: node-zk-accelerate, Property 7: Max Value
    it('should correctly serialize and deserialize max value', () => {
      const maxElement = createFieldElement(BN254_FIELD.modulus - 1n, BN254_FIELD);
      
      const bytesBe = fieldElementToBytes(maxElement, 'be');
      const bytesLe = fieldElementToBytes(maxElement, 'le');
      
      const recoveredBe = fieldElementFromBytes(bytesBe, BN254_FIELD, 'be');
      const recoveredLe = fieldElementFromBytes(bytesLe, BN254_FIELD, 'le');
      
      expect(fieldElementsEqual(maxElement, recoveredBe)).toBe(true);
      expect(fieldElementsEqual(maxElement, recoveredLe)).toBe(true);
    });

    // Feature: node-zk-accelerate, Property 7: Empty Array
    it('should handle empty array serialization', () => {
      const bytes = fieldElementsToBytes([], 'be');
      expect(bytes.length).toBe(0);
      
      const recovered = fieldElementsFromBytes(new Uint8Array(0), BN254_FIELD, 'be');
      expect(recovered.length).toBe(0);
    });
  });
});
