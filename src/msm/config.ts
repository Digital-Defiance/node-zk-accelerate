/**
 * MSM Configuration
 *
 * This module defines configuration types and constants for MSM operations.
 *
 * Requirements: 2.1, 2.4, 2.5
 */

import type { CurveName } from '../types.js';

/**
 * MSM computation options
 */
export interface MSMConfig {
  /** Window size for Pippenger's algorithm (bits per window) */
  windowSize: number;
  /** Minimum number of points to use GPU acceleration */
  gpuThreshold: number;
  /** Whether to validate inputs before computation */
  validateInputs: boolean;
  /** Acceleration hint */
  accelerationHint: 'cpu' | 'gpu' | 'hybrid' | 'auto';
}

/**
 * Default MSM configuration
 */
export const DEFAULT_MSM_CONFIG: MSMConfig = {
  windowSize: 0, // 0 means auto-select based on input size
  gpuThreshold: 4096, // Use GPU for 4096+ points
  validateInputs: true,
  accelerationHint: 'auto',
};

/**
 * Calculate optimal window size based on number of points
 *
 * The optimal window size balances:
 * - Larger windows = fewer additions but more buckets
 * - Smaller windows = more additions but fewer buckets
 *
 * Empirically, window size ≈ log2(n) / 2 works well
 */
export function calculateOptimalWindowSize(numPoints: number, _scalarBits: number = 254): number {
  if (numPoints <= 0) {
    return 1;
  }

  // For very small inputs, use small windows
  if (numPoints < 16) {
    return 4;
  }

  // Optimal window size is approximately sqrt(scalarBits / log2(n))
  // But a simpler heuristic works well in practice
  const logN = Math.log2(numPoints);

  // Window size typically ranges from 8 to 20 bits
  // Larger inputs benefit from larger windows
  let windowSize = Math.floor(logN);

  // Clamp to reasonable range
  windowSize = Math.max(4, Math.min(20, windowSize));

  // For very large inputs, cap at a reasonable size
  if (numPoints > 1_000_000) {
    windowSize = Math.min(windowSize, 16);
  }

  return windowSize;
}

/**
 * Get the number of windows needed for a given scalar bit length and window size
 */
export function getNumWindows(scalarBits: number, windowSize: number): number {
  return Math.ceil(scalarBits / windowSize);
}

/**
 * Get the number of buckets per window
 * Each window has 2^windowSize - 1 buckets (excluding bucket 0)
 */
export function getBucketsPerWindow(windowSize: number): number {
  return (1 << windowSize) - 1;
}

/**
 * Get scalar bit length for a curve
 */
export function getScalarBits(curve: CurveName): number {
  switch (curve) {
    case 'BN254':
      return 254;
    case 'BLS12_381':
      return 255;
    default:
      return 256;
  }
}
