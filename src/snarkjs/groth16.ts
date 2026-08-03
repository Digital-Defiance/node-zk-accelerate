/**
 * Groth16 proof serialisation
 *
 * This module converts Groth16 proofs between the in-memory representation
 * used by this package and the JSON shape snarkjs reads and writes. It does
 * not prove and it does not verify.
 *
 * Proving and verification live in `./unimplemented.js` and throw, because
 * this build has no pairing implementation. See that module for the full
 * explanation. They are deliberately absent from this module and from the
 * package's public exports so that no caller can obtain a proof this library
 * cannot sustain, or a verdict it cannot establish.
 *
 * Requirements: 10.1, 10.2
 */

import type { Groth16Proof } from './types.js';

/**
 * Export proof to snarkjs-compatible JSON format
 */
export function exportProofToJson(proof: Groth16Proof): object {
  return {
    pi_a: [proof.pi_a.x.toString(), proof.pi_a.y.toString(), '1'],
    pi_b: [
      [proof.pi_b.x[0].toString(), proof.pi_b.x[1].toString()],
      [proof.pi_b.y[0].toString(), proof.pi_b.y[1].toString()],
      ['1', '0'],
    ],
    pi_c: [proof.pi_c.x.toString(), proof.pi_c.y.toString(), '1'],
    protocol: proof.protocol,
    curve: proof.curve.toLowerCase(),
  };
}

/**
 * Import proof from snarkjs-compatible JSON format
 */
export function importProofFromJson(json: {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}): Groth16Proof {
  return {
    pi_a: {
      x: BigInt(json.pi_a[0]!),
      y: BigInt(json.pi_a[1]!),
    },
    pi_b: {
      x: [BigInt(json.pi_b[0]![0]!), BigInt(json.pi_b[0]![1]!)],
      y: [BigInt(json.pi_b[1]![0]!), BigInt(json.pi_b[1]![1]!)],
    },
    pi_c: {
      x: BigInt(json.pi_c[0]!),
      y: BigInt(json.pi_c[1]!),
    },
    protocol: 'groth16',
    curve: json.curve.toUpperCase() === 'BN128' || json.curve.toUpperCase() === 'BN254'
      ? 'BN254'
      : 'BLS12_381',
  };
}
