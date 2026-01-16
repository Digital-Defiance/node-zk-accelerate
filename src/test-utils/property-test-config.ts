/**
 * Property-based testing configuration and utilities
 *
 * This module provides configuration and helpers for property-based testing
 * using fast-check. All property tests should use these configurations to
 * ensure consistency across the test suite.
 *
 * Requirements: Testing Strategy from design.md
 */

import * as fc from 'fast-check';

/**
 * Standard configuration for property-based tests
 * - Minimum 100 iterations per property test
 * - Seed logging for reproducibility
 * - Shrinking enabled for minimal failing examples
 */
export const PROPERTY_TEST_CONFIG: fc.Parameters<unknown> = {
  numRuns: 100,
  verbose: true,
  seed: Date.now(), // Can be overridden for reproducibility
  endOnFailure: false, // Continue to find all failures
};

/**
 * Configuration for fast property tests (used during development)
 */
export const FAST_PROPERTY_TEST_CONFIG: fc.Parameters<unknown> = {
  numRuns: 10,
  verbose: false,
  seed: Date.now(),
};

/**
 * Configuration for exhaustive property tests (used for critical properties)
 */
export const EXHAUSTIVE_PROPERTY_TEST_CONFIG: fc.Parameters<unknown> = {
  numRuns: 1000,
  verbose: true,
  seed: Date.now(),
  endOnFailure: false,
};

/**
 * BN254 curve field modulus (scalar field)
 * This is the order of the BN254 curve's scalar field
 */
export const BN254_SCALAR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * BN254 base field modulus
 */
export const BN254_BASE_MODULUS =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

/**
 * BLS12-381 scalar field modulus
 */
export const BLS12_381_SCALAR_MODULUS =
  52435875175126190479447740508185965837690552500527637822603658699938581184513n;

/**
 * BLS12-381 base field modulus
 */
export const BLS12_381_BASE_MODULUS =
  4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;


/**
 * Supported curve names for testing
 */
export type TestCurveName = 'BN254' | 'BLS12_381';

/**
 * Get the scalar field modulus for a curve
 */
export function getScalarModulus(curve: TestCurveName): bigint {
  switch (curve) {
    case 'BN254':
      return BN254_SCALAR_MODULUS;
    case 'BLS12_381':
      return BLS12_381_SCALAR_MODULUS;
  }
}

/**
 * Get the base field modulus for a curve
 */
export function getBaseModulus(curve: TestCurveName): bigint {
  switch (curve) {
    case 'BN254':
      return BN254_BASE_MODULUS;
    case 'BLS12_381':
      return BLS12_381_BASE_MODULUS;
  }
}

/**
 * Arbitrary generator for curve names
 */
export function arbitraryCurveName(): fc.Arbitrary<TestCurveName> {
  return fc.constantFrom('BN254' as const, 'BLS12_381' as const);
}

/**
 * Arbitrary generator for field elements within a modulus
 * Generates random bigints in range [0, modulus)
 */
export function arbitraryFieldValue(modulus: bigint): fc.Arbitrary<bigint> {
  return fc.bigInt({ min: 0n, max: modulus - 1n });
}

/**
 * Arbitrary generator for non-zero field elements
 * Generates random bigints in range [1, modulus)
 */
export function arbitraryNonZeroFieldValue(modulus: bigint): fc.Arbitrary<bigint> {
  return fc.bigInt({ min: 1n, max: modulus - 1n });
}

/**
 * Arbitrary generator for scalar values (for curve operations)
 * Generates random bigints in range [1, order) - excludes 0 for meaningful scalar muls
 */
export function arbitraryScalarValue(curve: TestCurveName): fc.Arbitrary<bigint> {
  const modulus = getScalarModulus(curve);
  return fc.bigInt({ min: 1n, max: modulus - 1n });
}

/**
 * Arbitrary generator for small scalar values (for testing scalar multiplication)
 * Useful for tests that need to verify against naive implementations
 */
export function arbitrarySmallScalar(): fc.Arbitrary<bigint> {
  return fc.bigInt({ min: 1n, max: 1000n });
}

/**
 * Arbitrary generator for power-of-two sizes (for NTT)
 */
export function arbitraryPowerOfTwo(minExp: number = 2, maxExp: number = 16): fc.Arbitrary<number> {
  return fc.integer({ min: minExp, max: maxExp }).map((exp) => Math.pow(2, exp));
}

/**
 * Arbitrary generator for NTT sizes (common power-of-two sizes)
 */
