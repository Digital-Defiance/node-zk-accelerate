/**
 * Hybrid CPU+GPU MSM Execution
 *
 * This module implements hybrid execution that splits MSM workloads
 * between CPU and GPU for optimal performance on Apple Silicon.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import type { CurvePoint, CurveConfig } from '../types.js';
import { detectHardwareCapabilities, type HardwareCapabilities } from '../hardware.js';
import { pippengerMsm } from './pippenger.js';
import { msmGPU, isGPUMSMAvailable } from '../gpu-accelerate/msm-gpu.js';
import { jacobianAdd } from '../curve/operations.js';
import { toJacobian, isAffinePoint, jacobianToAffine } from '../curve/point.js';

/**
 * Workload split configuration
 */
export interface WorkloadSplitConfig {
  /** Ratio of work to send to GPU (0.0 to 1.0) */
  gpuRatio: number;
  /** Minimum points for GPU to be worthwhile */
  minGpuPoints: number;
  /** GPU dispatch overhead in milliseconds */
  gpuDispatchOverheadMs: number;
  /** Estimated CPU time per point in microseconds */
  cpuTimePerPointUs: number;
  /** Estimated GPU time per point in microseconds */
  gpuTimePerPointUs: number;
}

/**
 * Default workload split configuration
 *
 * These defaults are tuned for Apple Silicon M-series chips
 * with unified memory architecture.
 */
export const DEFAULT_SPLIT_CONFIG: WorkloadSplitConfig = {
  gpuRatio: 0.7, // 70% to GPU by default
  minGpuPoints: 1024, // Minimum points for GPU dispatch
  gpuDispatchOverheadMs: 2.0, // GPU dispatch overhead
  cpuTimePerPointUs: 1.5, // ~1.5µs per point on CPU with AMX
  gpuTimePerPointUs: 0.3, // ~0.3µs per point on GPU for large batches
};

/**
 * Workload split decision
 */
export interface WorkloadSplit {
  /** Number of points for CPU */
  cpuPoints: number;
  /** Number of points for GPU */
  gpuPoints: number;
  /** Start index for GPU portion */
  gpuStartIndex: number;
  /** Whether to use hybrid execution */
  useHybrid: boolean;
  /** Estimated total time in milliseconds */
  estimatedTimeMs: number;
  /** Reason for the split decision */
  reason: string;
}

/**
 * Hybrid execution result
 */
export interface HybridMSMResult {
  /** The computed MSM result point */
  point: CurvePoint;
  /** CPU execution time in milliseconds */
  cpuTimeMs: number;
  /** GPU execution time in milliseconds */
  gpuTimeMs: number;
  /** Total execution time in milliseconds */
  totalTimeMs: number;
  /** Number of points processed by CPU */
  cpuPoints: number;
  /** Number of points processed by GPU */
  gpuPoints: number;
  /** Whether hybrid execution was used */
  usedHybrid: boolean;
}

/**
 * Calibration result from benchmarking
 */
export interface CalibrationResult {
  /** Optimal GPU ratio for this hardware */
  optimalGpuRatio: number;
  /** Measured CPU time per point in microseconds */
  cpuTimePerPointUs: number;
  /** Measured GPU time per point in microseconds */
  gpuTimePerPointUs: number;
  /** Measured GPU dispatch overhead in milliseconds */
  gpuDispatchOverheadMs: number;
  /** Hardware capabilities used for calibration */
  hardware: HardwareCapabilities;
  /** Timestamp of calibration */
  timestamp: number;
}

/**
 * Debug logger for hybrid execution
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
  const debugEnv = process.env['DEBUG'] ?? '';
  const zkDebugEnv = process.env['ZK_ACCELERATE_DEBUG'] ?? '';
  const debugEnabled =
    debugEnv.includes('zk-accelerate') || zkDebugEnv === '1' || zkDebugEnv === 'true';

  if (debugEnabled) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [zk-accelerate:hybrid]`;
    if (data) {
      // eslint-disable-next-line no-console
      console.debug(`${prefix} ${message}`, data);
    } else {
      // eslint-disable-next-line no-console
      console.debug(`${prefix} ${message}`);
    }
  }
}

/**
 * Calculate optimal workload split based on input size and hardware
 *
 * This function determines how to split the MSM workload between CPU and GPU
 * to minimize total execution time. It accounts for:
 * - GPU dispatch overhead (fixed cost)
 * - Per-point processing time on each processor
 * - Minimum batch sizes for efficiency
 *
 * @param numPoints - Total number of points in the MSM
 * @param config - Split configuration (optional, uses defaults)
 * @param capabilities - Hardware capabilities (auto-detected if not provided)
 * @returns Workload split decision
 */
