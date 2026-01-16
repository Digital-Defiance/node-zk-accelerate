/**
 * @digitaldefiance/node-zk-accelerate
 * WASM Fallback - MSM Operations
 *
 * Pure JavaScript implementations of Multi-Scalar Multiplication
 * for use when native bindings are unavailable.
 *
 * Requirements: 13.5, 13.7
 */

import type { AffinePoint, JacobianPoint, CurveConfig, Scalar } from '../types.js';
import { wasmPointAdd, wasmPointDouble, wasmScalarMul } from './curve-ops.js';
import { createFieldElementFromBigint } from './field-ops.js';

/**
 * Create the identity point for a curve
 */
function createIdentity(curve: CurveConfig): JacobianPoint {
  const field = curve.field;
  return {
    x: createFieldElementFromBigint(1n, field),
    y: createFieldElementFromBigint(1n, field),
    z: createFieldElementFromBigint(0n, field),
  };
}

/**
 * Naive MSM implementation
 * Computes sum of scalar * point for all pairs
 */
export function wasmMsmNaive(
  scalars: (Scalar | bigint)[],
  points: AffinePoint[],
  curve: CurveConfig
): JacobianPoint {
  if (scalars.length !== points.length) {
    throw new Error('Scalars and points arrays must have the same length');
  }

  if (scalars.length === 0) {
    return createIdentity(curve);
  }

  let result = createIdentity(curve);

  for (let i = 0; i < scalars.length; i++) {
    const scalarItem = scalars[i];
    const point = points[i];
    if (scalarItem === undefined || point === undefined) continue;

    const scalar = typeof scalarItem === 'bigint' ? scalarItem : scalarItem.value;
    if (scalar !== 0n) {
      const product = wasmScalarMul(scalar, point, curve);
      result = wasmPointAdd(result, product, curve);
    }
  }

  return result;
}

/**
 * Pippenger's bucket method for MSM
 * More efficient for larger inputs
 */
export function wasmMsm(
  scalars: (Scalar | bigint)[],
  points: AffinePoint[],
  curve: CurveConfig,
  windowSize?: number
): JacobianPoint {
  if (scalars.length !== points.length) {
    throw new Error('Scalars and points arrays must have the same length');
  }

  const n = scalars.length;

  if (n === 0) {
    return createIdentity(curve);
  }

  // For small inputs, use naive method
  if (n < 16) {
    return wasmMsmNaive(scalars, points, curve);
  }

  // Determine optimal window size
  const w = windowSize ?? calculateOptimalWindowSize(n);
  const numBuckets = (1 << w) - 1; // 2^w - 1 buckets (excluding 0)
  const scalarBits = 256; // Assuming 256-bit scalars
  const numWindows = Math.ceil(scalarBits / w);

  // Process each window
  const windowSums: JacobianPoint[] = [];

  for (let windowIdx = 0; windowIdx < numWindows; windowIdx++) {
    // Initialize buckets
    const buckets: JacobianPoint[] = [];
    for (let i = 0; i < numBuckets; i++) {
      buckets.push(createIdentity(curve));
    }

    // Assign points to buckets based on scalar window value
    for (let i = 0; i < n; i++) {
      const scalarItem = scalars[i];
      const point = points[i];
      if (scalarItem === undefined || point === undefined) continue;

      const scalar = typeof scalarItem === 'bigint' ? scalarItem : scalarItem.value;
      const windowValue = getScalarWindow(scalar, windowIdx, w);

      if (windowValue > 0) {
        const bucketIdx = windowValue - 1;
        const bucket = buckets[bucketIdx];
        if (bucket) {
          buckets[bucketIdx] = wasmPointAdd(bucket, point, curve);
        }
      }
    }

    // Reduce buckets to window sum
    // sum = bucket[n-1] + 2*bucket[n-2] + ... + n*bucket[0]
    // Computed as: sum = bucket[n-1] + (bucket[n-1] + bucket[n-2]) + ...
    let runningSum = createIdentity(curve);
    let windowSum = createIdentity(curve);

    for (let i = numBuckets - 1; i >= 0; i--) {
      const bucket = buckets[i];
      if (bucket) {
        runningSum = wasmPointAdd(runningSum, bucket, curve);
      }
      windowSum = wasmPointAdd(windowSum, runningSum, curve);
    }

    windowSums.push(windowSum);
  }

  // Combine window sums
  // result = windowSums[n-1] * 2^((n-1)*w) + ... + windowSums[0]
  let result = createIdentity(curve);

  for (let i = numWindows - 1; i >= 0; i--) {
    // Double result by window size
    for (let j = 0; j < w; j++) {
      result = wasmPointDouble(result, curve);
    }
    // Add window sum
    const windowSum = windowSums[i];
    if (windowSum) {
      result = wasmPointAdd(result, windowSum, curve);
    }
  }

  return result;
}

/**
 * Get a window of bits from a scalar
 */
function getScalarWindow(scalar: bigint, windowIdx: number, windowSize: number): number {
  const startBit = windowIdx * windowSize;
  const mask = (1n << BigInt(windowSize)) - 1n;
  return Number((scalar >> BigInt(startBit)) & mask);
}

/**
 * Calculate optimal window size based on input size
 */
function calculateOptimalWindowSize(n: number): number {
  // Heuristic: window size that balances bucket count vs. scalar processing
  if (n < 32) return 4;
  if (n < 256) return 8;
  if (n < 4096) return 12;
  if (n < 65536) return 15;
  return 16;
}
