/**
 * Benchmark Types and Interfaces
 *
 * Defines the types used throughout the benchmarking suite.
 *
 * Requirements: 12.1, 12.2, 12.6
 */

import type { HardwareCapabilities } from '../hardware.js';
import type { CurveName } from '../types.js';

/**
 * Benchmark operation types
 */
export type BenchmarkOperation = 'msm' | 'ntt' | 'field_mul' | 'point_add';

/**
 * Accelerator types for benchmarking
 */
export type AcceleratorType = 'cpu' | 'gpu' | 'hybrid' | 'wasm' | 'baseline';

/**
 * Individual benchmark result
 */
export interface BenchmarkResult {
  /** Operation being benchmarked */
  operation: BenchmarkOperation;
  /** Input size (number of points for MSM, polynomial degree for NTT) */
  inputSize: number;
  /** Curve used (if applicable) */
  curve?: CurveName;
  /** Accelerator used */
  accelerator: AcceleratorType;
  /** Mean execution time in milliseconds */
  meanMs: number;
  /** Standard deviation in milliseconds */
  stddevMs: number;
  /** Minimum execution time in milliseconds */
  minMs: number;
  /** Maximum execution time in milliseconds */
  maxMs: number;
  /** Throughput (operations per second or points per second) */
  throughput: number;
  /** Speedup compared to baseline */
  speedupVsBaseline?: number;
  /** Hardware utilization metrics */
  hardwareUtilization?: HardwareUtilization;
  /** Power consumption in watts (if available) */
  powerWatts?: number;
  /** All individual timing samples */
  samples: number[];
}

/**
 * Hardware utilization metrics
 */
export interface HardwareUtilization {
  /** CPU utilization percentage */
  cpuPercent?: number;
  /** GPU utilization percentage */
  gpuPercent?: number;
  /** Whether AMX was active */
  amxActive?: boolean;
  /** Whether SME was active */
  smeActive?: boolean;
  /** Memory bandwidth utilization */
  memoryBandwidthPercent?: number;
}

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  /** Input sizes to benchmark */
  sizes: number[];
  /** Number of iterations per size */
  iterations: number;
  /** Number of warmup iterations */
  warmup: number;
  /** Curve to use */
  curve: CurveName;
  /** Accelerators to benchmark */
  accelerators: AcceleratorType[];
  /** Whether to validate results */
  validateResults?: boolean;
  /** Timeout per benchmark in milliseconds */
  timeoutMs?: number;
}

/**
 * MSM benchmark configuration
 */
export interface MSMBenchmarkConfig extends BenchmarkConfig {
  /** Window size for Pippenger (auto if not specified) */
  windowSize?: number;
}

/**
 * NTT benchmark configuration
 */
export interface NTTBenchmarkConfig extends BenchmarkConfig {
  /** NTT radix (2 or 4) */
  radix?: 2 | 4;
  /** Whether to use in-place NTT */
  inPlace?: boolean;
}

/**
 * Complete benchmark suite result
 */
export interface BenchmarkSuiteResult {
  /** Timestamp when benchmark was run */
  timestamp: string;
  /** Hardware capabilities detected */
  hardware: HardwareCapabilities;
  /** Library version */
  version: string;
  /** All benchmark results */
  results: BenchmarkResult[];
  /** Baseline used for comparison */
  baseline: string;
  /** Total benchmark duration in milliseconds */
  totalDurationMs: number;
  /** Summary statistics */
  summary: BenchmarkSummary;
}

/**
 * Summary statistics for the benchmark suite
 */
export interface BenchmarkSummary {
  /** Average MSM speedup vs baseline */
  avgMsmSpeedup?: number;
  /** Average NTT speedup vs baseline */
  avgNttSpeedup?: number;
  /** Peak MSM throughput (points/sec) */
  peakMsmThroughput?: number;
  /** Peak NTT throughput (transforms/sec) */
  peakNttThroughput?: number;
  /** Best accelerator for MSM */
  bestMsmAccelerator?: AcceleratorType;
  /** Best accelerator for NTT */
  bestNttAccelerator?: AcceleratorType;
}

/**
 * Default MSM benchmark configuration
 */
export const DEFAULT_MSM_BENCHMARK_CONFIG: MSMBenchmarkConfig = {
  sizes: [1024, 4096, 16384, 65536], // 2^10 to 2^16
  iterations: 5,
  warmup: 2,
  curve: 'BN254',
  accelerators: ['cpu', 'hybrid'],
  validateResults: false,
  timeoutMs: 60000,
};

/**
 * Default NTT benchmark configuration
 */
export const DEFAULT_NTT_BENCHMARK_CONFIG: NTTBenchmarkConfig = {
  sizes: [1024, 4096, 16384, 65536], // 2^10 to 2^16
  iterations: 5,
  warmup: 2,
  curve: 'BN254',
  accelerators: ['cpu'],
  radix: 2,
  inPlace: false,
  validateResults: false,
  timeoutMs: 60000,
};

/**
 * Quick benchmark configuration (completes in under 60 seconds)
 */
export const QUICK_BENCHMARK_CONFIG: BenchmarkConfig = {
  sizes: [1024, 4096],
  iterations: 3,
  warmup: 1,
  curve: 'BN254',
  accelerators: ['cpu'],
  validateResults: false,
  timeoutMs: 60000,
};

/**
 * Full benchmark configuration (comprehensive)
 */
export const FULL_BENCHMARK_CONFIG: BenchmarkConfig = {
  sizes: [1024, 4096, 16384, 65536, 262144, 1048576], // 2^10 to 2^20
  iterations: 10,
  warmup: 3,
  curve: 'BN254',
  accelerators: ['cpu', 'gpu', 'hybrid'],
  validateResults: true,
  timeoutMs: 300000,
};