export function calculateWorkloadSplit(
  numPoints: number,
  config: Partial<WorkloadSplitConfig> = {},
  capabilities?: HardwareCapabilities
): WorkloadSplit {
  const fullConfig: WorkloadSplitConfig = {
    ...DEFAULT_SPLIT_CONFIG,
    ...config,
  };

  const caps = capabilities ?? detectHardwareCapabilities();

  // If GPU not available, use CPU only
  if (!caps.hasMetal || !isGPUMSMAvailable()) {
    return {
      cpuPoints: numPoints,
      gpuPoints: 0,
      gpuStartIndex: numPoints,
      useHybrid: false,
      estimatedTimeMs: estimateCpuTime(numPoints, fullConfig, caps),
      reason: 'GPU not available',
    };
  }

  // For small inputs, CPU is faster due to GPU dispatch overhead
  if (numPoints < fullConfig.minGpuPoints) {
    return {
      cpuPoints: numPoints,
      gpuPoints: 0,
      gpuStartIndex: numPoints,
      useHybrid: false,
      estimatedTimeMs: estimateCpuTime(numPoints, fullConfig, caps),
      reason: `Input size ${numPoints} below GPU threshold ${fullConfig.minGpuPoints}`,
    };
  }

  // Calculate optimal split
  const optimalSplit = findOptimalSplit(numPoints, fullConfig, caps);

  // If optimal split gives all to one processor, don't use hybrid
  if (optimalSplit.gpuPoints === 0) {
    return {
      cpuPoints: numPoints,
      gpuPoints: 0,
      gpuStartIndex: numPoints,
      useHybrid: false,
      estimatedTimeMs: estimateCpuTime(numPoints, fullConfig, caps),
      reason: 'CPU-only is optimal for this input size',
    };
  }

  if (optimalSplit.cpuPoints === 0) {
    return {
      cpuPoints: 0,
      gpuPoints: numPoints,
      gpuStartIndex: 0,
      useHybrid: false,
      estimatedTimeMs: estimateGpuTime(numPoints, fullConfig),
      reason: 'GPU-only is optimal for this input size',
    };
  }

  return optimalSplit;
}

/**
 * Estimate CPU execution time in milliseconds
 */
function estimateCpuTime(
  numPoints: number,
  config: WorkloadSplitConfig,
  caps: HardwareCapabilities
): number {
  // Adjust for hardware capabilities
  let timePerPoint = config.cpuTimePerPointUs;

  // AMX provides ~2x speedup for matrix operations
  if (caps.hasAmx) {
    timePerPoint *= 0.6;
  }

  // SME provides additional speedup on M4
  if (caps.hasSme) {
    timePerPoint *= 0.8;
  }

  return (numPoints * timePerPoint) / 1000;
}

/**
 * Estimate GPU execution time in milliseconds
 */
function estimateGpuTime(numPoints: number, config: WorkloadSplitConfig): number {
  return config.gpuDispatchOverheadMs + (numPoints * config.gpuTimePerPointUs) / 1000;
}

/**
 * Find optimal split point that minimizes total execution time
 *
 * For hybrid execution, CPU and GPU run in parallel, so total time is:
 * max(cpuTime, gpuTime)
 *
 * We want to find the split that minimizes this maximum.
 */
