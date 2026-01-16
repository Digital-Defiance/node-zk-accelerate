/**
 * Async API Wrappers for @digitaldefiance/node-zk-accelerate
 *
 * This module provides Promise-based async wrappers for all major operations,
 * enabling better integration with async workflows and non-blocking execution.
 *
 * Requirements: 14.5
 *
 * @module async
 */

import type {
  FieldElement,
  CurvePoint,
  CurveConfig,
  Scalar,
  MSMOptions,
  NTTOptions,
  CurveName,
} from './types.js';

import { msm, msmAsync, batchMsm } from './msm/msm.js';
import { forwardNtt, inverseNtt, batchForwardNtt, batchInverseNtt } from './ntt/index.js';
import type { NTTConfig } from './ntt/config.js';
import { batchInv } from './field/operations.js';

// ============================================================================
// Async MSM Operations
// ============================================================================

/**
 * Async Multi-Scalar Multiplication
 *
 * Computes Σ(scalars[i] * points[i]) asynchronously, allowing for
 * non-blocking execution and better integration with async workflows.
 *
 * @param scalars - Array of scalar values (bigint or Scalar objects)
 * @param points - Array of curve points
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns Promise resolving to the MSM result point
 *
 * @example
 * ```typescript
 * import { computeMsmAsync, BN254_CURVE } from '@digitaldefiance/node-zk-accelerate';
 *
 * const result = await computeMsmAsync(scalars, points, BN254_CURVE, {
 *   accelerationHint: 'auto',
 * });
 * ```
 */
export async function computeMsmAsync(
  scalars: (bigint | Scalar)[],
  points: CurvePoint[],
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): Promise<CurvePoint> {
  return msmAsync(scalars, points, curve, options);
}

/**
 * Async batch MSM computation
 *
 * Computes multiple independent MSM operations asynchronously.
 *
 * @param batches - Array of {scalars, points} pairs
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns Promise resolving to array of MSM result points
 *
 * @example
 * ```typescript
 * const results = await computeBatchMsmAsync([
 *   { scalars: [1n, 2n], points: [p1, p2] },
 *   { scalars: [3n, 4n], points: [p3, p4] },
 * ], BN254_CURVE);
 * ```
 */
export async function computeBatchMsmAsync(
  batches: Array<{ scalars: (bigint | Scalar)[]; points: CurvePoint[] }>,
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): Promise<CurvePoint[]> {
  // Process batches in parallel using Promise.all
  const promises = batches.map((batch) =>
    msmAsync(batch.scalars, batch.points, curve, options)
  );
  return Promise.all(promises);
}

/**
 * Sync MSM wrapped as Promise for API consistency
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns Promise resolving to the MSM result point
 */
export async function msmPromise(
  scalars: (bigint | Scalar)[],
  points: CurvePoint[],
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): Promise<CurvePoint> {
  return Promise.resolve(msm(scalars, points, curve, options));
}

/**
 * Batch MSM wrapped as Promise
 *
 * @param batches - Array of {scalars, points} pairs
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns Promise resolving to array of MSM result points
 */
export async function batchMsmPromise(
  batches: Array<{ scalars: (bigint | Scalar)[]; points: CurvePoint[] }>,
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): Promise<CurvePoint[]> {
  return Promise.resolve(batchMsm(batches, curve, options));
}

// ============================================================================
// Async NTT Operations
// ============================================================================

/**
 * Async forward NTT
 *
 * Computes the forward Number Theoretic Transform asynchronously.
 *
 * @param coefficients - Polynomial coefficients
 * @param options - NTT options
 * @returns Promise resolving to transformed values
 *
 * @example
 * ```typescript
 * const transformed = await computeForwardNttAsync(coefficients, { radix: 2 });
 * ```
 */
export async function computeForwardNttAsync(
  coefficients: FieldElement[],
  options?: NTTOptions
): Promise<FieldElement[]> {
  return Promise.resolve(forwardNtt(coefficients, options));
}

/**
 * Async inverse NTT
 *
 * Computes the inverse Number Theoretic Transform asynchronously.
 *
 * @param values - Transformed values
 * @param options - NTT options
 * @returns Promise resolving to original coefficients
 *
 * @example
 * ```typescript
 * const coefficients = await computeInverseNttAsync(transformed, { radix: 2 });
 * ```
 */
