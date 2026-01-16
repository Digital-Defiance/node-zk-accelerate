/**
 * Multi-Scalar Multiplication (MSM) API
 *
 * This module provides the main MSM API that routes to the appropriate
 * implementation based on input size and hardware availability.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.10
 */

import type { CurvePoint, CurveConfig, Scalar, MSMOptions, CurveName } from '../types.js';
import { getCurveConfig } from '../curve/config.js';
import { pippengerMsm, naiveMsm } from './pippenger.js';
import { validateMsmInputs, extractScalarValues } from './validation.js';
import { selectAccelerationPath, createMsmConfig, type AccelerationPath } from './router.js';
import { calculateOptimalWindowSize } from './config.js';
import { hybridMsmSync, hybridMsm, type HybridMSMResult } from './hybrid.js';

/**
 * MSM result with metadata
 */
export interface MSMResult {
  /** The computed MSM result point */
  point: CurvePoint;
  /** The acceleration path used */
  accelerationPath: AccelerationPath;
  /** Number of points processed */
  numPoints: number;
  /** Window size used (for Pippenger) */
  windowSize: number;
}

/**
 * Compute Multi-Scalar Multiplication
 *
 * Computes Σ(scalars[i] * points[i]) using the optimal algorithm
 * based on input size and hardware availability.
 *
 * @param scalars - Array of scalar values (bigint or Scalar objects)
 * @param points - Array of curve points
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns The MSM result point
 *
 * @example
 * ```typescript
 * import { msm, BN254_CURVE } from '@digitaldefiance/node-zk-accelerate';
 *
 * const scalars = [123n, 456n, 789n];
 * const points = [point1, point2, point3];
 * const result = msm(scalars, points, BN254_CURVE);
 * ```
 */
export function msm(
  scalars: (bigint | Scalar)[],
  points: CurvePoint[],
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): CurvePoint {
  // Resolve curve configuration
  const curveConfig = typeof curve === 'string' ? getCurveConfig(curve) : curve;

  // Extract scalar values
  const scalarValues = extractScalarValues(scalars);

  // Create configuration - filter out undefined values
  const configOptions: {
    windowSize?: number;
    gpuThreshold?: number;
    validateInputs: boolean;
    accelerationHint: 'cpu' | 'gpu' | 'hybrid' | 'auto';
  } = {
    validateInputs: options?.validateInputs ?? true,
    accelerationHint: options?.accelerationHint ?? 'auto',
  };
  if (options?.windowSize !== undefined) {
    configOptions.windowSize = options.windowSize;
  }
  if (options?.gpuThreshold !== undefined) {
    configOptions.gpuThreshold = options.gpuThreshold;
  }
  const config = createMsmConfig(configOptions);

  // Validate inputs if enabled
  if (config.validateInputs) {
    validateMsmInputs(scalarValues, points, curveConfig, true);
  }

  // Select acceleration path
  const path = selectAccelerationPath(scalarValues.length, {
    gpuThreshold: config.gpuThreshold,
    hint: config.accelerationHint,
  });

  // Execute MSM based on selected path
  return executeMsm(scalarValues, points, curveConfig, path, config.windowSize);
}

/**
 * Compute MSM with detailed result including metadata
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns MSM result with metadata
 */
export function msmWithMetadata(
  scalars: (bigint | Scalar)[],
  points: CurvePoint[],
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): MSMResult {
  // Resolve curve configuration
  const curveConfig = typeof curve === 'string' ? getCurveConfig(curve) : curve;

  // Extract scalar values
  const scalarValues = extractScalarValues(scalars);

  // Create configuration - filter out undefined values
  const configOptions2: {
    windowSize?: number;
    gpuThreshold?: number;
    validateInputs: boolean;
    accelerationHint: 'cpu' | 'gpu' | 'hybrid' | 'auto';
  } = {
    validateInputs: options?.validateInputs ?? true,
    accelerationHint: options?.accelerationHint ?? 'auto',
  };
  if (options?.windowSize !== undefined) {
    configOptions2.windowSize = options.windowSize;
  }
  if (options?.gpuThreshold !== undefined) {
    configOptions2.gpuThreshold = options.gpuThreshold;
  }
  const config = createMsmConfig(configOptions2);

  // Validate inputs if enabled
  if (config.validateInputs) {
    validateMsmInputs(scalarValues, points, curveConfig, true);
  }

  // Select acceleration path
  const path = selectAccelerationPath(scalarValues.length, {
    gpuThreshold: config.gpuThreshold,
    hint: config.accelerationHint,
  });

  // Calculate window size
  const windowSize = config.windowSize || calculateOptimalWindowSize(scalarValues.length);

  // Execute MSM
  const point = executeMsm(scalarValues, points, curveConfig, path, config.windowSize);

  return {
    point,
    accelerationPath: path,
    numPoints: scalarValues.length,
    windowSize,
  };
}

/**
 * Execute MSM using the specified acceleration path
 */
