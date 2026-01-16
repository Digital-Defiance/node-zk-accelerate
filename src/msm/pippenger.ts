/**
 * Pippenger's Algorithm for Multi-Scalar Multiplication
 *
 * Implements the bucket method for efficient MSM computation.
 * The algorithm works by:
 * 1. Dividing scalars into windows of w bits
 * 2. For each window, accumulating points into buckets based on scalar bits
 * 3. Reducing buckets within each window
 * 4. Combining window results with appropriate shifts
 *
 * Requirements: 2.1
 */

import type { CurvePoint, CurveConfig, JacobianPoint } from '../types.js';
import {
  createJacobianIdentity,
  toJacobian,
  jacobianToAffine,
  isJacobianIdentity,
  isAffinePoint,
} from '../curve/point.js';
import { jacobianAdd, jacobianDouble } from '../curve/operations.js';
import {
  calculateOptimalWindowSize,
  getNumWindows,
  getBucketsPerWindow,
  getScalarBits,
} from './config.js';

/**
 * Pippenger state for MSM computation
 */
interface PippengerState {
  windowSize: number;
  numWindows: number;
  bucketsPerWindow: number;
  buckets: JacobianPoint[][];
  curve: CurveConfig;
}

/**
 * Initialize Pippenger state for MSM computation
 */
function initializePippengerState(
  numPoints: number,
  curve: CurveConfig,
  windowSize?: number
): PippengerState {
  const scalarBits = getScalarBits(curve.name);
  const w = windowSize || calculateOptimalWindowSize(numPoints, scalarBits);
  const numWindows = getNumWindows(scalarBits, w);
  const bucketsPerWindow = getBucketsPerWindow(w);

  // Initialize buckets for each window
  // buckets[window][bucket] = accumulated point
  const buckets: JacobianPoint[][] = new Array(numWindows);
  for (let i = 0; i < numWindows; i++) {
    buckets[i] = new Array(bucketsPerWindow);
    for (let j = 0; j < bucketsPerWindow; j++) {
      buckets[i]![j] = createJacobianIdentity(curve);
    }
  }

  return {
    windowSize: w,
    numWindows,
    bucketsPerWindow,
    buckets,
    curve,
  };
}

/**
 * Extract window bits from a scalar
 *
 * @param scalar - The scalar value
 * @param windowIndex - Which window to extract (0 = least significant)
 * @param windowSize - Number of bits per window
 * @returns The window value (0 to 2^windowSize - 1)
 */
function extractWindowBits(scalar: bigint, windowIndex: number, windowSize: number): number {
  const shift = BigInt(windowIndex * windowSize);
  const mask = (1n << BigInt(windowSize)) - 1n;
  return Number((scalar >> shift) & mask);
}

/**
 * Accumulate points into buckets based on scalar windows
 *
 * For each (scalar, point) pair, add the point to the appropriate bucket
 * in each window based on the scalar's bits in that window.
 */
function accumulateIntoBuckets(
  scalars: bigint[],
  points: JacobianPoint[],
  state: PippengerState
): void {
  const { windowSize, numWindows, buckets } = state;

  for (let i = 0; i < scalars.length; i++) {
    const scalar = scalars[i]!;
    const point = points[i]!;

    // Skip zero scalars
    if (scalar === 0n) {
      continue;
    }

    // Skip identity points
    if (isJacobianIdentity(point)) {
      continue;
    }

    // Add point to appropriate bucket in each window
    for (let w = 0; w < numWindows; w++) {
      const bucketIndex = extractWindowBits(scalar, w, windowSize);

      // Bucket 0 means no contribution from this window
      if (bucketIndex > 0) {
        // Bucket indices are 1-based in the scalar, but 0-based in our array
        const arrayIndex = bucketIndex - 1;
        buckets[w]![arrayIndex] = jacobianAdd(buckets[w]![arrayIndex]!, point, state.curve);
      }
    }
  }
}

/**
 * Reduce buckets within a single window
 *
 * Uses the running sum technique:
 * result = Σ(i * bucket[i]) for i = 1 to 2^w - 1
 *
 * This can be computed efficiently as:
 * runningSum = bucket[n-1]
 * result = runningSum
 * for i = n-2 down to 0:
 *   runningSum += bucket[i]
 *   result += runningSum
 */
function reduceBuckets(buckets: JacobianPoint[], curve: CurveConfig): JacobianPoint {
  const n = buckets.length;
  if (n === 0) {
    return createJacobianIdentity(curve);
  }

  // Start with the highest bucket
  let runningSum = buckets[n - 1]!;
  let result = runningSum;

  // Work backwards through buckets
  for (let i = n - 2; i >= 0; i--) {
    runningSum = jacobianAdd(runningSum, buckets[i]!, curve);
    result = jacobianAdd(result, runningSum, curve);
  }

  return result;
}