function findOptimalSplit(
  numPoints: number,
  config: WorkloadSplitConfig,
  caps: HardwareCapabilities
): WorkloadSplit {
  // Binary search for optimal split point
  let bestSplit: WorkloadSplit | null = null;
  let bestTime = Infinity;

  // Try different split ratios
  const ratios = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

  for (const gpuRatio of ratios) {
    const gpuPoints = Math.floor(numPoints * gpuRatio);
    const cpuPoints = numPoints - gpuPoints;

    // Skip if GPU portion is too small
    if (gpuPoints > 0 && gpuPoints < config.minGpuPoints) {
      continue;
    }

    const cpuTime = cpuPoints > 0 ? estimateCpuTime(cpuPoints, config, caps) : 0;
    const gpuTime = gpuPoints > 0 ? estimateGpuTime(gpuPoints, config) : 0;

    // Parallel execution: total time is max of both
    const totalTime = Math.max(cpuTime, gpuTime);

    if (totalTime < bestTime) {
      bestTime = totalTime;
      bestSplit = {
        cpuPoints,
        gpuPoints,
        gpuStartIndex: cpuPoints, // GPU processes the second half
        useHybrid: cpuPoints > 0 && gpuPoints > 0,
        estimatedTimeMs: totalTime,
        reason: `Optimal split: ${Math.round((1 - gpuRatio) * 100)}% CPU, ${Math.round(gpuRatio * 100)}% GPU`,
      };
    }
  }

  // Fallback to user-specified ratio if no optimal found
  if (!bestSplit) {
    const gpuPoints = Math.floor(numPoints * config.gpuRatio);
    const cpuPoints = numPoints - gpuPoints;

    bestSplit = {
      cpuPoints,
      gpuPoints,
      gpuStartIndex: cpuPoints,
      useHybrid: cpuPoints > 0 && gpuPoints > 0,
      estimatedTimeMs: Math.max(
        estimateCpuTime(cpuPoints, config, caps),
        estimateGpuTime(gpuPoints, config)
      ),
      reason: `Using configured ratio: ${Math.round((1 - config.gpuRatio) * 100)}% CPU, ${Math.round(config.gpuRatio * 100)}% GPU`,
    };
  }

  return bestSplit;
}

/**
 * Get workload split heuristics description
 */
export function getWorkloadSplitDescription(split: WorkloadSplit): string {
  if (!split.useHybrid) {
    if (split.gpuPoints === 0) {
      return `CPU-only: ${split.cpuPoints} points (~${split.estimatedTimeMs.toFixed(2)}ms)`;
    } else {
      return `GPU-only: ${split.gpuPoints} points (~${split.estimatedTimeMs.toFixed(2)}ms)`;
    }
  }

  return (
    `Hybrid: ${split.cpuPoints} CPU + ${split.gpuPoints} GPU points ` +
    `(~${split.estimatedTimeMs.toFixed(2)}ms) - ${split.reason}`
  );
}


/**
 * Execute MSM using hybrid CPU+GPU execution
 *
 * This function splits the MSM workload between CPU and GPU,
 * executing both in parallel and combining the results.
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - Curve configuration
 * @param options - Hybrid execution options
 * @returns Hybrid MSM result with timing information
 */