function executeMsm(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig,
  path: AccelerationPath,
  windowSize?: number
): CurvePoint {
  switch (path) {
    case 'cpu':
      return pippengerMsm(scalars, points, curve, windowSize);

    case 'gpu':
      // GPU implementation not yet available, fall back to CPU
      // TODO: Implement Metal GPU MSM in task 11.2
      return pippengerMsm(scalars, points, curve, windowSize);

    case 'hybrid': {
      // Use hybrid executor (sync version for compatibility)
      const hybridOptions = windowSize !== undefined ? { windowSize } : {};
      const result = hybridMsmSync(scalars, points, curve, hybridOptions);
      return result.point;
    }

    default:
      return pippengerMsm(scalars, points, curve, windowSize);
  }
}

/**
 * Batch MSM computation
 *
 * Computes multiple independent MSM operations efficiently.
 *
 * @param batches - Array of {scalars, points} pairs
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns Array of MSM result points
 */
export function batchMsm(
  batches: Array<{ scalars: (bigint | Scalar)[]; points: CurvePoint[] }>,
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): CurvePoint[] {
  return batches.map((batch) => msm(batch.scalars, batch.points, curve, options));
}

/**
 * Async MSM computation
 *
 * Computes MSM asynchronously, allowing for better integration with
 * async workflows and potential future GPU acceleration.
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns Promise resolving to the MSM result point
 */
export async function msmAsync(
  scalars: (bigint | Scalar)[],
  points: CurvePoint[],
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): Promise<CurvePoint> {
  // Resolve curve configuration
  const curveConfig = typeof curve === 'string' ? getCurveConfig(curve) : curve;

  // Extract scalar values
  const scalarValues = extractScalarValues(scalars);

  // Create configuration
  const configOptions: {
    windowSize?: number;
    gpuThreshold?: number;
    validateInputs: boolean;
    accelerationHint: 'cpu' | 'gpu' | 'hybrid' | 'auto';
  } = {
    validateInputs: options?.validateInputs ?? true,
    accelerationHint: options?.accelerationHint ?? 'auto',
  };
  if (options?.windowSize !== undefined) {
    configOptions.windowSize = options.windowSize;
  }
  if (options?.gpuThreshold !== undefined) {
    configOptions.gpuThreshold = options.gpuThreshold;
  }
  const config = createMsmConfig(configOptions);

  // Validate inputs if enabled
  if (config.validateInputs) {
    validateMsmInputs(scalarValues, points, curveConfig, true);
  }

  // Select acceleration path
  const path = selectAccelerationPath(scalarValues.length, {
    gpuThreshold: config.gpuThreshold,
    hint: config.accelerationHint,
  });

  // For hybrid path, use async hybrid execution
  if (path === 'hybrid') {
    const result = await hybridMsm(scalarValues, points, curveConfig, {
      windowSize: config.windowSize,
    });
    return result.point;
  }

  // For other paths, use sync execution
  return executeMsm(scalarValues, points, curveConfig, path, config.windowSize);
}

/**
 * Async MSM computation with detailed result
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - Curve configuration or curve name
 * @param options - Optional MSM configuration
 * @returns Promise resolving to hybrid MSM result with timing info
 */
export async function msmAsyncWithMetadata(
  scalars: (bigint | Scalar)[],
  points: CurvePoint[],
  curve: CurveConfig | CurveName,
  options?: MSMOptions
): Promise<HybridMSMResult> {
  // Resolve curve configuration
  const curveConfig = typeof curve === 'string' ? getCurveConfig(curve) : curve;

  // Extract scalar values
  const scalarValues = extractScalarValues(scalars);

  // Create configuration
  const configOptions: {
    windowSize?: number;
    gpuThreshold?: number;
    validateInputs: boolean;
    accelerationHint: 'cpu' | 'gpu' | 'hybrid' | 'auto';
  } = {
    validateInputs: options?.validateInputs ?? true,
    accelerationHint: options?.accelerationHint ?? 'auto',
  };
  if (options?.windowSize !== undefined) {
    configOptions.windowSize = options.windowSize;
  }
  if (options?.gpuThreshold !== undefined) {
    configOptions.gpuThreshold = options.gpuThreshold;
  }
  const config = createMsmConfig(configOptions);

  // Validate inputs if enabled
  if (config.validateInputs) {
    validateMsmInputs(scalarValues, points, curveConfig, true);
  }

  // Use hybrid execution for detailed timing
  return hybridMsm(scalarValues, points, curveConfig, {
    windowSize: config.windowSize,
  });
}

/**
 * Naive MSM for testing and comparison
 *
 * Uses simple scalar multiplication and addition.
 * O(n * scalarBits) complexity vs Pippenger's O(n / log(n)).
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - Curve configuration or curve name
 * @returns The MSM result point
 */
export function msmNaive(
  scalars: (bigint | Scalar)[],
  points: CurvePoint[],
  curve: CurveConfig | CurveName
): CurvePoint {
  const curveConfig = typeof curve === 'string' ? getCurveConfig(curve) : curve;
  const scalarValues = extractScalarValues(scalars);
  return naiveMsm(scalarValues, points, curveConfig);
}
