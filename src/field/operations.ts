/**
 * Field Arithmetic Operations
 *
 * This module provides core field arithmetic operations including addition,
 * subtraction, multiplication, negation, and inversion. Operations use
 * standard modular arithmetic in the pure TypeScript implementation.
 * Native code will use Montgomery representation for efficiency.
 *
 * Requirements: 1.1, 1.3, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type { FieldConfig, FieldElement } from '../types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import {
  limbsToBigint,
  createZeroFieldElement,
  createOneFieldElement,
  isZeroFieldElement,
} from './element.js';

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
 * Create a field element from a value (internal use)
 */
function createFromValue(value: bigint, field: FieldConfig): FieldElement {
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
 * Field addition: (a + b) mod p
 *
 * @param a - First operand
 * @param b - Second operand
 * @returns The sum a + b in the field
 */
export function fieldAdd(a: FieldElement, b: FieldElement): FieldElement {
  if (a.field.modulus !== b.field.modulus) {
    throw new ZkAccelerateError(
      'Cannot add field elements with different moduli',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { modulusA: a.field.modulus.toString(), modulusB: b.field.modulus.toString() }
    );
  }

  const aVal = limbsToBigint(a.limbs);
  const bVal = limbsToBigint(b.limbs);

  let sum = aVal + bVal;
  if (sum >= a.field.modulus) {
    sum -= a.field.modulus;
  }

  return createFromValue(sum, a.field);
}

/**
 * Field subtraction: (a - b) mod p
 *
 * @param a - First operand
 * @param b - Second operand
 * @returns The difference a - b in the field
 */
export function fieldSub(a: FieldElement, b: FieldElement): FieldElement {
  if (a.field.modulus !== b.field.modulus) {
    throw new ZkAccelerateError(
      'Cannot subtract field elements with different moduli',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { modulusA: a.field.modulus.toString(), modulusB: b.field.modulus.toString() }
    );
  }

  const aVal = limbsToBigint(a.limbs);
  const bVal = limbsToBigint(b.limbs);

  let diff = aVal - bVal;
  if (diff < 0n) {
    diff += a.field.modulus;
  }

  return createFromValue(diff, a.field);
}

/**
 * Field negation: -a mod p
 *
 * @param a - The operand
 * @returns The negation -a in the field
 */
export function fieldNeg(a: FieldElement): FieldElement {
  if (isZeroFieldElement(a)) {
    return createZeroFieldElement(a.field);
  }

  const aVal = limbsToBigint(a.limbs);
  const neg = a.field.modulus - aVal;

  return createFromValue(neg, a.field);
}

/**
 * Field multiplication: (a * b) mod p
 *
 * @param a - First operand
 * @param b - Second operand
 * @returns The product a * b in the field
 */
export function fieldMul(a: FieldElement, b: FieldElement): FieldElement {
  if (a.field.modulus !== b.field.modulus) {
    throw new ZkAccelerateError(
      'Cannot multiply field elements with different moduli',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { modulusA: a.field.modulus.toString(), modulusB: b.field.modulus.toString() }
    );
  }

  const aVal = limbsToBigint(a.limbs);
  const bVal = limbsToBigint(b.limbs);

  const product = (aVal * bVal) % a.field.modulus;

  return createFromValue(product, a.field);
}

/**
 * Field squaring: a² mod p
 *
 * Optimized squaring operation (can be faster than general multiplication).
 *
 * @param a - The operand
 * @returns The square a² in the field
 */
export function fieldSquare(a: FieldElement): FieldElement {
  const aVal = limbsToBigint(a.limbs);
  const square = (aVal * aVal) % a.field.modulus;
  return createFromValue(square, a.field);
}

/**
 * Extended Euclidean algorithm for computing modular inverse
 *
 * Returns (gcd, x, y) such that a*x + b*y = gcd
 */
function extendedGcd(a: bigint, b: bigint): { gcd: bigint; x: bigint; y: bigint } {
  if (a === 0n) {
    return { gcd: b, x: 0n, y: 1n };
  }

  const { gcd, x: x1, y: y1 } = extendedGcd(b % a, a);
  const x = y1 - (b / a) * x1;
  const y = x1;

  return { gcd, x, y };
}

/**
 * Field inversion: a^(-1) mod p
 *
 * Uses the extended Euclidean algorithm to compute the modular inverse.
 *
 * @param a - The operand (must be non-zero)
 * @returns The inverse a^(-1) in the field
 * @throws ZkAccelerateError if a is zero
 */
export function fieldInv(a: FieldElement): FieldElement {
  if (isZeroFieldElement(a)) {
    throw new ZkAccelerateError(
      'Cannot compute inverse of zero element',
      ErrorCode.DIVISION_BY_ZERO
    );
  }

  const aVal = limbsToBigint(a.limbs);

  // Compute inverse using extended Euclidean algorithm
  const { gcd, x } = extendedGcd(aVal, a.field.modulus);

  if (gcd !== 1n) {
    throw new ZkAccelerateError(
      'No modular inverse exists',
      ErrorCode.INTERNAL_ERROR,
      { value: aVal.toString(), modulus: a.field.modulus.toString() }
    );
  }

  // Normalize x to be positive
  let inv = x % a.field.modulus;
  if (inv < 0n) {
    inv += a.field.modulus;
  }

  return createFromValue(inv, a.field);
}

/**
 * Field division: a / b mod p
 *
 * Computes a * b^(-1) mod p.
 *
 * @param a - Numerator
 * @param b - Denominator (must be non-zero)
 * @returns The quotient a / b in the field
 * @throws ZkAccelerateError if b is zero
 */
export function fieldDiv(a: FieldElement, b: FieldElement): FieldElement {
  const bInv = fieldInv(b);
  return fieldMul(a, bInv);
}

/**
 * Field exponentiation: a^exp mod p
 *
 * Uses square-and-multiply algorithm for efficient exponentiation.
 *
 * @param a - The base
 * @param exp - The exponent (non-negative bigint)
 * @returns a^exp in the field
 */
export function fieldPow(a: FieldElement, exp: bigint): FieldElement {
  if (exp < 0n) {
    throw new ZkAccelerateError(
      'Exponent must be non-negative',
      ErrorCode.INVALID_FIELD_ELEMENT,
      { exponent: exp.toString() }
    );
  }

  if (exp === 0n) {
    return createOneFieldElement(a.field);
  }

  if (exp === 1n) {
    return { limbs: new BigUint64Array(a.limbs), field: a.field };
  }

  let result = createOneFieldElement(a.field);
  let base: FieldElement = { limbs: new BigUint64Array(a.limbs), field: a.field };
  let e = exp;

  while (e > 0n) {
    if (e % 2n === 1n) {
      result = fieldMul(result, base);
    }
    base = fieldSquare(base);
    e = e / 2n;
  }

  return result;
}

/**
 * Batch inversion using Montgomery's trick
 *
 * Computes the inverses of multiple field elements using only 3n-3
 * multiplications and 1 inversion, instead of n inversions.
 *
 * Algorithm:
 * 1. Compute prefix products: p[i] = a[0] * a[1] * ... * a[i]
 * 2. Compute inverse of final product: inv = p[n-1]^(-1)
 * 3. Compute individual inverses by working backwards:
 *    a[i]^(-1) = inv * p[i-1]
 *    inv = inv * a[i]
 *
 * @param elements - Array of field elements to invert (all must be non-zero)
 * @returns Array of inverses in the same order
 * @throws ZkAccelerateError if any element is zero
 */
export function batchInv(elements: FieldElement[]): FieldElement[] {
  if (elements.length === 0) {
    return [];
  }

  if (elements.length === 1) {
    return [fieldInv(elements[0]!)];
  }

  const firstElem = elements[0]!;
  const field = firstElem.field;

  // Check all elements are from the same field and non-zero
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i]!;
    if (elem.field.modulus !== field.modulus) {
      throw new ZkAccelerateError(
        'All elements must be from the same field',
        ErrorCode.INVALID_FIELD_ELEMENT,
        { index: i }
      );
    }
    if (isZeroFieldElement(elem)) {
      throw new ZkAccelerateError(
        'Cannot compute inverse of zero element',
        ErrorCode.DIVISION_BY_ZERO,
        { index: i }
      );
    }
  }

  const n = elements.length;

  // Step 1: Compute prefix products
  const prefixProducts: FieldElement[] = new Array(n);
  const firstElement = elements[0]!;
  prefixProducts[0] = { limbs: new BigUint64Array(firstElement.limbs), field };

  for (let i = 1; i < n; i++) {
    const prev = prefixProducts[i - 1]!;
    const curr = elements[i]!;
    prefixProducts[i] = fieldMul(prev, curr);
  }

  // Step 2: Compute inverse of final product
  let inv = fieldInv(prefixProducts[n - 1]!);

  // Step 3: Compute individual inverses
  const inverses: FieldElement[] = new Array(n);

  for (let i = n - 1; i > 0; i--) {
    // a[i]^(-1) = inv * p[i-1]
    inverses[i] = fieldMul(inv, prefixProducts[i - 1]!);
    // Update inv = inv * a[i]
    inv = fieldMul(inv, elements[i]!);
  }

  // First element's inverse is just the accumulated inverse
  inverses[0] = inv;

  return inverses as FieldElement[];
}

/**
 * Batch multiplication
 *
 * Multiplies pairs of field elements.
 *
 * @param pairs - Array of [a, b] pairs to multiply
 * @returns Array of products a * b
 */
export function batchMul(pairs: [FieldElement, FieldElement][]): FieldElement[] {
  return pairs.map(([a, b]) => fieldMul(a!, b!));
}

/**
 * Batch addition
 *
 * Adds pairs of field elements.
 *
 * @param pairs - Array of [a, b] pairs to add
 * @returns Array of sums a + b
 */
export function batchAdd(pairs: [FieldElement, FieldElement][]): FieldElement[] {
  return pairs.map(([a, b]) => fieldAdd(a!, b!));
}