/**
 * Combine window results with appropriate shifts
 *
 * Each window result needs to be multiplied by 2^(windowIndex * windowSize)
 * This is done by repeated doubling.
 *
 * result = Σ(windowResult[i] * 2^(i * windowSize))
 *
 * Computed as:
 * result = windowResult[n-1]
 * for i = n-2 down to 0:
 *   result = result * 2^windowSize  (windowSize doublings)
 *   result += windowResult[i]
 */
function combineWindowResults(
  windowResults: JacobianPoint[],
  windowSize: number,
  curve: CurveConfig
): JacobianPoint {
  const n = windowResults.length;
  if (n === 0) {
    return createJacobianIdentity(curve);
  }

  // Start with the highest window
  let result = windowResults[n - 1]!;

  // Work backwards through windows
  for (let i = n - 2; i >= 0; i--) {
    // Multiply by 2^windowSize (windowSize doublings)
    for (let j = 0; j < windowSize; j++) {
      result = jacobianDouble(result, curve);
    }

    // Add this window's contribution
    result = jacobianAdd(result, windowResults[i]!, curve);
  }

  return result;
}

/**
 * Compute MSM using Pippenger's algorithm
 *
 * Computes Σ(scalars[i] * points[i]) using the bucket method.
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points (same length as scalars)
 * @param curve - Curve configuration
 * @param windowSize - Optional window size (auto-selected if not provided)
 * @returns The MSM result as a curve point
 */
export function pippengerMsm(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig,
  windowSize?: number
): CurvePoint {
  const n = scalars.length;

  // Handle empty input
  if (n === 0) {
    return createJacobianIdentity(curve);
  }

  // Handle single point case
  if (n === 1) {
    const jacobianPoint = toJacobian(points[0]!, curve);
    return scalarMulJacobian(scalars[0]!, jacobianPoint, curve);
  }

  // Convert all points to Jacobian coordinates
  const jacobianPoints: JacobianPoint[] = points.map((p) => toJacobian(p, curve));

  // Initialize Pippenger state
  const state = initializePippengerState(n, curve, windowSize);

  // Accumulate points into buckets
  accumulateIntoBuckets(scalars, jacobianPoints, state);

  // Reduce buckets in each window
  const windowResults: JacobianPoint[] = new Array(state.numWindows);
  for (let w = 0; w < state.numWindows; w++) {
    windowResults[w] = reduceBuckets(state.buckets[w]!, curve);
  }

  // Combine window results
  const result = combineWindowResults(windowResults, state.windowSize, curve);

  // Return in same format as first input point
  if (isAffinePoint(points[0]!)) {
    return jacobianToAffine(result, curve);
  }
  return result;
}

/**
 * Simple scalar multiplication for single point (used for n=1 case)
 * Uses double-and-add algorithm
 */
function scalarMulJacobian(
  scalar: bigint,
  point: JacobianPoint,
  curve: CurveConfig
): JacobianPoint {
  if (scalar === 0n) {
    return createJacobianIdentity(curve);
  }

  if (scalar < 0n) {
    throw new Error('Negative scalars not supported');
  }

  if (scalar === 1n) {
    return point;
  }

  if (isJacobianIdentity(point)) {
    return createJacobianIdentity(curve);
  }

  let result = createJacobianIdentity(curve);
  let base = point;
  let s = scalar;

  while (s > 0n) {
    if (s & 1n) {
      result = jacobianAdd(result, base, curve);
    }
    base = jacobianDouble(base, curve);
    s >>= 1n;
  }

  return result;
}

/**
 * Naive MSM implementation for testing/comparison
 *
 * Computes Σ(scalars[i] * points[i]) using simple scalar multiplication
 * and point addition. This is O(n * scalarBits) vs Pippenger's O(n / log(n)).
 */
export function naiveMsm(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig
): CurvePoint {
  const n = scalars.length;

  if (n === 0) {
    return createJacobianIdentity(curve);
  }

  let result = createJacobianIdentity(curve);

  for (let i = 0; i < n; i++) {
    const scalar = scalars[i]!;
    const point = toJacobian(points[i]!, curve);

    // Compute scalar * point
    const product = scalarMulJacobian(scalar, point, curve);

    // Add to result
    result = jacobianAdd(result, product, curve);
  }

  // Return in same format as first input point
  if (n > 0 && isAffinePoint(points[0]!)) {
    return jacobianToAffine(result, curve);
  }
  return result;
}