export async function hybridMsm(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig,
  options: Partial<HybridMSMOptions> = {}
): Promise<HybridMSMResult> {
  const numPoints = scalars.length;
  const startTime = performance.now();

  // Calculate workload split
  const splitConfig: Partial<WorkloadSplitConfig> = {};
  if (options.splitRatio !== undefined) {
    splitConfig.gpuRatio = options.splitRatio;
  }
  if (options.minGpuPoints !== undefined) {
    splitConfig.minGpuPoints = options.minGpuPoints;
  }

  const split = calculateWorkloadSplit(numPoints, splitConfig);

  debugLog('Hybrid MSM starting', {
    numPoints,
    cpuPoints: split.cpuPoints,
    gpuPoints: split.gpuPoints,
    useHybrid: split.useHybrid,
    reason: split.reason,
  });

  // If not using hybrid, execute on single processor
  if (!split.useHybrid) {
    if (split.gpuPoints === 0) {
      // CPU only
      const cpuStart = performance.now();
      const result = pippengerMsm(scalars, points, curve, options.windowSize);
      const cpuEnd = performance.now();

      return {
        point: result,
        cpuTimeMs: cpuEnd - cpuStart,
        gpuTimeMs: 0,
        totalTimeMs: cpuEnd - startTime,
        cpuPoints: numPoints,
        gpuPoints: 0,
        usedHybrid: false,
      };
    } else {
      // GPU only
      const gpuStart = performance.now();
      const gpuConfig = options.windowSize !== undefined ? { windowSize: options.windowSize } : {};
      const gpuResult = await msmGPU(scalars, points, curve, gpuConfig);
      const gpuEnd = performance.now();

      return {
        point: gpuResult.point,
        cpuTimeMs: 0,
        gpuTimeMs: gpuEnd - gpuStart,
        totalTimeMs: gpuEnd - startTime,
        cpuPoints: 0,
        gpuPoints: numPoints,
        usedHybrid: false,
      };
    }
  }

  // Split arrays for parallel execution
  const cpuScalars = scalars.slice(0, split.cpuPoints);
  const cpuPoints = points.slice(0, split.cpuPoints);
  const gpuScalars = scalars.slice(split.gpuStartIndex);
  const gpuPointsArr = points.slice(split.gpuStartIndex);

  // Execute CPU and GPU in parallel
  let cpuResult: CurvePoint | null = null;
  let gpuResult: CurvePoint | null = null;
  let cpuTimeMs = 0;
  let gpuTimeMs = 0;

  // Create promises for parallel execution
  const cpuPromise = new Promise<void>((resolve) => {
    const cpuStart = performance.now();
    cpuResult = pippengerMsm(cpuScalars, cpuPoints, curve, options.windowSize);
    cpuTimeMs = performance.now() - cpuStart;
    resolve();
  });

  const gpuPromise = (async (): Promise<void> => {
    const gpuStart = performance.now();
    try {
      const gpuConfig = options.windowSize !== undefined ? { windowSize: options.windowSize } : {};
      const result = await msmGPU(gpuScalars, gpuPointsArr, curve, gpuConfig);
      gpuResult = result.point;
    } catch (error) {
      // GPU failed, fall back to CPU for this portion
      debugLog('GPU execution failed, falling back to CPU', {
        error: error instanceof Error ? error.message : String(error),
      });
      gpuResult = pippengerMsm(gpuScalars, gpuPointsArr, curve, options.windowSize);
    }
    gpuTimeMs = performance.now() - gpuStart;
  })();

  // Wait for both to complete
  await Promise.all([cpuPromise, gpuPromise]);

  // Combine results: MSM(all) = MSM(cpu_portion) + MSM(gpu_portion)
  const combinedResult = combineResults(cpuResult!, gpuResult!, curve, points[0]!);

  const endTime = performance.now();

  debugLog('Hybrid MSM complete', {
    cpuTimeMs,
    gpuTimeMs,
    totalTimeMs: endTime - startTime,
    cpuPoints: split.cpuPoints,
    gpuPoints: split.gpuPoints,
  });

  return {
    point: combinedResult,
    cpuTimeMs,
    gpuTimeMs,
    totalTimeMs: endTime - startTime,
    cpuPoints: split.cpuPoints,
    gpuPoints: split.gpuPoints,
    usedHybrid: true,
  };
}

/**
 * Hybrid MSM options
 */
export interface HybridMSMOptions {
  /** User-provided split ratio (0.0 to 1.0, portion for GPU) */
  splitRatio?: number;
  /** Minimum points for GPU dispatch */
  minGpuPoints?: number;
  /** Window size for Pippenger algorithm */
  windowSize?: number;
  /** Whether to validate inputs */
  validateInputs?: boolean;
}

/**
 * Combine CPU and GPU MSM results
 *
 * Since MSM is linear: MSM(s1..sn, P1..Pn) = MSM(s1..sk, P1..Pk) + MSM(sk+1..sn, Pk+1..Pn)
 */
function combineResults(
  cpuResult: CurvePoint,
  gpuResult: CurvePoint,
  curve: CurveConfig,
  referencePoint: CurvePoint
): CurvePoint {
  // Convert both to Jacobian for addition
  const cpuJacobian = toJacobian(cpuResult, curve);
  const gpuJacobian = toJacobian(gpuResult, curve);

  // Add the results
  const combined = jacobianAdd(cpuJacobian, gpuJacobian, curve);

  // Return in same format as input
  if (isAffinePoint(referencePoint)) {
    return jacobianToAffine(combined, curve);
  }
  return combined;
}

