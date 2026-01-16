/**
 * Multi-Scalar Multiplication (MSM) Module
 *
 * This module provides hardware-accelerated MSM operations using
 * Pippenger's algorithm with bucket accumulation. MSM computes
 * the sum of scalar-point products: Σ(sᵢ · Pᵢ)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.10, 15.4
 */

// MSM configuration and types
export * from './config.js';

// Pippenger's algorithm implementation
export * from './pippenger.js';

// MSM validation
export * from './validation.js';

// MSM acceleration router
export * from './router.js';

// Main MSM API
export * from './msm.js';

// Hybrid CPU+GPU execution
export * from './hybrid.js';