export async function computeInverseNttAsync(
  values: FieldElement[],
  options?: NTTOptions
): Promise<FieldElement[]> {
  return Promise.resolve(inverseNtt(values, options));
}

/**
 * Async batch forward NTT
 *
 * Processes multiple polynomials with forward NTT asynchronously.
 *
 * @param polynomials - Array of polynomial coefficient arrays
 * @param config - NTT configuration
 * @param options - NTT options
 * @returns Promise resolving to array of transformed polynomials
 */
export async function computeBatchForwardNttAsync(
  polynomials: FieldElement[][],
  config: NTTConfig,
  options?: NTTOptions
): Promise<FieldElement[][]> {
  return Promise.resolve(batchForwardNtt(polynomials, config, options));
}

/**
 * Async batch inverse NTT
 *
 * Processes multiple polynomials with inverse NTT asynchronously.
 *
 * @param polynomials - Array of transformed polynomial arrays
 * @param config - NTT configuration
 * @param options - NTT options
 * @returns Promise resolving to array of original coefficient arrays
 */
export async function computeBatchInverseNttAsync(
  polynomials: FieldElement[][],
  config: NTTConfig,
  options?: NTTOptions
): Promise<FieldElement[][]> {
  return Promise.resolve(batchInverseNtt(polynomials, config, options));
}

// ============================================================================
// Async Field Operations
// ============================================================================

/**
 * Async batch field inversion
 *
 * Computes inverses of multiple field elements asynchronously using
 * Montgomery's batch inversion trick.
 *
 * @param elements - Array of field elements to invert
 * @returns Promise resolving to array of inverses
 *
 * @example
 * ```typescript
 * const inverses = await computeBatchInvAsync(elements);
 * ```
 */
export async function computeBatchInvAsync(
  elements: FieldElement[]
): Promise<FieldElement[]> {
  return Promise.resolve(batchInv(elements));
}

// ============================================================================
// Utility Types for Async Operations
// ============================================================================

/**
 * Result type for async operations with timing information
 */
export interface AsyncOperationResult<T> {
  /** The operation result */
  result: T;
  /** Execution time in milliseconds */
  timeMs: number;
  /** Whether the operation was executed asynchronously */
  async: boolean;
}

/**
 * Execute an operation and measure its execution time
 *
 * @param operation - The operation to execute
 * @returns Promise resolving to result with timing info
 *
 * @example
 * ```typescript
 * const { result, timeMs } = await withTiming(() => msm(scalars, points, curve));
 * console.log(`MSM took ${timeMs}ms`);
 * ```
 */
export async function withTiming<T>(
  operation: () => T | Promise<T>
): Promise<AsyncOperationResult<T>> {
  const start = performance.now();
  const result = await operation();
  const end = performance.now();

  return {
    result,
    timeMs: end - start,
    async: true,
  };
}

/**
 * Execute multiple operations in parallel
 *
 * @param operations - Array of operations to execute
 * @returns Promise resolving to array of results
 *
 * @example
 * ```typescript
 * const results = await parallel([
 *   () => msm(scalars1, points1, curve),
 *   () => msm(scalars2, points2, curve),
 * ]);
 * ```
 */
export async function parallel<T>(
  operations: Array<() => T | Promise<T>>
): Promise<T[]> {
  return Promise.all(operations.map((op) => op()));
}

/**
 * Execute operations sequentially
 *
 * @param operations - Array of operations to execute
 * @returns Promise resolving to array of results
 *
 * @example
 * ```typescript
 * const results = await sequential([
 *   () => msm(scalars1, points1, curve),
 *   () => msm(scalars2, points2, curve),
 * ]);
 * ```
 */
export async function sequential<T>(
  operations: Array<() => T | Promise<T>>
): Promise<T[]> {
  const results: T[] = [];
  for (const op of operations) {
    results.push(await op());
  }
  return results;
}

/**
 * Retry an operation with exponential backoff
 *
 * @param operation - The operation to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelayMs - Base delay in milliseconds (default: 100)
 * @returns Promise resolving to the operation result
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => msmAsync(scalars, points, curve),
 *   3,
 *   100
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Re-throw the last error
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError));
}

/**
 * Execute an operation with a timeout
 *
 * @param operation - The operation to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to the operation result
 * @throws Error if the operation times out
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => msmAsync(scalars, points, curve),
 *   5000 // 5 second timeout
 * );
 * ```
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}