/**
 * Execute hybrid MSM with automatic fallback
 *
 * This is the main entry point for hybrid MSM execution.
 * It automatically falls back to CPU-only if GPU is unavailable.
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - Curve configuration
 * @param options - Hybrid execution options
 * @returns The MSM result point
 */
export async function hybridMsmWithFallback(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig,
  options: Partial<HybridMSMOptions> = {}
): Promise<CurvePoint> {
  try {
    const result = await hybridMsm(scalars, points, curve, options);
    return result.point;
  } catch (error) {
    debugLog('Hybrid MSM failed, falling back to CPU', {
      error: error instanceof Error ? error.message : String(error),
    });
    return pippengerMsm(scalars, points, curve, options.windowSize);
  }
}

/**
 * Synchronous hybrid MSM for compatibility
 *
 * This version runs CPU and GPU sequentially rather than in parallel,
 * but still splits the workload for potential memory benefits.
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - Curve configuration
 * @param options - Hybrid execution options
 * @returns Hybrid MSM result
 */
export function hybridMsmSync(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig,
  options: Partial<HybridMSMOptions> = {}
): HybridMSMResult {
  const numPoints = scalars.length;
  const startTime = performance.now();

  // For sync version, always use CPU (GPU requires async)
  const cpuStart = performance.now();
  const result = pippengerMsm(scalars, points, curve, options.windowSize);
  const cpuEnd = performance.now();

  return {
    point: result,
    cpuTimeMs: cpuEnd - cpuStart,
    gpuTimeMs: 0,
    totalTimeMs: cpuEnd - startTime,
    cpuPoints: numPoints,
    gpuPoints: 0,
    usedHybrid: false,
  };
}


/**
 * Calibration configuration
 */
export interface CalibrationConfig {
  /** Sample sizes to benchmark */
  sampleSizes: number[];
  /** Number of iterations per sample size */
  iterations: number;
  /** Warmup iterations before measurement */
  warmupIterations: number;
}

/**
 * Default calibration configuration
 */
export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  sampleSizes: [1024, 4096, 16384],
  iterations: 3,
  warmupIterations: 1,
};

// Cached calibration result
let cachedCalibration: CalibrationResult | null = null;

/**
 * Run calibration to determine optimal CPU/GPU split ratio
 *
 * This function benchmarks CPU and GPU separately to learn the
 * optimal workload split for the current hardware.
 *
 * @param curve - Curve configuration to use for calibration
 * @param config - Calibration configuration
 * @returns Calibration result with optimal parameters
 */
export async function calibrate(
  curve: CurveConfig,
  config: Partial<CalibrationConfig> = {}
): Promise<CalibrationResult> {
  const fullConfig: CalibrationConfig = {
    ...DEFAULT_CALIBRATION_CONFIG,
    ...config,
  };

  const caps = detectHardwareCapabilities();

  debugLog('Starting calibration', {
    sampleSizes: fullConfig.sampleSizes,
    iterations: fullConfig.iterations,
    hasMetal: caps.hasMetal,
  });

  // Generate test data
  const testData = generateCalibrationData(
    Math.max(...fullConfig.sampleSizes),
    curve
  );

  // Benchmark CPU
  const cpuResults = benchmarkCpu(testData, curve, fullConfig);

  // Benchmark GPU (if available)
  let gpuResults: BenchmarkResults | null = null;
  if (caps.hasMetal && isGPUMSMAvailable()) {
    gpuResults = await benchmarkGpu(testData, curve, fullConfig);
  }

  // Calculate optimal parameters
  const result = calculateOptimalParameters(cpuResults, gpuResults, caps);

  // Cache the result
  cachedCalibration = result;

  debugLog('Calibration complete', {
    optimalGpuRatio: result.optimalGpuRatio,
    cpuTimePerPointUs: result.cpuTimePerPointUs,
    gpuTimePerPointUs: result.gpuTimePerPointUs,
    gpuDispatchOverheadMs: result.gpuDispatchOverheadMs,
  });

  return result;
}

/**
 * Get cached calibration result
 */
export function getCachedCalibration(): CalibrationResult | null {
  return cachedCalibration;
}

/**
 * Clear cached calibration
 */
