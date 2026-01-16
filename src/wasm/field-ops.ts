/**
 * @digitaldefiance/node-zk-accelerate
 * WASM Fallback - Field Operations
 *
 * Pure JavaScript implementations of finite field arithmetic
 * for use when native bindings are unavailable.
 *
 * Requirements: 13.5, 13.7
 */

import type { FieldConfig, FieldElement } from '../types.js';

/**
 * Convert limbs array to bigint
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
 * Convert a bigint to limbs array
 */
function bigintToLimbs(value: bigint, limbCount: number): BigUint64Array {
  const limbs = new BigUint64Array(limbCount);
  const mask = (1n << 64n) - 1n;

  let remaining = value;
  for (let i = 0; i < limbCount; i++) {
    limbs[i] = remaining & mask;
    remaining >>= 64n;
  }

  return limbs;
}

/**
 * Create a field element from a bigint value
 */
export function createFieldElementFromBigint(value: bigint, field: FieldConfig): FieldElement {
  const normalizedValue = ((value % field.modulus) + field.modulus) % field.modulus;
  return {
    limbs: bigintToLimbs(normalizedValue, field.limbCount),
    field,
  };
}

/**
 * Get the bigint value from a field element
 */
export function getFieldValue(element: FieldElement): bigint {
  return limbsToBigint(element.limbs);
}

/**
 * Add two field elements: result = (a + b) mod p
 */
export function wasmFieldAdd(a: FieldElement, b: FieldElement): FieldElement {
  const field = a.field;
  const aVal = getFieldValue(a);
  const bVal = getFieldValue(b);
  const sum = aVal + bVal;
  const result = sum >= field.modulus ? sum - field.modulus : sum;

  return {
    limbs: bigintToLimbs(result, field.limbCount),
    field,
  };
}

/**
 * Subtract two field elements: result = (a - b) mod p
 */
export function wasmFieldSub(a: FieldElement, b: FieldElement): FieldElement {
  const field = a.field;
  const aVal = getFieldValue(a);
  const bVal = getFieldValue(b);
  let result = aVal - bVal;
  if (result < 0n) {
    result += field.modulus;
  }

  return {
    limbs: bigintToLimbs(result, field.limbCount),
    field,
  };
}

/**
 * Multiply two field elements: result = (a * b) mod p
 */
export function wasmFieldMul(a: FieldElement, b: FieldElement): FieldElement {
  const field = a.field;
  const aVal = getFieldValue(a);
  const bVal = getFieldValue(b);
  const product = (aVal * bVal) % field.modulus;

  return {
    limbs: bigintToLimbs(product, field.limbCount),
    field,
  };
}

/**
 * Negate a field element: result = -a mod p
 */
export function wasmFieldNeg(a: FieldElement): FieldElement {
  const field = a.field;
  const aVal = getFieldValue(a);
  const result = aVal === 0n ? 0n : field.modulus - aVal;

  return {
    limbs: bigintToLimbs(result, field.limbCount),
    field,
  };
}

/**
 * Extended Euclidean algorithm for modular inverse
 */
function modInverse(a: bigint, m: bigint): bigint {
  if (a < 0n) {
    a = ((a % m) + m) % m;
  }

  let [oldR, r] = [a, m];
  let [oldS, s] = [1n, 0n];

  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }

  if (oldR !== 1n) {
    throw new Error('Modular inverse does not exist');
  }

  return ((oldS % m) + m) % m;
}

/**
 * Compute the modular inverse: result = a^(-1) mod p
 * Uses the extended Euclidean algorithm
 */
export function wasmFieldInv(a: FieldElement): FieldElement {
  const field = a.field;
  const aVal = getFieldValue(a);

  if (aVal === 0n) {
    throw new Error('Cannot compute inverse of zero');
  }

  const result = modInverse(aVal, field.modulus);

  return {
    limbs: bigintToLimbs(result, field.limbCount),
    field,
  };
}

/**
 * Batch inversion using Montgomery's trick
 * Computes inverses of multiple elements with only one modular inversion
 */
export function wasmBatchInv(elements: FieldElement[]): FieldElement[] {
  if (elements.length === 0) {
    return [];
  }

  const firstElement = elements[0];
  if (!firstElement) {
    return [];
  }

  const field = firstElement.field;
  const n = elements.length;

  // Get values
  const values: bigint[] = [];
  for (let i = 0; i < n; i++) {
    const elem = elements[i];
    if (!elem) {
      throw new Error(`Element at index ${i} is undefined`);
    }
    values.push(getFieldValue(elem));
  }

  // Check for zeros
  for (let i = 0; i < n; i++) {
    const val = values[i];
    if (val === undefined || val === 0n) {
      throw new Error(`Cannot compute inverse of zero at index ${i}`);
    }
  }

  // Compute prefix products
  const prefixProducts: bigint[] = new Array(n);
  prefixProducts[0] = values[0]!;
  for (let i = 1; i < n; i++) {
    const prev = prefixProducts[i - 1];
    const curr = values[i];
    if (prev !== undefined && curr !== undefined) {
      prefixProducts[i] = (prev * curr) % field.modulus;
    }
  }

  // Compute inverse of the product of all elements
  const lastPrefix = prefixProducts[n - 1];
  if (lastPrefix === undefined) {
    throw new Error('Failed to compute prefix products');
  }
  let invProduct = modInverse(lastPrefix, field.modulus);

  // Compute individual inverses
  const results: FieldElement[] = new Array(n);
  for (let i = n - 1; i > 0; i--) {
    // inv[i] = invProduct * prefixProducts[i-1]
    const prevPrefix = prefixProducts[i - 1];
    if (prevPrefix !== undefined) {
      const inv = (invProduct * prevPrefix) % field.modulus;
      results[i] = {
        limbs: bigintToLimbs(inv, field.limbCount),
        field,
      };
    }
    // Update invProduct for next iteration
    const currVal = values[i];
    if (currVal !== undefined) {
      invProduct = (invProduct * currVal) % field.modulus;
    }
  }
  results[0] = {
    limbs: bigintToLimbs(invProduct, field.limbCount),
    field,
  };

  return results;
}

/**
 * Montgomery multiplication
 * Computes (a * b * R^(-1)) mod p where R = 2^(64*limbCount)
 */
export function wasmMontgomeryMul(
  a: FieldElement,
  b: FieldElement,
  config: FieldConfig
): FieldElement {
  // For WASM fallback, we use standard modular multiplication
  // A full Montgomery implementation would be more complex
  const aVal = getFieldValue(a);
  const bVal = getFieldValue(b);
  const product = (aVal * bVal) % config.modulus;

  return {
    limbs: bigintToLimbs(product, config.limbCount),
    field: config,
  };
}

/**
 * Montgomery reduction
 * Converts from Montgomery form to standard form
 */
export function wasmMontgomeryReduce(a: FieldElement, config: FieldConfig): FieldElement {
  // For WASM fallback, values are already in standard form
  const aVal = getFieldValue(a);
  return {
    limbs: bigintToLimbs(aVal % config.modulus, config.limbCount),
    field: config,
  };
}
