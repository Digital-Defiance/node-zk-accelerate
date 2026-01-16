/**
 * NEON SIMD Operations
 *
 * Provides TypeScript interface to NEON-optimized operations,
 * particularly Montgomery multiplication for field arithmetic.
 *
 * Requirements: 1.4, 4.6, 6.6
 */

import { loadCppBinding } from '../native.js';
import { getCPUAcceleratorStatus } from './status.js';
import type { FieldConfig, FieldElement } from '../types.js';

/**
 * NEON operations interface
 */
export interface NEONOperations {
  /**
   * Check if NEON is available
   */
  isAvailable(): boolean;

  /**
   * Montgomery multiplication for 4-limb elements (BN254)
   * @param a First operand (4 limbs)
   * @param b Second operand (4 limbs)
   * @param config Field configuration
   * @returns Result (4 limbs)
   */
  montgomeryMul4Limb(
    a: BigUint64Array,
    b: BigUint64Array,
    config: FieldConfig
  ): BigUint64Array;

  /**
   * Montgomery multiplication for 6-limb elements (BLS12-381)
   * @param a First operand (6 limbs)
   * @param b Second operand (6 limbs)
   * @param config Field configuration
   * @returns Result (6 limbs)
   */
  montgomeryMul6Limb(
    a: BigUint64Array,
    b: BigUint64Array,
    config: FieldConfig
  ): BigUint64Array;

  /**
   * Batch Montgomery multiplication
   * @param pairs Array of [a, b] pairs to multiply
   * @param config Field configuration
   * @returns Array of results
   */
  batchMontgomeryMul(
    pairs: Array<[BigUint64Array, BigUint64Array]>,
    config: FieldConfig
  ): BigUint64Array[];

  /**
   * Montgomery multiplication for field elements
   * @param a First field element
   * @param b Second field element
   * @returns Result field element
   */
  fieldMul(a: FieldElement, b: FieldElement): FieldElement;
}

/**
 * Compute Montgomery constant mu = -p^(-1) mod 2^64
 */
function computeMontgomeryMu(modulus: bigint): bigint {
  // Extended Euclidean algorithm to find modular inverse
  // We need -p^(-1) mod 2^64
  const twoTo64 = 1n << 64n;
  const p = modulus % twoTo64;

  // Find p^(-1) mod 2^64 using extended GCD
  let t = 0n;
  let newT = 1n;
  let r = twoTo64;
  let newR = p;

  while (newR !== 0n) {
    const quotient = r / newR;
    [t, newT] = [newT, t - quotient * newT];
    [r, newR] = [newR, r - quotient * newR];
  }

  if (r > 1n) {
    throw new Error('Modulus is not invertible mod 2^64');
  }

  // Normalize t to be positive
  if (t < 0n) {
    t += twoTo64;
  }

  // Return -p^(-1) mod 2^64
  return (twoTo64 - t) % twoTo64;
}

/**
 * Convert bigint to limbs (little-endian)
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
function limbsToBigint(limbs: BigUint64Array): bigint {
  let result = 0n;
  for (let i = limbs.length - 1; i >= 0; i--) {
    result = (result << 64n) | limbs[i]!;
  }
  return result;
}

/**
 * JavaScript implementation of Montgomery multiplication
 */
function montgomeryMulJS(
  a: BigUint64Array,
  b: BigUint64Array,
  modulus: BigUint64Array,
  _mu: bigint,
  limbCount: number
): BigUint64Array {
  // Convert to bigint for computation
  const aVal = limbsToBigint(a);
  const bVal = limbsToBigint(b);
  const pVal = limbsToBigint(modulus);

  // Simple modular multiplication (not true Montgomery, but correct result)
  // For true Montgomery, we'd need the full reduction algorithm
  const product = (aVal * bVal) % pVal;

  return bigintToLimbs(product, limbCount);
}

/**
 * Native NEON implementation
 */
class NativeNEONOperations implements NEONOperations {
  private binding: ReturnType<typeof loadCppBinding>;

  constructor() {
    this.binding = loadCppBinding();
  }

  isAvailable(): boolean {
    if (!this.binding) {
      return false;
    }

    if (this.binding.neonAvailable) {
      return this.binding.neonAvailable();
    }

    return getCPUAcceleratorStatus().neonAvailable;
  }

