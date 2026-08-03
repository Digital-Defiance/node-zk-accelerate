/**
 * snarkjs Integration Module
 *
 * This module provides file parsers for .zkey, .wtns and .r1cs files and
 * proof serialisation compatible with snarkjs.
 *
 * It does NOT provide proving or verification. `./unimplemented.js` holds
 * `groth16Prove`, `groth16ProveSync`, `groth16Verify`, `plonkProve`,
 * `plonkProveSync` and `plonkVerify`; every one of them throws, because this
 * build has no pairing implementation. That module is intentionally not
 * re-exported here, so those names are not reachable from the package root.
 * Do not add it to this barrel unless the underlying cryptography is real.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.6
 */

// File parsers
export * from './parsers/index.js';

// Proof serialisation
export * from './groth16.js';
export * from './plonk.js';

// Types
export * from './types.js';
