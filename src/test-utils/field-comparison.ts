/**
 * Field element and curve point comparison utilities for testing
 *
 * This module provides utilities for comparing field elements and curve points
 * in property-based tests.
 */

import { expect } from 'vitest';
import { modAdd, modSub, modMul, modNeg, modInverse } from './property-test-config.js';

/**
 * Test representation of a field element
 * Uses bigint directly for simplicity in tests
 */
export interface TestFieldElement {
  value: bigint;
  modulus: bigint;
}

/**
 * Test representation of an affine curve point
 */
export interface TestAffinePoint {
  x: TestFieldElement;
  y: TestFieldElement;
  isInfinity: boolean;
}

/**
 * Create a test field element
 */
export function createFieldElement(value: bigint, modulus: bigint): TestFieldElement {
  return {
    value: ((value % modulus) + modulus) % modulus,
    modulus,
  };
}

/**
 * Create the zero field element
 */
export function createZeroElement(modulus: bigint): TestFieldElement {
  return { value: 0n, modulus };
}

/**
 * Create the one (multiplicative identity) field element
 */
export function createOneElement(modulus: bigint): TestFieldElement {
  return { value: 1n, modulus };
}

/**
 * Check if two field elements are equal
 */
export function fieldElementsEqual(a: TestFieldElement, b: TestFieldElement): boolean {
  if (a.modulus !== b.modulus) {
    return false;
  }
  return a.value === b.value;
}

/**
 * Assert that two field elements are equal
 */
export function assertFieldElementsEqual(
  actual: TestFieldElement,
  expected: TestFieldElement,
  _message?: string
): void {
  expect(actual.modulus).toBe(expected.modulus);
  expect(actual.value).toBe(expected.value);
}

/**
 * Add two field elements
 */
export function addFieldElements(a: TestFieldElement, b: TestFieldElement): TestFieldElement {
  if (a.modulus !== b.modulus) {
    throw new Error('Cannot add field elements with different moduli');
  }
  return createFieldElement(modAdd(a.value, b.value, a.modulus), a.modulus);
}

/**
 * Subtract two field elements
 */
export function subFieldElements(a: TestFieldElement, b: TestFieldElement): TestFieldElement {
  if (a.modulus !== b.modulus) {
    throw new Error('Cannot subtract field elements with different moduli');
  }
  return createFieldElement(modSub(a.value, b.value, a.modulus), a.modulus);
}

/**
 * Multiply two field elements
 */
export function mulFieldElements(a: TestFieldElement, b: TestFieldElement): TestFieldElement {
  if (a.modulus !== b.modulus) {
    throw new Error('Cannot multiply field elements with different moduli');
  }
  return createFieldElement(modMul(a.value, b.value, a.modulus), a.modulus);
}

/**
 * Negate a field element
 */
export function negFieldElement(a: TestFieldElement): TestFieldElement {
  return createFieldElement(modNeg(a.value, a.modulus), a.modulus);
}

/**
 * Compute the multiplicative inverse of a field element
 */
export function invFieldElement(a: TestFieldElement): TestFieldElement {
  return createFieldElement(modInverse(a.value, a.modulus), a.modulus);
}

/**
 * Check if a field element is zero
 */
export function isZeroElement(a: TestFieldElement): boolean {
  return a.value === 0n;
}

/**
 * Check if a field element is one
 */
export function isOneElement(a: TestFieldElement): boolean {
  return a.value === 1n;
}

/**
 * Create the identity point (point at infinity)
 */
export function createIdentityPoint(modulus: bigint): TestAffinePoint {
  return {
    x: createZeroElement(modulus),
    y: createZeroElement(modulus),
    isInfinity: true,
  };
}

/**
 * Create an affine point from coordinates
 */
export function createAffinePoint(
  x: bigint,
  y: bigint,
  modulus: bigint
): TestAffinePoint {
  return {
    x: createFieldElement(x, modulus),
    y: createFieldElement(y, modulus),
    isInfinity: false,
  };
}

/**
 * Check if two affine points are equal
 */
export function affinePointsEqual(a: TestAffinePoint, b: TestAffinePoint): boolean {
  if (a.isInfinity && b.isInfinity) {
    return true;
  }
  if (a.isInfinity !== b.isInfinity) {
    return false;
  }
  return fieldElementsEqual(a.x, b.x) && fieldElementsEqual(a.y, b.y);
}

/**
 * Assert that two affine points are equal
 */
