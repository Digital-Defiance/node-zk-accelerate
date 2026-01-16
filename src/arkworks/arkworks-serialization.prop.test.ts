/**
 * Property-Based Tests for Arkworks Serialization
 *
 * **Property 13: Arkworks Serialization Round-Trip**
 * - Test deserialize then serialize produces identical bytes
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitraryFieldValue,
  arbitrarySmallScalar,
} from '../test-utils/property-test-config.js';
import { BN254_FIELD, BLS12_381_FIELD } from '../field/config.js';
import { BN254_CURVE, BLS12_381_CURVE } from '../curve/config.js';
import {
  createFieldElement,
  getFieldElementValue,
  fieldElementsEqual,
} from '../field/element.js';
import { scalarMul } from '../curve/operations.js';
import { affinePointsEqual, isAffineIdentity, createAffineIdentity, toAffine } from '../curve/point.js';
import type { FieldConfig, CurveConfig, AffinePoint } from '../types.js';
import {
  serializeFieldElementArkworks,
  deserializeFieldElementArkworks,
  serializePointArkworks,
  deserializePointArkworks,
  serializePointArkworksUncompressed,
  deserializePointArkworksUncompressed,
  getArkworksFieldByteSize,
} from './serialization.js';

/**
 * Arbitrary generator for field elements
 */
function arbitraryFieldElement(field: FieldConfig) {
  return arbitraryFieldValue(field.modulus).map((value) => createFieldElement(value, field));
}

/**
 * Arbitrary generator for valid curve points
 * Generates points by scalar multiplication of the generator
 */
function arbitraryCurvePoint(curve: CurveConfig): fc.Arbitrary<AffinePoint> {
  return arbitrarySmallScalar().map((scalar) => {
    if (scalar === 0n) {
      return createAffineIdentity(curve);
    }
    const result = scalarMul(scalar, curve.generator, curve);
    return toAffine(result, curve);
  });
}

