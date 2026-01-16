/**
 * Arkworks Serialization Format
 *
 * This module implements serialization and deserialization compatible with
 * the Arkworks Rust library. Arkworks uses:
 *
 * - Little-endian byte order for all values
 * - Montgomery representation for field elements
 * - Compressed point format with flags byte at the end
 *
 * Point serialization format (compressed):
 * - x-coordinate (little-endian) + flags byte
 * - Flags byte: bit 7 = infinity, bit 6 = y is lexicographically largest
 *
 * Point serialization format (uncompressed):
 * - x-coordinate (little-endian) + y-coordinate (little-endian) + flags byte
 * - Flags byte: bit 7 = infinity
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import type { AffinePoint, CurveConfig, FieldConfig, FieldElement } from '../types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import {
  createFieldElement,
  getFieldElementValue,
} from '../field/element.js';
import { fieldAdd, fieldMul, fieldSquare, fieldPow } from '../field/operations.js';
import { createAffineIdentity, isAffineIdentity } from '../curve/point.js';
import { isOnCurve } from '../curve/operations.js';

/**
 * Arkworks flags byte constants
 */
const ARKWORKS_INFINITY_FLAG = 0x40; // Bit 6 indicates point at infinity
const ARKWORKS_Y_FLAG = 0x80; // Bit 7 indicates y is lexicographically largest

/**
 * Get the byte size for a field element in Arkworks format
 */
export function getArkworksFieldByteSize(field: FieldConfig): number {
  // Calculate bits needed for modulus
  let bits = 0n;
  let m = field.modulus;
  while (m > 0n) {
    bits++;
    m >>= 1n;
  }
  // Round up to nearest byte
  return Math.ceil(Number(bits) / 8);
}

/**
 * Convert a field element to Montgomery representation
 *
 * In Montgomery form: a_mont = a * R mod p
 * where R = 2^(limbCount * 64)
 */
function toMontgomery(value: bigint, field: FieldConfig): bigint {
  return (value * field.r) % field.modulus;
}

/**
 * Convert from Montgomery representation to standard form
 *
 * From Montgomery form: a = a_mont * R^-1 mod p
 */
function fromMontgomery(montValue: bigint, field: FieldConfig): bigint {
  return (montValue * field.rInv) % field.modulus;
}

/**
 * Serialize a field element in Arkworks format
 *
 * Arkworks uses little-endian byte order and Montgomery representation.
 *
 * @param element - The field element to serialize
 * @returns The serialized bytes in Arkworks format
 *
 * Requirements: 11.3
 */
export function serializeFieldElementArkworks(element: FieldElement): Uint8Array {
  const value = getFieldElementValue(element);
  const montValue = toMontgomery(value, element.field);
  const byteSize = getArkworksFieldByteSize(element.field);
  const bytes = new Uint8Array(byteSize);

  // Little-endian: LSB first
  let v = montValue;
  for (let i = 0; i < byteSize; i++) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }

  return bytes;
}

/**
 * Deserialize a field element from Arkworks format
 *
 * @param bytes - The bytes in Arkworks format
 * @param field - The field configuration
 * @returns The deserialized field element
 *
 * Requirements: 11.2
 */
export function deserializeFieldElementArkworks(
  bytes: Uint8Array,
  field: FieldConfig
): FieldElement {
  const expectedSize = getArkworksFieldByteSize(field);
  if (bytes.length !== expectedSize) {
    throw new ZkAccelerateError(
      'Invalid Arkworks field element byte length',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { expected: expectedSize, actual: bytes.length }
    );
  }

  // Little-endian: LSB first
  let montValue = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    montValue = (montValue << 8n) | BigInt(bytes[i]!);
  }

  // Validate that Montgomery value is within field
  if (montValue >= field.modulus) {
    throw new ZkAccelerateError(
      'Arkworks field element exceeds modulus',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { value: montValue.toString(), modulus: field.modulus.toString() }
    );
  }

  // Convert from Montgomery form
  const value = fromMontgomery(montValue, field);

  return createFieldElement(value, field);
}

/**
 * Check if y is lexicographically largest (y > p/2)
 */
function isYLargest(y: bigint, modulus: bigint): boolean {
  return y > modulus / 2n;
}

/**
 * Compute the modular square root using Tonelli-Shanks algorithm
 *
 * For primes p ≡ 3 (mod 4), we can use the simpler formula:
 * sqrt(a) = a^((p+1)/4) mod p
 */
function modSqrt(value: FieldElement, curve: CurveConfig): FieldElement | null {
  const p = curve.field.modulus;
  const a = getFieldElementValue(value);

  if (a === 0n) {
    return createFieldElement(0n, curve.field);
  }

  // Check if p ≡ 3 (mod 4)
  if (p % 4n === 3n) {
    // sqrt(a) = a^((p+1)/4) mod p
    const exp = (p + 1n) / 4n;
    const result = fieldPow(value, exp);

    // Verify the result
    const resultSquared = fieldSquare(result);
    const resultVal = getFieldElementValue(resultSquared);
    if (resultVal === a) {
      return result;
    }
    return null;
  }

  // For other primes, use Tonelli-Shanks (not needed for BN254/BLS12-381)
  throw new ZkAccelerateError(
    'Tonelli-Shanks not implemented for this prime',
    ErrorCode.INTERNAL_ERROR,
    { modulus: p.toString() }
  );
}