export function arbitraryNttSize(): fc.Arbitrary<number> {
  return fc.constantFrom(4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096);
}

/**
 * Arbitrary generator for MSM sizes
 */
export function arbitraryMsmSize(): fc.Arbitrary<number> {
  return fc.constantFrom(1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024);
}

/**
 * Arbitrary generator for arrays of field values
 */
export function arbitraryFieldValueArray(
  modulus: bigint,
  minLength: number = 1,
  maxLength: number = 100
): fc.Arbitrary<bigint[]> {
  return fc.array(arbitraryFieldValue(modulus), { minLength, maxLength });
}

/**
 * Arbitrary generator for arrays of non-zero field values
 */
export function arbitraryNonZeroFieldValueArray(
  modulus: bigint,
  minLength: number = 1,
  maxLength: number = 100
): fc.Arbitrary<bigint[]> {
  return fc.array(arbitraryNonZeroFieldValue(modulus), { minLength, maxLength });
}

/**
 * Arbitrary generator for polynomial coefficients (power-of-two length)
 */
export function arbitraryPolynomialCoeffs(
  modulus: bigint,
  size: number
): fc.Arbitrary<bigint[]> {
  return fc.array(arbitraryFieldValue(modulus), { minLength: size, maxLength: size });
}

/**
 * Arbitrary generator for byte arrays (for serialization tests)
 */
export function arbitraryBytes(minLength: number = 1, maxLength: number = 64): fc.Arbitrary<Uint8Array> {
  return fc.uint8Array({ minLength, maxLength });
}

/**
 * Arbitrary generator for 32-byte arrays (common for field elements)
 */
export function arbitrary32Bytes(): fc.Arbitrary<Uint8Array> {
  return fc.uint8Array({ minLength: 32, maxLength: 32 });
}

/**
 * Arbitrary generator for 48-byte arrays (BLS12-381 field elements)
 */
export function arbitrary48Bytes(): fc.Arbitrary<Uint8Array> {
  return fc.uint8Array({ minLength: 48, maxLength: 48 });
}

/**
 * Arbitrary generator for endianness
 */
export function arbitraryEndianness(): fc.Arbitrary<'be' | 'le'> {
  return fc.constantFrom('be' as const, 'le' as const);
}

/**
 * Arbitrary generator for acceleration hints
 */
export function arbitraryAccelerationHint(): fc.Arbitrary<'cpu' | 'gpu' | 'hybrid' | 'auto'> {
  return fc.constantFrom('cpu' as const, 'gpu' as const, 'hybrid' as const, 'auto' as const);
}

/**
 * Arbitrary generator for NTT radix
 */
export function arbitraryNttRadix(): fc.Arbitrary<2 | 4> {
  return fc.constantFrom(2 as const, 4 as const);
}

/**
 * Check if a number is a power of two
 */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Get the next power of two greater than or equal to n
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Modular addition
 */
export function modAdd(a: bigint, b: bigint, modulus: bigint): bigint {
  return ((a % modulus) + (b % modulus)) % modulus;
}

/**
 * Modular subtraction
 */
export function modSub(a: bigint, b: bigint, modulus: bigint): bigint {
  return ((((a % modulus) - (b % modulus)) % modulus) + modulus) % modulus;
}

/**
 * Modular multiplication
 */
export function modMul(a: bigint, b: bigint, modulus: bigint): bigint {
  return ((a % modulus) * (b % modulus)) % modulus;
}

/**
 * Modular negation
 */
export function modNeg(a: bigint, modulus: bigint): bigint {
  return (modulus - (a % modulus)) % modulus;
}

/**
 * Modular exponentiation using square-and-multiply
 */
export function modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n;
  let result = 1n;
  base = base % modulus;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % modulus;
    }
    exp = exp / 2n;
    base = (base * base) % modulus;
  }
  return result;
}

/**
 * Modular inverse using extended Euclidean algorithm
 * Returns the modular inverse of a mod modulus, or throws if gcd(a, modulus) != 1
 */
export function modInverse(a: bigint, modulus: bigint): bigint {
  if (a === 0n) {
    throw new Error('Cannot compute inverse of zero');
  }

  let [oldR, r] = [a % modulus, modulus];
  let [oldS, s] = [1n, 0n];

  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }

  if (oldR !== 1n) {
    throw new Error(`No modular inverse exists: gcd(${a}, ${modulus}) = ${oldR}`);
  }

  return ((oldS % modulus) + modulus) % modulus;
}
