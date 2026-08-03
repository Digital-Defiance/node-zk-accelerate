/**
 * Groth16 / PLONK proving and verification: unimplemented
 *
 * This module is deliberately NOT re-exported from `./index.js`, and therefore
 * not reachable from the package root. It exists so the absence of a proof
 * system has a single, testable home.
 *
 * ## Why these functions throw
 *
 * A Groth16 or PLONK verifier is a pairing check. This library has no pairing
 * implementation and no extension-field arithmetic to build one from:
 *
 * - `src/field/` implements prime-field arithmetic over Fp only. There is no
 *   Fp2, no Fp6 and no Fp12.
 * - `src/curve/` implements the G1 group law only. There is no G2 group law,
 *   no twist, no subgroup checks on G2.
 * - There is no Miller loop and no final exponentiation, in TypeScript, in the
 *   C++ addon (`native/src/`) or in the Rust addon (`native-rust/src/`).
 * - No pairing-capable dependency is available: the only runtime dependencies
 *   are `@digitaldefiance/node-fhe-accelerate`, `node-addon-api` and
 *   `node-gyp-build`.
 *
 * Earlier releases shipped `groth16Verify` and `plonkVerify` that checked the
 * `protocol` string and the public-signal count and then returned `true`, and
 * provers that emitted a proof whose elements were zero or copied out of the
 * proving key. A verifier that returns `true` without performing the pairing
 * check accepts every proof, including a forged one. Rather than keep an
 * accept-everything verifier, and rather than keep provers that emit a proof
 * of zeros for that verifier to accept, every entry point in this module
 * throws.
 *
 * Do not "restore" these by making them return a value. Either implement the
 * pairing and the real protocol, or leave them throwing.
 *
 * Requirements: 10.1, 10.2, 10.6
 */

import { notImplementedError } from '../errors.js';
import type {
  Groth16Proof,
  Groth16VerificationKey,
  PlonkProof,
  PlonkVerificationKey,
  ProofResult,
  WitnessData,
  ZkeyData,
} from './types.js';

/**
 * What a pairing-based verifier would need, and this library does not have.
 * @internal
 */
export const MISSING_PAIRING =
  'this build has no pairing implementation (no Fp2/Fp6/Fp12 arithmetic, ' +
  'no G2 group law, no Miller loop, no final exponentiation) in TypeScript, ' +
  'in the C++ addon or in the Rust addon';

/**
 * What a real prover would need beyond accelerated MSM.
 * @internal
 */
const MISSING_PROVER =
  'the quotient-polynomial computation, the G2 component of the proof and ' +
  'the blinding-factor combination are absent, so no sound proof can be ' +
  'produced; only the MSM primitives this package accelerates are present';

/**
 * Groth16 proof generation: not implemented.
 *
 * @throws {ZkAccelerateError} always, with code `NOT_IMPLEMENTED`
 */
export function groth16Prove(
  _zkey: ZkeyData | Uint8Array | ArrayBuffer,
  _wtns: WitnessData | Uint8Array | ArrayBuffer,
  _options?: unknown
): Promise<ProofResult> {
  throw notImplementedError('Groth16 proof generation', MISSING_PROVER);
}

/**
 * Groth16 proof generation (synchronous): not implemented.
 *
 * @throws {ZkAccelerateError} always, with code `NOT_IMPLEMENTED`
 */
export function groth16ProveSync(
  _zkey: ZkeyData | Uint8Array | ArrayBuffer,
  _wtns: WitnessData | Uint8Array | ArrayBuffer,
  _options?: unknown
): ProofResult {
  throw notImplementedError('Groth16 proof generation', MISSING_PROVER);
}

/**
 * Groth16 proof verification: not implemented.
 *
 * A correct implementation checks
 * `e(A, B) = e(alpha, beta) * e(sum(a_i * L_i), gamma) * e(C, delta)`.
 * That check cannot be performed here, so this function throws instead of
 * reporting a verdict it has not established.
 *
 * @throws {ZkAccelerateError} always, with code `NOT_IMPLEMENTED`
 */
export function groth16Verify(
  _vk: Groth16VerificationKey,
  _publicSignals: string[],
  _proof: Groth16Proof
): boolean {
  throw notImplementedError('Groth16 proof verification', MISSING_PAIRING);
}

/**
 * PLONK proof generation: not implemented.
 *
 * @throws {ZkAccelerateError} always, with code `NOT_IMPLEMENTED`
 */
export function plonkProve(
  _zkey: ZkeyData | Uint8Array | ArrayBuffer,
  _wtns: WitnessData | Uint8Array | ArrayBuffer,
  _options?: unknown
): Promise<ProofResult> {
  throw notImplementedError('PLONK proof generation', MISSING_PROVER);
}

/**
 * PLONK proof generation (synchronous): not implemented.
 *
 * @throws {ZkAccelerateError} always, with code `NOT_IMPLEMENTED`
 */
export function plonkProveSync(
  _zkey: ZkeyData | Uint8Array | ArrayBuffer,
  _wtns: WitnessData | Uint8Array | ArrayBuffer,
  _options?: unknown
): ProofResult {
  throw notImplementedError('PLONK proof generation', MISSING_PROVER);
}

/**
 * PLONK proof verification: not implemented.
 *
 * A correct implementation performs the batched KZG opening check, which is a
 * pairing check. That check cannot be performed here, so this function throws
 * instead of reporting a verdict it has not established.
 *
 * @throws {ZkAccelerateError} always, with code `NOT_IMPLEMENTED`
 */
export function plonkVerify(
  _vk: PlonkVerificationKey,
  _publicSignals: string[],
  _proof: PlonkProof
): boolean {
  throw notImplementedError('PLONK proof verification', MISSING_PAIRING);
}
