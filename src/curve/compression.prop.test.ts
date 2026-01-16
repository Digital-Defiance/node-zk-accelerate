/**
 * Property-Based Tests for Point Compression Round-Trip
 *
 * **Property 9: Point Compression Round-Trip**
 * - Test compress then decompress returns original point
 *
 * **Validates: Requirements 5.5, 5.6, 5.9**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PROPERTY_TEST_CONFIG,
  arbitrarySmallScalar,
} from '../test-utils/property-test-config.js';
import { BN254_CURVE, BLS12_381_CURVE } from './config.js';
import {
  createAffineIdentity,
  toAffine,
  affinePointsEqual,
} from './point.js';
import { scalarMul } from './operations.js';
import {
  compressPoint,
  decompressPoint,
  serializePointUncompressed,
  deserializePointUncompressed,
} from './compression.js';
import type { CurveConfig, AffinePoint } from '../types.js';

/**
 * Generate a valid curve point by scalar multiplication of the generator
 */
function arbitraryCurvePoint(curve: CurveConfig): fc.Arbitrary<AffinePoint> {
  return arbitrarySmallScalar().map((scalar) => {
    const result = scalarMul(scalar, curve.generator, curve);
    return toAffine(result, curve);
  });
}

describe('Property 9: Point Compression Round-Trip', () => {
  describe('BN254 Curve', () => {
    const curve = BN254_CURVE;

    // Feature: node-zk-accelerate, Property 9: Compression round-trip
    it('should satisfy decompress(compress(P)) = P', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const compressed = compressPoint(point, curve);
          const decompressed = decompressPoint(compressed, curve);
          return affinePointsEqual(point, decompressed);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 9: Identity compression round-trip
    it('should correctly compress and decompress identity point', () => {
      const identity = createAffineIdentity(curve);
      const compressed = compressPoint(identity, curve);
      const decompressed = decompressPoint(compressed, curve);
      expect(decompressed.isInfinity).toBe(true);
    });

    // Feature: node-zk-accelerate, Property 9: Uncompressed serialization round-trip
    it('should satisfy deserialize(serialize(P)) = P for uncompressed format', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const serialized = serializePointUncompressed(point, curve);
          const deserialized = deserializePointUncompressed(serialized, curve);
          return affinePointsEqual(point, deserialized);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 9: Compressed format is smaller
    it('should produce smaller output with compression', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const compressed = compressPoint(point, curve);
          const uncompressed = serializePointUncompressed(point, curve);
          // Compressed should be roughly half the size (1 + fieldLen vs 1 + 2*fieldLen)
          return compressed.length < uncompressed.length;
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 9: Compression preserves y-parity
    it('should preserve y-coordinate parity through compression', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const compressed = compressPoint(point, curve);
          const decompressed = decompressPoint(compressed, curve);

          // Get y values
          const originalY = point.y.limbs[0]!;
          const decompressedY = decompressed.y.limbs[0]!;

          // Parity should match
          return (originalY % 2n) === (decompressedY % 2n);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 9: Generator point compression
    it('should correctly compress and decompress the generator point', () => {
      const compressed = compressPoint(curve.generator, curve);
      const decompressed = decompressPoint(compressed, curve);
      expect(affinePointsEqual(curve.generator, decompressed)).toBe(true);
    });
  });

  describe('BLS12-381 Curve', () => {
    const curve = BLS12_381_CURVE;

    // Feature: node-zk-accelerate, Property 9: Compression round-trip (BLS12-381)
    it('should satisfy decompress(compress(P)) = P', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const compressed = compressPoint(point, curve);
          const decompressed = decompressPoint(compressed, curve);
          return affinePointsEqual(point, decompressed);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 9: Identity compression round-trip (BLS12-381)
    it('should correctly compress and decompress identity point', () => {
      const identity = createAffineIdentity(curve);
      const compressed = compressPoint(identity, curve);
      const decompressed = decompressPoint(compressed, curve);
      expect(decompressed.isInfinity).toBe(true);
    });

    // Feature: node-zk-accelerate, Property 9: Uncompressed serialization round-trip (BLS12-381)
    it('should satisfy deserialize(serialize(P)) = P for uncompressed format', () => {
      fc.assert(
        fc.property(arbitraryCurvePoint(curve), (point) => {
          const serialized = serializePointUncompressed(point, curve);
          const deserialized = deserializePointUncompressed(serialized, curve);
          return affinePointsEqual(point, deserialized);
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 9: Generator point compression (BLS12-381)
    it('should correctly compress and decompress the generator point', () => {
      const compressed = compressPoint(curve.generator, curve);
      const decompressed = decompressPoint(compressed, curve);
      expect(affinePointsEqual(curve.generator, decompressed)).toBe(true);
    });
  });
});
