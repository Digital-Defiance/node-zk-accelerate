/**
 * Field Element Implementation
 *
 * This module provides field element creation and manipulation functions.
 * Field elements are stored directly as bigint values (not Montgomery form)
 * for simplicity in the pure TypeScript implementation. Native code will
 * use Montgomery representation for efficiency.
 *
 * Requirements: 4.1, 14.2
 */

import type { FieldConfig, FieldElement } from '../types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';

/**
 * Convert a bigint value to limbs (little-endian)
 */
function bigintToLimbs(value: bigint, limbCount: number): BigUint64Array {
  const limbs = new BigUint64Array(limbCount);
  const mask = (1n << 64n) - 1n;

  let v = value;
  for (let i = 0; i < limbCount; i++) {
    limbs[i] = v & mask;
    v >>= 64n;
  }

  return limbs;
}

/**
 * Convert limbs to bigint (little-endian)
 */
export function limbsToBigint(limbs: BigUint64Array): bigint {
  let result = 0n;
  for (let i = limbs.length - 1; i >= 0; i--) {
    const limb = limbs[i];
    if (limb !== undefined) {
      result = (result << 64n) | limb;
    }
  }
  return result;
}

/**
 * Create a field element from a bigint value
 *
 * The value is automatically reduced modulo the field modulus.
 *
 * @param value - The bigint value (can be any size, will be reduced)
 * @param field - The field configuration
 * @returns A new field element
 */
export function createFieldElement(value: bigint, field: FieldConfig): FieldElement {
  // Reduce value modulo the field modulus
  let reduced = value % field.modulus;
  if (reduced < 0n) {
    reduced += field.modulus;
  }

  return {
    limbs: bigintToLimbs(reduced, field.limbCount),
    field,
  };
}

/**
 * Create a field element from a Uint8Array
 *
 * @param bytes - The byte array
 * @param field - The field configuration
 * @param endian - Byte order ('be' for big-endian, 'le' for little-endian)
 * @returns A new field element
 * @throws ZkAccelerateError if the value exceeds the modulus
 */
export function createFieldElementFromBytes(
  bytes: Uint8Array,
  field: FieldConfig,
  endian: 'be' | 'le' = 'be'
): FieldElement {
  let value = 0n;

  if (endian === 'be') {
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8n) | BigInt(bytes[i]!);
    }
  } else {
    for (let i = bytes.length - 1; i >= 0; i--) {
      value = (value << 8n) | BigInt(bytes[i]!);
    }
  }

  // Validate that value is within field
  if (value >= field.modulus) {
    throw new ZkAccelerateError(
      'Field element exceeds modulus',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { value: value.toString(), modulus: field.modulus.toString() }
    );
  }

  return createFieldElement(value, field);
}

/**
 * Create a field element from a hex string
 *
 * @param hex - The hex string (with or without '0x' prefix)
 * @param field - The field configuration
 * @returns A new field element
 * @throws ZkAccelerateError if the value exceeds the modulus
 */
export function createFieldElementFromHex(hex: string, field: FieldConfig): FieldElement {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const value = BigInt('0x' + cleanHex);

  if (value >= field.modulus) {
    throw new ZkAccelerateError(
      'Field element exceeds modulus',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { value: value.toString(), modulus: field.modulus.toString() }
    );
  }

  return createFieldElement(value, field);
}

/**
 * Create the zero element for a field
 */
export function createZeroFieldElement(field: FieldConfig): FieldElement {
  return {
    limbs: new BigUint64Array(field.limbCount),
    field,
  };
}

/**
 * Create the one element (multiplicative identity) for a field
 */
export function createOneFieldElement(field: FieldConfig): FieldElement {
  return {
    limbs: bigintToLimbs(1n, field.limbCount),
    field,
  };
}

/**
 * Get the bigint value of a field element
 */
export function getFieldElementValue(element: FieldElement): bigint {
  return limbsToBigint(element.limbs);
}

/**
 * Check if a field element is zero
 */
export function isZeroFieldElement(element: FieldElement): boolean {
  for (let i = 0; i < element.limbs.length; i++) {
    if (element.limbs[i] !== 0n) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a field element is one
 */
export function isOneFieldElement(element: FieldElement): boolean {
  const value = limbsToBigint(element.limbs);
  return value === 1n;
}

/**
 * Check if two field elements are equal
 */
export function fieldElementsEqual(a: FieldElement, b: FieldElement): boolean {
  if (a.field.modulus !== b.field.modulus) {
    return false;
  }

  if (a.limbs.length !== b.limbs.length) {
    return false;
  }

  for (let i = 0; i < a.limbs.length; i++) {
    if (a.limbs[i] !== b.limbs[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Clone a field element
 */
export function cloneFieldElement(element: FieldElement): FieldElement {
  return {
    limbs: new BigUint64Array(element.limbs),
    field: element.field,
  };
}