/**
 * Serialize a curve point in Arkworks compressed format
 *
 * Format: x-coordinate (little-endian, Montgomery) + flags byte
 * Flags: bit 6 = infinity, bit 7 = y is lexicographically largest
 *
 * @param point - The affine point to serialize
 * @param curve - The curve configuration
 * @returns The serialized bytes in Arkworks compressed format
 *
 * Requirements: 11.1
 */
export function serializePointArkworks(point: AffinePoint, curve: CurveConfig): Uint8Array {
  const fieldByteSize = getArkworksFieldByteSize(curve.field);
  const bytes = new Uint8Array(fieldByteSize + 1); // x-coordinate + flags byte

  // Handle identity point
  if (isAffineIdentity(point)) {
    // All zeros for x, with infinity flag set
    bytes[fieldByteSize] = ARKWORKS_INFINITY_FLAG;
    return bytes;
  }

  // Serialize x-coordinate in Montgomery form, little-endian
  const xValue = getFieldElementValue(point.x);
  const xMont = toMontgomery(xValue, curve.field);
  let v = xMont;
  for (let i = 0; i < fieldByteSize; i++) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }

  // Set flags byte
  let flags = 0;
  const yValue = getFieldElementValue(point.y);
  if (isYLargest(yValue, curve.field.modulus)) {
    flags |= ARKWORKS_Y_FLAG;
  }
  bytes[fieldByteSize] = flags;

  return bytes;
}

/**
 * Deserialize a curve point from Arkworks compressed format
 *
 * @param bytes - The bytes in Arkworks compressed format
 * @param curve - The curve configuration
 * @returns The deserialized affine point
 *
 * Requirements: 11.2
 */
export function deserializePointArkworks(bytes: Uint8Array, curve: CurveConfig): AffinePoint {
  const fieldByteSize = getArkworksFieldByteSize(curve.field);
  const expectedSize = fieldByteSize + 1;

  if (bytes.length !== expectedSize) {
    throw new ZkAccelerateError(
      'Invalid Arkworks point byte length',
      ErrorCode.INVALID_CURVE_POINT,
      { expected: expectedSize, actual: bytes.length, curve: curve.name }
    );
  }

  const flags = bytes[fieldByteSize]!;

  // Check for infinity
  if ((flags & ARKWORKS_INFINITY_FLAG) !== 0) {
    return createAffineIdentity(curve);
  }

  // Parse x-coordinate (little-endian, Montgomery form)
  let xMont = 0n;
  for (let i = fieldByteSize - 1; i >= 0; i--) {
    xMont = (xMont << 8n) | BigInt(bytes[i]!);
  }

  // Validate x is in field
  if (xMont >= curve.field.modulus) {
    throw new ZkAccelerateError(
      'X-coordinate exceeds field modulus',
      ErrorCode.INVALID_CURVE_POINT,
      { x: xMont.toString(), modulus: curve.field.modulus.toString(), curve: curve.name }
    );
  }

  // Convert from Montgomery form
  const xValue = fromMontgomery(xMont, curve.field);
  const x = createFieldElement(xValue, curve.field);

  // Compute y² = x³ + ax + b
  const x2 = fieldSquare(x);
  const x3 = fieldMul(x2, x);
  const ax = fieldMul(curve.a, x);
  const y2 = fieldAdd(fieldAdd(x3, ax), curve.b);

  // Compute y = sqrt(y²)
  const y = modSqrt(y2, curve);
  if (y === null) {
    throw new ZkAccelerateError(
      'No valid y-coordinate exists for this x-coordinate',
      ErrorCode.INVALID_CURVE_POINT,
      { x: xValue.toString(), curve: curve.name }
    );
  }

  // Select correct y based on flags
  const yValue = getFieldElementValue(y);
  const yIsLargest = isYLargest(yValue, curve.field.modulus);
  const wantLargest = (flags & ARKWORKS_Y_FLAG) !== 0;

  let finalY: FieldElement;
  if (yIsLargest === wantLargest) {
    finalY = y;
  } else {
    // Use the other root: p - y
    finalY = createFieldElement(curve.field.modulus - yValue, curve.field);
  }

  const point: AffinePoint = {
    x,
    y: finalY,
    isInfinity: false,
  };

  // Verify the point is on the curve
  if (!isOnCurve(point, curve)) {
    throw new ZkAccelerateError(
      'Deserialized point is not on the curve',
      ErrorCode.INVALID_CURVE_POINT,
      { x: xValue.toString(), y: getFieldElementValue(finalY).toString(), curve: curve.name }
    );
  }

  return point;
}

