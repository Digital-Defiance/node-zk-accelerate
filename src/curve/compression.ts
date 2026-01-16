/**
 * Point Compression and Decompression
 *
 * This module provides functions for compressing and decompressing elliptic
 * curve points. Compression stores only the x-coordinate and a single bit
 * indicating the parity of the y-coordinate.
 *
 * Requirements: 5.5, 5.6
 */

import type { AffinePoint, CurveConfig, FieldElement } from '../types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import {
  createFieldElement,
  getFieldElementValue,
} from '../field/element.js';
import { fieldAdd, fieldMul, fieldSquare, fieldPow } from '../field/operations.js';
import { createAffineIdentity, isAffineIdentity } from './point.js';
import { isOnCurve } from './operations.js';

/**
 * Compute the modular square root using Tonelli-Shanks algorithm
 *
 * For primes p ≡ 3 (mod 4), we can use the simpler formula:
 * sqrt(a) = a^((p+1)/4) mod p
 *
 * Both BN254 and BLS12-381 base field primes satisfy p ≡ 3 (mod 4)
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
 * Get the byte length needed for a field element
 */
function getFieldByteLength(curve: CurveConfig): number {
  // Calculate bytes needed for the modulus
  const modulus = curve.field.modulus;
  let bits = 0n;
  let temp = modulus;
  while (temp > 0n) {
    bits++;
    temp >>= 1n;
  }
  return Math.ceil(Number(bits) / 8);
}

/**
 * Compress a curve point
 *
 * Format:
 * - For identity: single byte 0x00
 * - For regular points: prefix byte (0x02 for even y, 0x03 for odd y) + x-coordinate
 *
 * Requirements: 5.5
 */
export function compressPoint(point: AffinePoint, curve: CurveConfig): Uint8Array {
  // Handle identity point
  if (isAffineIdentity(point)) {
    return new Uint8Array([0x00]);
  }

  const fieldByteLen = getFieldByteLength(curve);
  const result = new Uint8Array(1 + fieldByteLen);

  // Get y-coordinate value to determine parity
  const yValue = getFieldElementValue(point.y);
  const isOdd = yValue % 2n === 1n;

  // Set prefix byte: 0x02 for even y, 0x03 for odd y
  result[0] = isOdd ? 0x03 : 0x02;

  // Serialize x-coordinate in big-endian
  const xValue = getFieldElementValue(point.x);
  let temp = xValue;
  for (let i = fieldByteLen; i > 0; i--) {
    result[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }

  return result;
}

/**
 * Decompress a curve point
 *
 * Recovers the y-coordinate from the x-coordinate using the curve equation:
 * y² = x³ + ax + b
 *
 * Requirements: 5.6
 */
export function decompressPoint(bytes: Uint8Array, curve: CurveConfig): AffinePoint {
  if (bytes.length === 0) {
    throw new ZkAccelerateError(
      'Empty compressed point data',
      ErrorCode.INVALID_CURVE_POINT,
      { curve: curve.name }
    );
  }

  // Handle identity point
  if (bytes.length === 1 && bytes[0] === 0x00) {
    return createAffineIdentity(curve);
  }

  const prefix = bytes[0];
  if (prefix !== 0x02 && prefix !== 0x03) {
    throw new ZkAccelerateError(
      'Invalid compressed point prefix',
      ErrorCode.INVALID_CURVE_POINT,
      { prefix: prefix?.toString(16), curve: curve.name }
    );
  }

  const fieldByteLen = getFieldByteLength(curve);
  if (bytes.length !== 1 + fieldByteLen) {
    throw new ZkAccelerateError(
      'Invalid compressed point length',
      ErrorCode.INVALID_CURVE_POINT,
      { expected: 1 + fieldByteLen, actual: bytes.length, curve: curve.name }
    );
  }

  // Parse x-coordinate (big-endian)
  let xValue = 0n;
  for (let i = 1; i < bytes.length; i++) {
    xValue = (xValue << 8n) | BigInt(bytes[i]!);
  }

  // Validate x is in field
  if (xValue >= curve.field.modulus) {
    throw new ZkAccelerateError(
      'X-coordinate exceeds field modulus',
      ErrorCode.INVALID_CURVE_POINT,
      { x: xValue.toString(), modulus: curve.field.modulus.toString(), curve: curve.name }
    );
  }

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

  // Select correct y based on parity
  const yValue = getFieldElementValue(y);
  const yIsOdd = yValue % 2n === 1n;
  const wantOdd = prefix === 0x03;

  let finalY: FieldElement;
  if (yIsOdd === wantOdd) {
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
      'Decompressed point is not on the curve',
      ErrorCode.INVALID_CURVE_POINT,
      { x: xValue.toString(), y: getFieldElementValue(finalY).toString(), curve: curve.name }
    );
  }

  return point;
}

