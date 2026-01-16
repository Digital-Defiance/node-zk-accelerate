/**
 * Field Configuration for BN254 and BLS12-381
 *
 * This module defines the field configurations including modulus and Montgomery
 * constants for efficient modular arithmetic.
 *
 * Requirements: 4.1, 14.2
 */

import type { FieldConfig } from '../types.js';

/**
 * Compute Montgomery R^-1 mod p using extended Euclidean algorithm
 */
function computeRInv(r: bigint, modulus: bigint): bigint {
  let [oldR, newR] = [r % modulus, modulus];
  let [oldS, s] = [1n, 0n];

  while (newR !== 0n) {
    const quotient = oldR / newR;
    [oldR, newR] = [newR, oldR - quotient * newR];
    [oldS, s] = [s, oldS - quotient * s];
  }

  return ((oldS % modulus) + modulus) % modulus;
}

/**
 * BN254 base field configuration
 *
 * The BN254 curve (also known as alt_bn128) is widely used in Ethereum
 * and ZK-SNARKs. The base field has a 254-bit prime modulus.
 *
 * Field modulus p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
 */
export const BN254_FIELD: FieldConfig = (() => {
  const modulus = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
  const limbCount = 4; // 254 bits → 4 × 64-bit limbs

  // R = 2^256 mod p (Montgomery radix)
  const r = 6350874878119819312338956282401532410528162663560392320966563075034087161851n;

  // R² mod p (for converting to Montgomery form)
  const r2 = 3096616502983703923843567936837374451735540968419076528771170197431451843209n;

  // R^-1 mod p (for converting from Montgomery form)
  const rInv = computeRInv(r, modulus);

  return {
    modulus,
    r,
    rInv,
    r2,
    limbCount,
  };
})();

/**
 * BLS12-381 base field configuration
 *
 * The BLS12-381 curve provides 128-bit security and is used in many
 * modern ZK proof systems including Zcash and Ethereum 2.0.
 *
 * Field modulus p = 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787
 */
export const BLS12_381_FIELD: FieldConfig = (() => {
  const modulus =
    4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
  const limbCount = 6; // 381 bits → 6 × 64-bit limbs

  // R = 2^384 mod p (Montgomery radix)
  const r =
    3380320199399472671518931668520476396067793891014375699959770179129436917079669831430077592723774664465579537268733n;

  // R² mod p (for converting to Montgomery form)
  const r2 =
    2708263910654730174793787626328176511836455197166317677006154293982164122222515399004018013397331347120527951271750n;

  // R^-1 mod p (for converting from Montgomery form)
  const rInv = computeRInv(r, modulus);

  return {
    modulus,
    r,
    rInv,
    r2,
    limbCount,
  };
})();

/**
 * BN254 scalar field configuration (curve order)
 *
 * This is the order of the BN254 curve's scalar field, used for scalar
 * multiplication operations.
 */
export const BN254_SCALAR_FIELD: FieldConfig = (() => {
  const modulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const limbCount = 4;

  // R = 2^256 mod n
  const r = 6350874878119819312338956282401532409788428417205271574164185838014896134166n;

  // R² mod n
  const r2 = 944936681149208446651664254269745548490766851729442924617792859073125903783n;

  const rInv = computeRInv(r, modulus);

  return {
    modulus,
    r,
    rInv,
    r2,
    limbCount,
  };
})();

/**
 * BLS12-381 scalar field configuration (curve order)
 */
export const BLS12_381_SCALAR_FIELD: FieldConfig = (() => {
  const modulus = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;
  const limbCount = 4; // 255 bits → 4 × 64-bit limbs

  // R = 2^256 mod n
  const r = 10920338887063814464675503992315976177888879664585288394250266608035967270910n;

  // R² mod n
  const r2 = 3294906474794265442129797520630710739278575682199800681788903916070560242797n;

  const rInv = computeRInv(r, modulus);

  return {
    modulus,
    r,
    rInv,
    r2,
    limbCount,
  };
})();

/**
 * Get field configuration by curve name
 */
export function getFieldConfig(curve: 'BN254' | 'BLS12_381', type: 'base' | 'scalar' = 'base'): FieldConfig {
  if (curve === 'BN254') {
    return type === 'base' ? BN254_FIELD : BN254_SCALAR_FIELD;
  } else {
    return type === 'base' ? BLS12_381_FIELD : BLS12_381_SCALAR_FIELD;
  }
}

/**
 * Validate that a field configuration is internally consistent
 */
export function validateFieldConfig(config: FieldConfig): boolean {
  // Check that R * R^-1 ≡ 1 (mod p)
  const product = (config.r * config.rInv) % config.modulus;
  if (product !== 1n) {
    return false;
  }

  // Check that R² ≡ R * R (mod p)
  const r2Check = (config.r * config.r) % config.modulus;
  if (r2Check !== config.r2) {
    return false;
  }

  return true;
}
