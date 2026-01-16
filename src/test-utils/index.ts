/**
 * Test utilities for @digitaldefiance/node-zk-accelerate
 *
 * This module exports all test utilities including:
 * - Property-based testing configuration and arbitraries
 * - Field element and curve point comparison utilities
 * - Helper functions for testing ZK primitives
 *
 * Requirements: Testing Strategy from design.md
 */

// Property-based testing utilities
export * from './property-test-config.js';

// Field element and curve point comparison utilities
export * from './field-comparison.js';
