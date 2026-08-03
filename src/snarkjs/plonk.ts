/**
 * PLONK proof serialisation
 *
 * This module converts PLONK proofs to the JSON shape snarkjs reads. It does
 * not prove and it does not verify.
 *
 * Proving and verification live in `./unimplemented.js` and throw, because
 * this build has no pairing implementation. See that module for the full
 * explanation. They are deliberately absent from this module and from the
 * package's public exports so that no caller can obtain a proof this library
 * cannot sustain, or a verdict it cannot establish.
 *
 * Requirements: 10.1, 10.3
 */

import type { PlonkProof } from './types.js';

/**
 * Export proof to snarkjs-compatible JSON format
 */
export function exportPlonkProofToJson(proof: PlonkProof): object {
  return {
    A: [proof.A.x.toString(), proof.A.y.toString(), '1'],
    B: [proof.B.x.toString(), proof.B.y.toString(), '1'],
    C: [proof.C.x.toString(), proof.C.y.toString(), '1'],
    Z: [proof.Z.x.toString(), proof.Z.y.toString(), '1'],
    T1: [proof.T1.x.toString(), proof.T1.y.toString(), '1'],
    T2: [proof.T2.x.toString(), proof.T2.y.toString(), '1'],
    T3: [proof.T3.x.toString(), proof.T3.y.toString(), '1'],
    Wxi: [proof.Wxi.x.toString(), proof.Wxi.y.toString(), '1'],
    Wxiw: [proof.Wxiw.x.toString(), proof.Wxiw.y.toString(), '1'],
    eval_a: proof.eval_a.toString(),
    eval_b: proof.eval_b.toString(),
    eval_c: proof.eval_c.toString(),
    eval_s1: proof.eval_s1.toString(),
    eval_s2: proof.eval_s2.toString(),
    eval_zw: proof.eval_zw.toString(),
    protocol: proof.protocol,
    curve: proof.curve.toLowerCase(),
  };
}
