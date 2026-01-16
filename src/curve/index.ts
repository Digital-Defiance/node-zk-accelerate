/**
 * Elliptic Curve Operations Module
 *
 * This module provides hardware-accelerated elliptic curve operations
 * for ZK proof systems. It supports BN254 and BLS12-381 curves with
 * multiple coordinate representations for efficient computation.
 *
 * Requirements: 2.2, 2.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 15.2
 */

// Curve configuration
export * from './config.js';

// Point representations and conversions
export * from './point.js';

// Curve operations (addition, doubling, scalar multiplication, validation)
export * from './operations.js';

// Point compression and decompression
export * from './compression.js';