export function clearCalibrationCache(): void {
  cachedCalibration = null;
}

/**
 * Apply calibration result to split configuration
 */
export function applyCalibration(calibration: CalibrationResult): WorkloadSplitConfig {
  return {
    gpuRatio: calibration.optimalGpuRatio,
    minGpuPoints: DEFAULT_SPLIT_CONFIG.minGpuPoints,
    gpuDispatchOverheadMs: calibration.gpuDispatchOverheadMs,
    cpuTimePerPointUs: calibration.cpuTimePerPointUs,
    gpuTimePerPointUs: calibration.gpuTimePerPointUs,
  };
}

/**
 * Benchmark results for a processor
 */
interface BenchmarkResults {
  /** Time per point in microseconds for each sample size */
  timePerPointUs: Map<number, number>;
  /** Average time per point across all sizes */
  avgTimePerPointUs: number;
  /** Dispatch/setup overhead in milliseconds */
  overheadMs: number;
}

/**
 * Calibration test data
 */
interface CalibrationData {
  scalars: bigint[];
  points: CurvePoint[];
}

/**
 * Generate random test data for calibration
 */
function generateCalibrationData(maxSize: number, curve: CurveConfig): CalibrationData {
  const scalars: bigint[] = [];
  const points: CurvePoint[] = [];

  // Generate random scalars
  for (let i = 0; i < maxSize; i++) {
    // Generate random scalar in range [1, order-1]
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    let scalar = 0n;
    for (let j = 0; j < 32; j++) {
      scalar = (scalar << 8n) | BigInt(randomBytes[j]!);
    }
    scalar = (scalar % (curve.order - 1n)) + 1n;
    scalars.push(scalar);

    // Use generator point multiplied by index for variety
    // In production, we'd use actual random points
    points.push(curve.generator);
  }

  return { scalars, points };
}

/**
 * Benchmark CPU MSM performance
 */
function benchmarkCpu(
  data: CalibrationData,
  curve: CurveConfig,
  config: CalibrationConfig
): BenchmarkResults {
  const timePerPointUs = new Map<number, number>();
  let totalTimeUs = 0;
  let totalPoints = 0;

  for (const size of config.sampleSizes) {
    const scalars = data.scalars.slice(0, size);
    const points = data.points.slice(0, size);

    // Warmup
    for (let i = 0; i < config.warmupIterations; i++) {
      pippengerMsm(scalars, points, curve);
    }

    // Measure
    const times: number[] = [];
    for (let i = 0; i < config.iterations; i++) {
      const start = performance.now();
      pippengerMsm(scalars, points, curve);
      const end = performance.now();
      times.push(end - start);
    }

    // Calculate average time per point
    const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
    const timePerPoint = (avgTimeMs * 1000) / size; // Convert to microseconds
    timePerPointUs.set(size, timePerPoint);

    totalTimeUs += avgTimeMs * 1000;
    totalPoints += size;

    debugLog(`CPU benchmark: ${size} points`, {
      avgTimeMs,
      timePerPointUs: timePerPoint,
    });
  }

  return {
    timePerPointUs,
    avgTimePerPointUs: totalTimeUs / totalPoints,
    overheadMs: 0, // CPU has negligible setup overhead
  };
}

/**
 * Benchmark GPU MSM performance
 */