describe('Property 13: Arkworks Serialization Round-Trip', () => {
  describe('Field Element Serialization', () => {
    describe('BN254 Field', () => {
      const field = BN254_FIELD;

      // Feature: node-zk-accelerate, Property 13: Field Element Round-Trip
      it('should round-trip field elements through Arkworks format', () => {
        fc.assert(
          fc.property(arbitraryFieldElement(field), (element) => {
            const bytes = serializeFieldElementArkworks(element);
            const recovered = deserializeFieldElementArkworks(bytes, field);
            return fieldElementsEqual(element, recovered);
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Byte Size Consistency
      it('should produce consistent byte sizes', () => {
        fc.assert(
          fc.property(arbitraryFieldElement(field), (element) => {
            const bytes = serializeFieldElementArkworks(element);
            const expectedSize = getArkworksFieldByteSize(field);
            return bytes.length === expectedSize;
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Value Preservation
      it('should preserve the underlying value', () => {
        fc.assert(
          fc.property(arbitraryFieldElement(field), (element) => {
            const originalValue = getFieldElementValue(element);
            const bytes = serializeFieldElementArkworks(element);
            const recovered = deserializeFieldElementArkworks(bytes, field);
            const recoveredValue = getFieldElementValue(recovered);
            return originalValue === recoveredValue;
          }),
          PROPERTY_TEST_CONFIG
        );
      });
    });

    describe('BLS12-381 Field', () => {
      const field = BLS12_381_FIELD;

      // Feature: node-zk-accelerate, Property 13: Field Element Round-Trip (BLS12-381)
      it('should round-trip field elements through Arkworks format', () => {
        fc.assert(
          fc.property(arbitraryFieldElement(field), (element) => {
            const bytes = serializeFieldElementArkworks(element);
            const recovered = deserializeFieldElementArkworks(bytes, field);
            return fieldElementsEqual(element, recovered);
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Byte Size Consistency (BLS12-381)
      it('should produce consistent byte sizes', () => {
        fc.assert(
          fc.property(arbitraryFieldElement(field), (element) => {
            const bytes = serializeFieldElementArkworks(element);
            const expectedSize = getArkworksFieldByteSize(field);
            return bytes.length === expectedSize;
          }),
          PROPERTY_TEST_CONFIG
        );
      });
    });
  });

  describe('Curve Point Serialization (Compressed)', () => {
    describe('BN254 Curve', () => {
      const curve = BN254_CURVE;

      // Feature: node-zk-accelerate, Property 13: Point Round-Trip (Compressed)
      it('should round-trip curve points through Arkworks compressed format', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (point) => {
            const bytes = serializePointArkworks(point, curve);
            const recovered = deserializePointArkworks(bytes, curve);
            return affinePointsEqual(point, recovered);
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Compressed Byte Size
      it('should produce correct compressed byte size', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (point) => {
            const bytes = serializePointArkworks(point, curve);
            const fieldByteSize = getArkworksFieldByteSize(curve.field);
            // Compressed format: x-coordinate + 1 flags byte
            const expectedSize = fieldByteSize + 1;
            return bytes.length === expectedSize;
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Identity Point Handling
      it('should correctly handle identity point', () => {
        const identity = createAffineIdentity(curve);
        const bytes = serializePointArkworks(identity, curve);
        const recovered = deserializePointArkworks(bytes, curve);
        expect(isAffineIdentity(recovered)).toBe(true);
      });
    });

    describe('BLS12-381 Curve', () => {
      const curve = BLS12_381_CURVE;

      // Feature: node-zk-accelerate, Property 13: Point Round-Trip (BLS12-381 Compressed)
      it('should round-trip curve points through Arkworks compressed format', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (point) => {
            const bytes = serializePointArkworks(point, curve);
            const recovered = deserializePointArkworks(bytes, curve);
            return affinePointsEqual(point, recovered);
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Identity Point Handling (BLS12-381)
      it('should correctly handle identity point', () => {
        const identity = createAffineIdentity(curve);
        const bytes = serializePointArkworks(identity, curve);
        const recovered = deserializePointArkworks(bytes, curve);
        expect(isAffineIdentity(recovered)).toBe(true);
      });
    });
  });

  describe('Curve Point Serialization (Uncompressed)', () => {
    describe('BN254 Curve', () => {
      const curve = BN254_CURVE;

      // Feature: node-zk-accelerate, Property 13: Point Round-Trip (Uncompressed)
      it('should round-trip curve points through Arkworks uncompressed format', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (point) => {
            const bytes = serializePointArkworksUncompressed(point, curve);
            const recovered = deserializePointArkworksUncompressed(bytes, curve);
            return affinePointsEqual(point, recovered);
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Uncompressed Byte Size
      it('should produce correct uncompressed byte size', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (point) => {
            const bytes = serializePointArkworksUncompressed(point, curve);
            const fieldByteSize = getArkworksFieldByteSize(curve.field);
            // Uncompressed format: x-coordinate + y-coordinate + 1 flags byte
            const expectedSize = 2 * fieldByteSize + 1;
            return bytes.length === expectedSize;
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Identity Point Handling (Uncompressed)
      it('should correctly handle identity point in uncompressed format', () => {
        const identity = createAffineIdentity(curve);
        const bytes = serializePointArkworksUncompressed(identity, curve);
        const recovered = deserializePointArkworksUncompressed(bytes, curve);
        expect(isAffineIdentity(recovered)).toBe(true);
      });
    });

    describe('BLS12-381 Curve', () => {
      const curve = BLS12_381_CURVE;

      // Feature: node-zk-accelerate, Property 13: Point Round-Trip (BLS12-381 Uncompressed)
      it('should round-trip curve points through Arkworks uncompressed format', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (point) => {
            const bytes = serializePointArkworksUncompressed(point, curve);
            const recovered = deserializePointArkworksUncompressed(bytes, curve);
            return affinePointsEqual(point, recovered);
          }),
          PROPERTY_TEST_CONFIG
        );
      });
    });
  });

  describe('Bytes Round-Trip (Deserialize then Serialize)', () => {
    describe('BN254 Field', () => {
      const field = BN254_FIELD;

      // Feature: node-zk-accelerate, Property 13: Bytes Identity (Field)
      it('deserialize then serialize should produce identical bytes for field elements', () => {
        fc.assert(
          fc.property(arbitraryFieldElement(field), (element) => {
            // First serialize to get valid Arkworks bytes
            const originalBytes = serializeFieldElementArkworks(element);
            // Deserialize and re-serialize
            const recovered = deserializeFieldElementArkworks(originalBytes, field);
            const reserializedBytes = serializeFieldElementArkworks(recovered);
            // Check bytes are identical
            if (originalBytes.length !== reserializedBytes.length) {
              return false;
            }
            for (let i = 0; i < originalBytes.length; i++) {
              if (originalBytes[i] !== reserializedBytes[i]) {
                return false;
              }
            }
            return true;
          }),
          PROPERTY_TEST_CONFIG
        );
      });
    });

    describe('BN254 Curve', () => {
      const curve = BN254_CURVE;

      // Feature: node-zk-accelerate, Property 13: Bytes Identity (Point Compressed)
      it('deserialize then serialize should produce identical bytes for compressed points', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (point) => {
            // First serialize to get valid Arkworks bytes
            const originalBytes = serializePointArkworks(point, curve);
            // Deserialize and re-serialize
            const recovered = deserializePointArkworks(originalBytes, curve);
            const reserializedBytes = serializePointArkworks(recovered, curve);
            // Check bytes are identical
            if (originalBytes.length !== reserializedBytes.length) {
              return false;
            }
            for (let i = 0; i < originalBytes.length; i++) {
              if (originalBytes[i] !== reserializedBytes[i]) {
                return false;
              }
            }
            return true;
          }),
          PROPERTY_TEST_CONFIG
        );
      });

      // Feature: node-zk-accelerate, Property 13: Bytes Identity (Point Uncompressed)
      it('deserialize then serialize should produce identical bytes for uncompressed points', () => {
        fc.assert(
          fc.property(arbitraryCurvePoint(curve), (point) => {
            // First serialize to get valid Arkworks bytes
            const originalBytes = serializePointArkworksUncompressed(point, curve);
            // Deserialize and re-serialize
            const recovered = deserializePointArkworksUncompressed(originalBytes, curve);
            const reserializedBytes = serializePointArkworksUncompressed(recovered, curve);
            // Check bytes are identical
            if (originalBytes.length !== reserializedBytes.length) {
              return false;
            }
            for (let i = 0; i < originalBytes.length; i++) {
              if (originalBytes[i] !== reserializedBytes[i]) {
                return false;
              }
            }
            return true;
          }),
          PROPERTY_TEST_CONFIG
        );
      });
    });
  });

  describe('Edge Cases', () => {
    // Feature: node-zk-accelerate, Property 13: Zero Field Element
    it('should correctly serialize and deserialize zero field element', () => {
      const zeroElement = createFieldElement(0n, BN254_FIELD);
      const bytes = serializeFieldElementArkworks(zeroElement);
      const recovered = deserializeFieldElementArkworks(bytes, BN254_FIELD);
      expect(fieldElementsEqual(zeroElement, recovered)).toBe(true);
    });

    // Feature: node-zk-accelerate, Property 13: One Field Element
    it('should correctly serialize and deserialize one field element', () => {
      const oneElement = createFieldElement(1n, BN254_FIELD);
      const bytes = serializeFieldElementArkworks(oneElement);
      const recovered = deserializeFieldElementArkworks(bytes, BN254_FIELD);
      expect(fieldElementsEqual(oneElement, recovered)).toBe(true);
    });

    // Feature: node-zk-accelerate, Property 13: Max Field Element
    it('should correctly serialize and deserialize max field element', () => {
      const maxElement = createFieldElement(BN254_FIELD.modulus - 1n, BN254_FIELD);
      const bytes = serializeFieldElementArkworks(maxElement);
      const recovered = deserializeFieldElementArkworks(bytes, BN254_FIELD);
      expect(fieldElementsEqual(maxElement, recovered)).toBe(true);
    });

    // Feature: node-zk-accelerate, Property 13: Generator Point
    it('should correctly serialize and deserialize generator point', () => {
      const generator = BN254_CURVE.generator;
      
      // Compressed
      const compressedBytes = serializePointArkworks(generator, BN254_CURVE);
      const recoveredCompressed = deserializePointArkworks(compressedBytes, BN254_CURVE);
      expect(affinePointsEqual(generator, recoveredCompressed)).toBe(true);
      
      // Uncompressed
      const uncompressedBytes = serializePointArkworksUncompressed(generator, BN254_CURVE);
      const recoveredUncompressed = deserializePointArkworksUncompressed(uncompressedBytes, BN254_CURVE);
      expect(affinePointsEqual(generator, recoveredUncompressed)).toBe(true);
    });
  });
});
