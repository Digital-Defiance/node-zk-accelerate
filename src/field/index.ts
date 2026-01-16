/**
 * Finite Field Arithmetic Module
 *
 * This module provides hardware-accelerated finite field arithmetic operations
 * for ZK proof systems. It supports BN254 and BLS12-381 curves with Montgomery
 * representation for efficient modular multiplication.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 14.2
 */

export * from './config.js';
export * from './element.js';
export * from './operations.js';
export * from './serialization.js';
