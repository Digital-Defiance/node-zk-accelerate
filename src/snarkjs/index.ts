/**
 * snarkjs Integration Module
 *
 * This module provides drop-in acceleration for snarkjs workflows,
 * including file parsers for .zkey, .wtns, and .r1cs files, and
 * accelerated Groth16 and PLONK provers.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.6
 */

// File parsers
export * from './parsers/index.js';

// Accelerated provers
export * from './groth16.js';
export * from './plonk.js';

// Types
export * from './types.js';