export function assertAffinePointsEqual(
  actual: TestAffinePoint,
  expected: TestAffinePoint,
  message?: string
): void {
  const msg = message ?? 'Expected affine points to be equal';
  if (expected.isInfinity) {
    expect(actual.isInfinity, msg).toBe(true);
  } else {
    expect(actual.isInfinity, msg).toBe(false);
    assertFieldElementsEqual(actual.x, expected.x, `${msg} (x coordinate)`);
    assertFieldElementsEqual(actual.y, expected.y, `${msg} (y coordinate)`);
  }
}

/**
 * Negate an affine point (reflect over x-axis)
 */
export function negAffinePoint(p: TestAffinePoint): TestAffinePoint {
  if (p.isInfinity) {
    return p;
  }
  return {
    x: p.x,
    y: negFieldElement(p.y),
    isInfinity: false,
  };
}

/**
 * Check if a point is on the curve y² = x³ + ax + b
 */
export function isOnCurve(
  point: TestAffinePoint,
  a: bigint,
  b: bigint
): boolean {
  if (point.isInfinity) {
    return true;
  }

  const modulus = point.x.modulus;
  const x = point.x.value;
  const y = point.y.value;

  // y² mod p
  const lhs = modMul(y, y, modulus);

  // x³ + ax + b mod p
  const x2 = modMul(x, x, modulus);
  const x3 = modMul(x2, x, modulus);
  const ax = modMul(a, x, modulus);
  const rhs = modAdd(modAdd(x3, ax, modulus), b, modulus);

  return lhs === rhs;
}

/**
 * Simple point doubling for testing (affine coordinates)
 * Uses the formula for y² = x³ + ax + b
 */
export function doubleAffinePoint(
  p: TestAffinePoint,
  a: bigint
): TestAffinePoint {
  if (p.isInfinity) {
    return p;
  }

  const modulus = p.x.modulus;
  const x = p.x.value;
  const y = p.y.value;

  // If y = 0, result is point at infinity
  if (y === 0n) {
    return createIdentityPoint(modulus);
  }

  // λ = (3x² + a) / (2y)
  const x2 = modMul(x, x, modulus);
  const numerator = modAdd(modMul(3n, x2, modulus), a, modulus);
  const denominator = modMul(2n, y, modulus);
  const lambda = modMul(numerator, modInverse(denominator, modulus), modulus);

  // x' = λ² - 2x
  const lambda2 = modMul(lambda, lambda, modulus);
  const x3 = modSub(lambda2, modMul(2n, x, modulus), modulus);

  // y' = λ(x - x') - y
  const y3 = modSub(modMul(lambda, modSub(x, x3, modulus), modulus), y, modulus);

  return createAffinePoint(x3, y3, modulus);
}

/**
 * Simple point addition for testing (affine coordinates)
 */
export function addAffinePoints(
  p1: TestAffinePoint,
  p2: TestAffinePoint,
  a: bigint
): TestAffinePoint {
  if (p1.isInfinity) {
    return p2;
  }
  if (p2.isInfinity) {
    return p1;
  }

  const modulus = p1.x.modulus;

  // If points are the same, use doubling
  if (fieldElementsEqual(p1.x, p2.x) && fieldElementsEqual(p1.y, p2.y)) {
    return doubleAffinePoint(p1, a);
  }

  // If x coordinates are equal but y coordinates differ, result is infinity
  if (fieldElementsEqual(p1.x, p2.x)) {
    return createIdentityPoint(modulus);
  }

  const x1 = p1.x.value;
  const y1 = p1.y.value;
  const x2 = p2.x.value;
  const y2 = p2.y.value;

  // λ = (y2 - y1) / (x2 - x1)
  const numerator = modSub(y2, y1, modulus);
  const denominator = modSub(x2, x1, modulus);
  const lambda = modMul(numerator, modInverse(denominator, modulus), modulus);

  // x3 = λ² - x1 - x2
  const lambda2 = modMul(lambda, lambda, modulus);
  const x3 = modSub(modSub(lambda2, x1, modulus), x2, modulus);

  // y3 = λ(x1 - x3) - y1
  const y3 = modSub(modMul(lambda, modSub(x1, x3, modulus), modulus), y1, modulus);

  return createAffinePoint(x3, y3, modulus);
}

/**
 * Simple scalar multiplication for testing (double-and-add)
 */
export function scalarMulAffine(
  scalar: bigint,
  point: TestAffinePoint,
  a: bigint
): TestAffinePoint {
  if (scalar === 0n || point.isInfinity) {
    return createIdentityPoint(point.x.modulus);
  }

  let result = createIdentityPoint(point.x.modulus);
  let current = point;
  let s = scalar;

  while (s > 0n) {
    if (s % 2n === 1n) {
      result = addAffinePoints(result, current, a);
    }
    current = doubleAffinePoint(current, a);
    s = s / 2n;
  }

  return result;
}