/**
 * Serialize a curve point in Arkworks uncompressed format
 *
 * Format: x-coordinate (little-endian, Montgomery) + y-coordinate (little-endian, Montgomery) + flags byte
 * Flags: bit 6 = infinity
 *
 * @param point - The affine point to serialize
 * @param curve - The curve configuration
 * @returns The serialized bytes in Arkworks uncompressed format
 *
 * Requirements: 11.1
 */
export function serializePointArkworksUncompressed(
  point: AffinePoint,
  curve: CurveConfig
): Uint8Array {
  const fieldByteSize = getArkworksFieldByteSize(curve.field);
  const bytes = new Uint8Array(2 * fieldByteSize + 1); // x + y + flags byte

  // Handle identity point
  if (isAffineIdentity(point)) {
    // All zeros for x and y, with infinity flag set
    bytes[2 * fieldByteSize] = ARKWORKS_INFINITY_FLAG;
    return bytes;
  }

  // Serialize x-coordinate in Montgomery form, little-endian
  const xValue = getFieldElementValue(point.x);
  const xMont = toMontgomery(xValue, curve.field);
  let v = xMont;
  for (let i = 0; i < fieldByteSize; i++) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }

  // Serialize y-coordinate in Montgomery form, little-endian
  const yValue = getFieldElementValue(point.y);
  const yMont = toMontgomery(yValue, curve.field);
  v = yMont;
  for (let i = 0; i < fieldByteSize; i++) {
    bytes[fieldByteSize + i] = Number(v & 0xffn);
    v >>= 8n;
  }

  // Flags byte is 0 for non-infinity points in uncompressed format
  bytes[2 * fieldByteSize] = 0;

  return bytes;
}

/**
 * Deserialize a curve point from Arkworks uncompressed format
 *
 * @param bytes - The bytes in Arkworks uncompressed format
 * @param curve - The curve configuration
 * @returns The deserialized affine point
 *
 * Requirements: 11.2
 */
export function deserializePointArkworksUncompressed(
  bytes: Uint8Array,
  curve: CurveConfig
): AffinePoint {
  const fieldByteSize = getArkworksFieldByteSize(curve.field);
  const expectedSize = 2 * fieldByteSize + 1;

  if (bytes.length !== expectedSize) {
    throw new ZkAccelerateError(
      'Invalid Arkworks uncompressed point byte length',
      ErrorCode.INVALID_CURVE_POINT,
      { expected: expectedSize, actual: bytes.length, curve: curve.name }
    );
  }

  const flags = bytes[2 * fieldByteSize]!;

  // Check for infinity
  if ((flags & ARKWORKS_INFINITY_FLAG) !== 0) {
    return createAffineIdentity(curve);
  }

  // Parse x-coordinate (little-endian, Montgomery form)
  let xMont = 0n;
  for (let i = fieldByteSize - 1; i >= 0; i--) {
    xMont = (xMont << 8n) | BigInt(bytes[i]!);
  }

  // Parse y-coordinate (little-endian, Montgomery form)
  let yMont = 0n;
  for (let i = 2 * fieldByteSize - 1; i >= fieldByteSize; i--) {
    yMont = (yMont << 8n) | BigInt(bytes[i]!);
  }

  // Validate coordinates are in field
  if (xMont >= curve.field.modulus) {
    throw new ZkAccelerateError(
      'X-coordinate exceeds field modulus',
      ErrorCode.INVALID_CURVE_POINT,
      { x: xMont.toString(), modulus: curve.field.modulus.toString(), curve: curve.name }
    );
  }
  if (yMont >= curve.field.modulus) {
    throw new ZkAccelerateError(
      'Y-coordinate exceeds field modulus',
      ErrorCode.INVALID_CURVE_POINT,
      { y: yMont.toString(), modulus: curve.field.modulus.toString(), curve: curve.name }
    );
  }

  // Convert from Montgomery form
  const xValue = fromMontgomery(xMont, curve.field);
  const yValue = fromMontgomery(yMont, curve.field);

  const point: AffinePoint = {
    x: createFieldElement(xValue, curve.field),
    y: createFieldElement(yValue, curve.field),
    isInfinity: false,
  };

  // Verify the point is on the curve
  if (!isOnCurve(point, curve)) {
    throw new ZkAccelerateError(
      'Deserialized point is not on the curve',
      ErrorCode.INVALID_CURVE_POINT,
      { x: xValue.toString(), y: yValue.toString(), curve: curve.name }
    );
  }

  return point;
}

/**
 * Arkworks adapter interface for compatibility with design.md
 */
export const ArkworksAdapter = {
  /**
   * Serialize a curve point in Arkworks format (compressed)
   */
  serializePoint: serializePointArkworks,

  /**
   * Deserialize a curve point from Arkworks format (compressed)
   */
  deserializePoint: deserializePointArkworks,

  /**
   * Serialize a field element in Arkworks format
   */
  serializeFieldElement: serializeFieldElementArkworks,

  /**
   * Deserialize a field element from Arkworks format
   */
  deserializeFieldElement: deserializeFieldElementArkworks,
};