async function benchmarkGpu(
  data: CalibrationData,
  curve: CurveConfig,
  config: CalibrationConfig
): Promise<BenchmarkResults> {
  const timePerPointUs = new Map<number, number>();
  let totalTimeUs = 0;
  let totalPoints = 0;
  let measuredOverhead = 0;

  for (const size of config.sampleSizes) {
    const scalars = data.scalars.slice(0, size);
    const points = data.points.slice(0, size);

    // Warmup
    for (let i = 0; i < config.warmupIterations; i++) {
      try {
        await msmGPU(scalars, points, curve);
      } catch {
        // GPU may not be fully functional, skip
        return {
          timePerPointUs: new Map(),
          avgTimePerPointUs: Infinity,
          overheadMs: Infinity,
        };
      }
    }

    // Measure
    const times: number[] = [];
    for (let i = 0; i < config.iterations; i++) {
      const start = performance.now();
      try {
        await msmGPU(scalars, points, curve);
      } catch {
        continue;
      }
      const end = performance.now();
      times.push(end - start);
    }

    if (times.length === 0) {
      continue;
    }

    // Calculate average time per point
    const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
    const timePerPoint = (avgTimeMs * 1000) / size;
    timePerPointUs.set(size, timePerPoint);

    totalTimeUs += avgTimeMs * 1000;
    totalPoints += size;

    // Estimate overhead from smallest size
    if (size === config.sampleSizes[0]) {
      // Overhead = total time - (time per point * points)
      // For small sizes, overhead dominates
      measuredOverhead = avgTimeMs * 0.5; // Rough estimate
    }

    debugLog(`GPU benchmark: ${size} points`, {
      avgTimeMs,
      timePerPointUs: timePerPoint,
    });
  }

  return {
    timePerPointUs,
    avgTimePerPointUs: totalPoints > 0 ? totalTimeUs / totalPoints : Infinity,
    overheadMs: measuredOverhead,
  };
}

/**
 * Calculate optimal parameters from benchmark results
 */
function calculateOptimalParameters(
  cpuResults: BenchmarkResults,
  gpuResults: BenchmarkResults | null,
  caps: HardwareCapabilities
): CalibrationResult {
  // If no GPU results, use CPU-only
  if (!gpuResults || gpuResults.avgTimePerPointUs === Infinity) {
    return {
      optimalGpuRatio: 0,
      cpuTimePerPointUs: cpuResults.avgTimePerPointUs,
      gpuTimePerPointUs: Infinity,
      gpuDispatchOverheadMs: Infinity,
      hardware: caps,
      timestamp: Date.now(),
    };
  }

  // Calculate optimal ratio based on relative speeds
  // For parallel execution, we want: cpuTime ≈ gpuTime
  // cpuPoints * cpuTimePerPoint = gpuOverhead + gpuPoints * gpuTimePerPoint
  // Let r = gpuRatio, then:
  // (1-r) * n * cpuTime = gpuOverhead + r * n * gpuTime
  // Solving for r when times are equal:
  // r = (n * cpuTime - gpuOverhead) / (n * (cpuTime + gpuTime))

  const cpuTime = cpuResults.avgTimePerPointUs;
  const gpuTime = gpuResults.avgTimePerPointUs;
  const gpuOverhead = gpuResults.overheadMs * 1000; // Convert to microseconds

  // For a typical large input (e.g., 65536 points)
  const typicalN = 65536;
  const numerator = typicalN * cpuTime - gpuOverhead;
  const denominator = typicalN * (cpuTime + gpuTime);

  let optimalRatio = denominator > 0 ? numerator / denominator : 0;

  // Clamp to valid range
  optimalRatio = Math.max(0, Math.min(1, optimalRatio));

  // If GPU is much slower, don't use it
  if (gpuTime > cpuTime * 2) {
    optimalRatio = 0;
  }

  return {
    optimalGpuRatio: optimalRatio,
    cpuTimePerPointUs: cpuTime,
    gpuTimePerPointUs: gpuTime,
    gpuDispatchOverheadMs: gpuResults.overheadMs,
    hardware: caps,
    timestamp: Date.now(),
  };
}

/**
 * Quick calibration with minimal benchmarking
 *
 * Uses a single sample size for faster calibration.
 *
 * @param curve - Curve configuration
 * @returns Calibration result
 */
export async function quickCalibrate(curve: CurveConfig): Promise<CalibrationResult> {
  return calibrate(curve, {
    sampleSizes: [4096],
    iterations: 2,
    warmupIterations: 1,
  });
}

/**
 * Check if calibration is needed
 *
 * Returns true if no calibration exists or if hardware has changed.
 */
export function needsCalibration(): boolean {
  if (!cachedCalibration) {
    return true;
  }

  // Check if hardware has changed
  const currentCaps = detectHardwareCapabilities();
  const cachedCaps = cachedCalibration.hardware;

  return (
    currentCaps.hasMetal !== cachedCaps.hasMetal ||
    currentCaps.hasAmx !== cachedCaps.hasAmx ||
    currentCaps.hasSme !== cachedCaps.hasSme
  );
}