/**
 * Serialize a point in uncompressed format
 *
 * Format:
 * - For identity: single byte 0x00
 * - For regular points: prefix byte 0x04 + x-coordinate + y-coordinate
 */
export function serializePointUncompressed(point: AffinePoint, curve: CurveConfig): Uint8Array {
  // Handle identity point
  if (isAffineIdentity(point)) {
    return new Uint8Array([0x00]);
  }

  const fieldByteLen = getFieldByteLength(curve);
  const result = new Uint8Array(1 + 2 * fieldByteLen);

  // Set prefix byte for uncompressed
  result[0] = 0x04;

  // Serialize x-coordinate in big-endian
  const xValue = getFieldElementValue(point.x);
  let temp = xValue;
  for (let i = fieldByteLen; i > 0; i--) {
    result[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }

  // Serialize y-coordinate in big-endian
  const yValue = getFieldElementValue(point.y);
  temp = yValue;
  for (let i = 2 * fieldByteLen; i > fieldByteLen; i--) {
    result[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }

  return result;
}

/**
 * Deserialize a point from uncompressed format
 */
export function deserializePointUncompressed(bytes: Uint8Array, curve: CurveConfig): AffinePoint {
  if (bytes.length === 0) {
    throw new ZkAccelerateError(
      'Empty point data',
      ErrorCode.INVALID_CURVE_POINT,
      { curve: curve.name }
    );
  }

  // Handle identity point
  if (bytes.length === 1 && bytes[0] === 0x00) {
    return createAffineIdentity(curve);
  }

  const prefix = bytes[0];
  if (prefix !== 0x04) {
    throw new ZkAccelerateError(
      'Invalid uncompressed point prefix',
      ErrorCode.INVALID_CURVE_POINT,
      { prefix: prefix?.toString(16), curve: curve.name }
    );
  }

  const fieldByteLen = getFieldByteLength(curve);
  if (bytes.length !== 1 + 2 * fieldByteLen) {
    throw new ZkAccelerateError(
      'Invalid uncompressed point length',
      ErrorCode.INVALID_CURVE_POINT,
      { expected: 1 + 2 * fieldByteLen, actual: bytes.length, curve: curve.name }
    );
  }

  // Parse x-coordinate (big-endian)
  let xValue = 0n;
  for (let i = 1; i <= fieldByteLen; i++) {
    xValue = (xValue << 8n) | BigInt(bytes[i]!);
  }

  // Parse y-coordinate (big-endian)
  let yValue = 0n;
  for (let i = fieldByteLen + 1; i <= 2 * fieldByteLen; i++) {
    yValue = (yValue << 8n) | BigInt(bytes[i]!);
  }

  // Validate coordinates are in field
  if (xValue >= curve.field.modulus) {
    throw new ZkAccelerateError(
      'X-coordinate exceeds field modulus',
      ErrorCode.INVALID_CURVE_POINT,
      { x: xValue.toString(), modulus: curve.field.modulus.toString(), curve: curve.name }
    );
  }
  if (yValue >= curve.field.modulus) {
    throw new ZkAccelerateError(
      'Y-coordinate exceeds field modulus',
      ErrorCode.INVALID_CURVE_POINT,
      { y: yValue.toString(), modulus: curve.field.modulus.toString(), curve: curve.name }
    );
  }

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
