/**
 * NTT Configuration and Twiddle Factors
 *
 * This module provides NTT configuration including primitive roots of unity
 * and precomputed twiddle factors for efficient NTT computation.
 *
 * Requirements: 3.1, 3.2
 */

import type { FieldConfig, FieldElement } from '../types.js';
import { createFieldElement, getFieldElementValue } from '../field/element.js';
import { fieldMul, fieldInv, fieldPow } from '../field/operations.js';
import { BN254_SCALAR_FIELD, BLS12_381_SCALAR_FIELD } from '../field/config.js';

/**
 * NTT configuration for a specific size and field
 */
export interface NTTConfig {
  /** Transform size (must be power of 2) */
  readonly n: number;
  /** Field configuration */
  readonly field: FieldConfig;
  /** Primitive n-th root of unity */
  readonly omega: FieldElement;
  /** Inverse of omega */
  readonly omegaInv: FieldElement;
  /** n^-1 mod p for inverse NTT scaling */
  readonly nInv: FieldElement;
  /** Precomputed twiddle factors for forward NTT */
  readonly twiddles: FieldElement[];
  /** Precomputed twiddle factors for inverse NTT */
  readonly twiddlesInv: FieldElement[];
}

/**
 * Cache for precomputed NTT configurations
 */
const nttConfigCache: Map<string, NTTConfig> = new Map();

/**
 * Get cache key for NTT configuration
 */
function getCacheKey(n: number, field: FieldConfig): string {
  return `${n}-${field.modulus.toString(16).slice(0, 16)}`;
}

/**
 * Find a primitive root of unity for the given field
 *
 * For NTT, we need an element ω such that ω^n = 1 and ω^k ≠ 1 for 0 < k < n.
 * We find this by computing g^((p-1)/n) where g is a generator of the multiplicative group.
 *
 * @param n - The NTT size (must be power of 2)
 * @param field - The field configuration
 * @returns The primitive n-th root of unity
 */
export function findPrimitiveRoot(n: number, field: FieldConfig): FieldElement {
  const p = field.modulus;
  const pMinus1 = p - 1n;

  // Check that n divides p-1 (required for NTT)
  if (pMinus1 % BigInt(n) !== 0n) {
    throw new Error(`NTT size ${n} does not divide p-1 for this field`);
  }

  // Find a generator of the multiplicative group
  // For BN254 and BLS12-381 scalar fields, we use known generators
  let generator: bigint;

  if (field.modulus === BN254_SCALAR_FIELD.modulus) {
    // BN254 scalar field generator
    generator = 5n;
  } else if (field.modulus === BLS12_381_SCALAR_FIELD.modulus) {
    // BLS12-381 scalar field generator
    generator = 7n;
  } else {
    // Try small primes as potential generators
    generator = 2n;
    while (generator < 100n) {
      // Check if generator^((p-1)/2) ≠ 1 (basic check)
      const halfPower = fieldPow(createFieldElement(generator, field), pMinus1 / 2n);
      if (getFieldElementValue(halfPower) !== 1n) {
        break;
      }
      generator += 1n;
    }
  }

  // Compute ω = g^((p-1)/n)
  const exponent = pMinus1 / BigInt(n);
  const omega = fieldPow(createFieldElement(generator, field), exponent);

  // Verify that ω^n = 1
  const omegaN = fieldPow(omega, BigInt(n));
  if (getFieldElementValue(omegaN) !== 1n) {
    throw new Error('Failed to find valid primitive root of unity');
  }

  // Verify that ω^(n/2) ≠ 1 (ensures it's a primitive n-th root)
  if (n > 1) {
    const omegaHalf = fieldPow(omega, BigInt(n / 2));
    if (getFieldElementValue(omegaHalf) === 1n) {
      throw new Error('Found root is not primitive');
    }
  }

  return omega;
}

/**
 * Precompute twiddle factors for NTT
 *
 * Twiddle factors are powers of the primitive root: ω^0, ω^1, ω^2, ..., ω^(n/2-1)
 *
 * @param omega - The primitive n-th root of unity
 * @param n - The NTT size
 * @returns Array of twiddle factors
 */
export function computeTwiddleFactors(omega: FieldElement, n: number): FieldElement[] {
  // For n=1, there are no twiddle factors needed
  if (n <= 1) {
    return [];
  }

  const halfN = Math.floor(n / 2);
  const twiddles: FieldElement[] = new Array(halfN);
  let current = createFieldElement(1n, omega.field);

  for (let i = 0; i < halfN; i++) {
    twiddles[i] = current;
    current = fieldMul(current, omega);
  }

  return twiddles;
}

/**
 * Create NTT configuration for a given size and field
 *
 * @param n - The NTT size (must be power of 2)
 * @param field - The field configuration
 * @returns NTT configuration with precomputed values
 */
export function createNTTConfig(n: number, field: FieldConfig): NTTConfig {
  // Check cache first
  const cacheKey = getCacheKey(n, field);
  const cached = nttConfigCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Validate n is power of 2
  if (n <= 0 || (n & (n - 1)) !== 0) {
    throw new Error(`NTT size must be a power of 2, got ${n}`);
  }

  // Find primitive root of unity
  const omega = findPrimitiveRoot(n, field);

  // Compute inverse of omega
  const omegaInv = fieldInv(omega);

  // Compute n^-1 for inverse NTT scaling
  const nInv = fieldInv(createFieldElement(BigInt(n), field));

  // Precompute twiddle factors
  const twiddles = computeTwiddleFactors(omega, n);
  const twiddlesInv = computeTwiddleFactors(omegaInv, n);

  const config: NTTConfig = {
    n,
    field,
    omega,
    omegaInv,
    nInv,
    twiddles,
    twiddlesInv,
  };

  // Cache the configuration
  nttConfigCache.set(cacheKey, config);

  return config;
}

/**
 * Get or create NTT configuration for BN254 scalar field
 */
export function getBN254NTTConfig(n: number): NTTConfig {
  return createNTTConfig(n, BN254_SCALAR_FIELD);
}

/**
 * Get or create NTT configuration for BLS12-381 scalar field
 */
export function getBLS12381NTTConfig(n: number): NTTConfig {
  return createNTTConfig(n, BLS12_381_SCALAR_FIELD);
}

/**
 * Clear the NTT configuration cache
 */
export function clearNTTConfigCache(): void {
  nttConfigCache.clear();
}

/**
 * Get the maximum supported NTT size for a field
 *
 * The maximum size is determined by the largest power of 2 that divides p-1.
 */
export function getMaxNTTSize(field: FieldConfig): number {
  const pMinus1 = field.modulus - 1n;
  let maxPow2 = 1;

  while ((pMinus1 >> BigInt(maxPow2)) % 2n === 0n) {
    maxPow2++;
  }

  return 1 << maxPow2;
}

/**
 * Check if a given NTT size is supported for a field
 */
export function isNTTSizeSupported(n: number, field: FieldConfig): boolean {
  if (n <= 0 || (n & (n - 1)) !== 0) {
    return false;
  }

  const pMinus1 = field.modulus - 1n;
  return pMinus1 % BigInt(n) === 0n;
}