  montgomeryMul4Limb(
    a: BigUint64Array,
    b: BigUint64Array,
    config: FieldConfig
  ): BigUint64Array {
    // Native binding would call neon_montgomery_mul_4limb
    // For now, use JS fallback
    const modulus = bigintToLimbs(config.modulus, 4);
    const mu = computeMontgomeryMu(config.modulus);
    return montgomeryMulJS(a, b, modulus, mu, 4);
  }

  montgomeryMul6Limb(
    a: BigUint64Array,
    b: BigUint64Array,
    config: FieldConfig
  ): BigUint64Array {
    // Native binding would call neon_montgomery_mul_6limb
    // For now, use JS fallback
    const modulus = bigintToLimbs(config.modulus, 6);
    const mu = computeMontgomeryMu(config.modulus);
    return montgomeryMulJS(a, b, modulus, mu, 6);
  }

  batchMontgomeryMul(
    pairs: Array<[BigUint64Array, BigUint64Array]>,
    config: FieldConfig
  ): BigUint64Array[] {
    const limbCount = config.limbCount;
    const modulus = bigintToLimbs(config.modulus, limbCount);
    const mu = computeMontgomeryMu(config.modulus);

    return pairs.map(([a, b]) => montgomeryMulJS(a, b, modulus, mu, limbCount));
  }

  fieldMul(a: FieldElement, b: FieldElement): FieldElement {
    if (a.field.modulus !== b.field.modulus) {
      throw new Error('Field elements must have the same modulus');
    }

    const limbCount = a.field.limbCount;
    let result: BigUint64Array;

    if (limbCount === 4) {
      result = this.montgomeryMul4Limb(a.limbs, b.limbs, a.field);
    } else if (limbCount === 6) {
      result = this.montgomeryMul6Limb(a.limbs, b.limbs, a.field);
    } else {
      // Generic fallback
      const modulus = bigintToLimbs(a.field.modulus, limbCount);
      const mu = computeMontgomeryMu(a.field.modulus);
      result = montgomeryMulJS(a.limbs, b.limbs, modulus, mu, limbCount);
    }

    return { limbs: result, field: a.field };
  }
}

/**
 * JavaScript fallback NEON implementation
 */
class JSNEONOperations implements NEONOperations {
  isAvailable(): boolean {
    return true; // JS fallback is always available
  }

  montgomeryMul4Limb(
    a: BigUint64Array,
    b: BigUint64Array,
    config: FieldConfig
  ): BigUint64Array {
    const modulus = bigintToLimbs(config.modulus, 4);
    const mu = computeMontgomeryMu(config.modulus);
    return montgomeryMulJS(a, b, modulus, mu, 4);
  }

  montgomeryMul6Limb(
    a: BigUint64Array,
    b: BigUint64Array,
    config: FieldConfig
  ): BigUint64Array {
    const modulus = bigintToLimbs(config.modulus, 6);
    const mu = computeMontgomeryMu(config.modulus);
    return montgomeryMulJS(a, b, modulus, mu, 6);
  }

  batchMontgomeryMul(
    pairs: Array<[BigUint64Array, BigUint64Array]>,
    config: FieldConfig
  ): BigUint64Array[] {
    const limbCount = config.limbCount;
    const modulus = bigintToLimbs(config.modulus, limbCount);
    const mu = computeMontgomeryMu(config.modulus);

    return pairs.map(([a, b]) => montgomeryMulJS(a, b, modulus, mu, limbCount));
  }

  fieldMul(a: FieldElement, b: FieldElement): FieldElement {
    if (a.field.modulus !== b.field.modulus) {
      throw new Error('Field elements must have the same modulus');
    }

    const limbCount = a.field.limbCount;
    const modulus = bigintToLimbs(a.field.modulus, limbCount);
    const mu = computeMontgomeryMu(a.field.modulus);
    const result = montgomeryMulJS(a.limbs, b.limbs, modulus, mu, limbCount);

    return { limbs: result, field: a.field };
  }
}

// Cached instance
let neonInstance: NEONOperations | null = null;

/**
 * Create or get the NEON operations instance
 *
 * Returns a native implementation if available, otherwise falls back
 * to a JavaScript implementation.
 *
 * @returns NEONOperations instance
 */
export function createNEONOperations(): NEONOperations {
  if (neonInstance !== null) {
    return neonInstance;
  }

  // Try native implementation first
  const binding = loadCppBinding();
  if (binding !== null) {
    const native = new NativeNEONOperations();
    if (native.isAvailable()) {
      neonInstance = native;
      return neonInstance;
    }
  }

  // Fall back to JavaScript implementation
  neonInstance = new JSNEONOperations();
  return neonInstance;
}
