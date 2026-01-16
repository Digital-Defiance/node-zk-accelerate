/**
 * Field Element Serialization
 *
 * This module provides serialization and deserialization functions for
 * field elements, supporting both big-endian and little-endian byte orders.
 *
 * Requirements: 4.7, 4.8
 */

import type { FieldConfig, FieldElement, Endianness } from '../types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import {
  createFieldElement,
  getFieldElementValue,
} from './element.js';

/**
 * Calculate the byte size needed for a field element
 */
export function getFieldByteSize(field: FieldConfig): number {
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
 * Serialize a field element to bytes
 *
 * @param element - The field element to serialize
 * @param endian - Byte order ('be' for big-endian, 'le' for little-endian)
 * @returns The serialized bytes
 */
export function fieldElementToBytes(element: FieldElement, endian: Endianness = 'be'): Uint8Array {
  const value = getFieldElementValue(element);
  const byteSize = getFieldByteSize(element.field);
  const bytes = new Uint8Array(byteSize);

  let v = value;
  if (endian === 'le') {
    // Little-endian: LSB first
    for (let i = 0; i < byteSize; i++) {
      bytes[i] = Number(v & 0xffn);
      v >>= 8n;
    }
  } else {
    // Big-endian: MSB first
    for (let i = byteSize - 1; i >= 0; i--) {
      bytes[i] = Number(v & 0xffn);
      v >>= 8n;
    }
  }

  return bytes;
}

/**
 * Deserialize bytes to a field element
 *
 * @param bytes - The bytes to deserialize
 * @param field - The field configuration
 * @param endian - Byte order ('be' for big-endian, 'le' for little-endian)
 * @returns The deserialized field element
 * @throws ZkAccelerateError if the value exceeds the modulus
 */
export function fieldElementFromBytes(
  bytes: Uint8Array,
  field: FieldConfig,
  endian: Endianness = 'be'
): FieldElement {
  let value = 0n;

  if (endian === 'be') {
    // Big-endian: MSB first
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8n) | BigInt(bytes[i]!);
    }
  } else {
    // Little-endian: LSB first
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
 * Serialize a field element to a hex string
 *
 * @param element - The field element to serialize
 * @param prefix - Whether to include '0x' prefix
 * @returns The hex string representation
 */
export function fieldElementToHex(element: FieldElement, prefix: boolean = true): string {
  const value = getFieldElementValue(element);
  const byteSize = getFieldByteSize(element.field);
  const hex = value.toString(16).padStart(byteSize * 2, '0');
  return prefix ? '0x' + hex : hex;
}

/**
 * Deserialize a hex string to a field element
 *
 * @param hex - The hex string (with or without '0x' prefix)
 * @param field - The field configuration
 * @returns The deserialized field element
 * @throws ZkAccelerateError if the value exceeds the modulus
 */
export function fieldElementFromHex(hex: string, field: FieldConfig): FieldElement {
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
 * Serialize multiple field elements to bytes
 *
 * @param elements - The field elements to serialize
 * @param endian - Byte order
 * @returns Concatenated serialized bytes
 */
export function fieldElementsToBytes(elements: FieldElement[], endian: Endianness = 'be'): Uint8Array {
  if (elements.length === 0) {
    return new Uint8Array(0);
  }

  const firstElement = elements[0]!;
  const byteSize = getFieldByteSize(firstElement.field);
  const result = new Uint8Array(elements.length * byteSize);

  for (let i = 0; i < elements.length; i++) {
    const bytes = fieldElementToBytes(elements[i]!, endian);
    result.set(bytes, i * byteSize);
  }

  return result;
}

/**
 * Deserialize bytes to multiple field elements
 *
 * @param bytes - The bytes to deserialize
 * @param field - The field configuration
 * @param endian - Byte order
 * @returns Array of deserialized field elements
 */
export function fieldElementsFromBytes(
  bytes: Uint8Array,
  field: FieldConfig,
  endian: Endianness = 'be'
): FieldElement[] {
  const byteSize = getFieldByteSize(field);

  if (bytes.length % byteSize !== 0) {
    throw new ZkAccelerateError(
      'Byte array length must be a multiple of field element size',
      ErrorCode.INVALID_INPUT_SIZE,
      { byteLength: bytes.length, elementSize: byteSize }
    );
  }

  const count = bytes.length / byteSize;
  const elements: FieldElement[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const elementBytes = bytes.slice(i * byteSize, (i + 1) * byteSize);
    elements[i] = fieldElementFromBytes(elementBytes, field, endian);
  }

  return elements as FieldElement[];
}
