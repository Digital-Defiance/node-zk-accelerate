/**
 * Benchmark Runner
 *
 * Core benchmark execution engine with warmup, iteration logic,
 * and JSON output support.
 *
 * Requirements: 12.1, 12.2, 12.6
 */

import type { CurveConfig, CurvePoint, FieldElement } from '../types.js';
import type {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkSuiteResult,
  BenchmarkSummary,
  MSMBenchmarkConfig,
  NTTBenchmarkConfig,
  AcceleratorType,
} from './types.js';
import {
  DEFAULT_MSM_BENCHMARK_CONFIG,
  DEFAULT_NTT_BENCHMARK_CONFIG,
  QUICK_BENCHMARK_CONFIG,
} from './types.js';
import { detectHardwareCapabilities } from '../hardware.js';
import { getCurveConfig } from '../curve/config.js';
import { msm } from '../msm/msm.js';
import { hybridMsm } from '../msm/hybrid.js';
import { forwardNtt } from '../ntt/index.js';
import { createFieldElement } from '../field/element.js';
import { scalarMul } from '../curve/operations.js';
import { getFieldConfig } from '../field/config.js';

/**
 * Generate random scalars for benchmarking
 */
function generateRandomScalars(count: number, order: bigint): bigint[] {
  const scalars: bigint[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let scalar = 0n;
    for (let j = 0; j < 32; j++) {
      scalar = (scalar << 8n) | BigInt(bytes[j]!);
    }
    scalars.push((scalar % (order - 1n)) + 1n);
  }
  return scalars;
}

/**
 * Generate random curve points for benchmarking
 */
function generateRandomPoints(count: number, curve: CurveConfig): CurvePoint[] {
  const points: CurvePoint[] = [];
  const generator = curve.generator;

  for (let i = 0; i < count; i++) {
    // Generate points by scalar multiplication of generator
    // Use small scalars for faster generation
    const scalar = BigInt(i + 1) % curve.order;
    if (scalar === 0n) {
      points.push(generator);
    } else {
      points.push(scalarMul(scalar, generator, curve));
    }
  }
  return points;
}

/**
 * Generate random field elements for NTT benchmarking
 * Uses the scalar field since NTT is typically performed on scalar field elements
 */
function generateRandomFieldElements(count: number, curve: CurveConfig): FieldElement[] {
  const elements: FieldElement[] = [];
  // Use scalar field for NTT (the curve order field, not the base field)
  // NTT requires that the size divides p-1, which is satisfied by scalar fields
  const field = getFieldConfig(curve.name, 'scalar');

  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let value = 0n;
    for (let j = 0; j < 32; j++) {
      value = (value << 8n) | BigInt(bytes[j]!);
    }
    value = value % field.modulus;
    elements.push(createFieldElement(value, field));
  }
  return elements;
}

/**
 * Calculate statistics from timing samples
 */
function calculateStats(samples: number[]): {
  mean: number;
  stddev: number;
  min: number;
  max: number;
} {
  const n = samples.length;
  if (n === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0 };
  }

  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  return { mean, stddev, min, max };
}

/**
 * Run a single MSM benchmark
 */
async function runMsmBenchmark(
  size: number,
  curve: CurveConfig,
  accelerator: AcceleratorType,
  config: MSMBenchmarkConfig
): Promise<BenchmarkResult> {
  // Generate test data
  const scalars = generateRandomScalars(size, curve.order);
  const points = generateRandomPoints(size, curve);

  const samples: number[] = [];

  // Warmup runs
  for (let i = 0; i < config.warmup; i++) {
    if (accelerator === 'hybrid') {
      await hybridMsm(scalars, points, curve);
    } else {
      msm(scalars, points, curve, {
        accelerationHint: accelerator === 'cpu' ? 'cpu' : 'auto',
        validateInputs: false,
      });
    }
  }

  // Timed runs
  for (let i = 0; i < config.iterations; i++) {
    const start = performance.now();

    if (accelerator === 'hybrid') {
      await hybridMsm(scalars, points, curve);
    } else {
      msm(scalars, points, curve, {
        accelerationHint: accelerator === 'cpu' ? 'cpu' : 'auto',
        validateInputs: false,
      });
    }

    const end = performance.now();
    samples.push(end - start);
  }

  const stats = calculateStats(samples);
  const throughput = size / (stats.mean / 1000); // points per second

  return {
    operation: 'msm',
    inputSize: size,
    curve: curve.name,
    accelerator,
    meanMs: stats.mean,
    stddevMs: stats.stddev,
    minMs: stats.min,
    maxMs: stats.max,
    throughput,
    samples,
  };
}

/**
 * Run a single NTT benchmark
 */
function runNttBenchmark(
  size: number,
  curve: CurveConfig,
  accelerator: AcceleratorType,
  config: NTTBenchmarkConfig
): BenchmarkResult {
  // Generate test data
  const coefficients = generateRandomFieldElements(size, curve);

  const samples: number[] = [];
  const radix = config.radix ?? 2;

  // Warmup runs
  for (let i = 0; i < config.warmup; i++) {
    forwardNtt(coefficients, { radix, inPlace: false });
  }

  // Timed runs
  for (let i = 0; i < config.iterations; i++) {
    const start = performance.now();
    forwardNtt(coefficients, { radix, inPlace: false });
    const end = performance.now();
    samples.push(end - start);
  }

  const stats = calculateStats(samples);
  const throughput = 1000 / stats.mean; // transforms per second

  return {
    operation: 'ntt',
    inputSize: size,
    curve: curve.name,
    accelerator,
    meanMs: stats.mean,
    stddevMs: stats.stddev,
    minMs: stats.min,
    maxMs: stats.max,
    throughput,
    samples,
  };
}

/**
 * Run MSM benchmark suite
 */
export async function runMsmBenchmarks(
  config: Partial<MSMBenchmarkConfig> = {}
): Promise<BenchmarkResult[]> {
  const fullConfig: MSMBenchmarkConfig = {
    ...DEFAULT_MSM_BENCHMARK_CONFIG,
    ...config,
  };

  const curve = getCurveConfig(fullConfig.curve);
  const results: BenchmarkResult[] = [];

  for (const size of fullConfig.sizes) {
    for (const accelerator of fullConfig.accelerators) {
      try {
        const result = await runMsmBenchmark(size, curve, accelerator, fullConfig);
        results.push(result);
        // eslint-disable-next-line no-console
        console.log(
          `MSM ${accelerator} ${size} points: ${result.meanMs.toFixed(2)}ms ` +
            `(±${result.stddevMs.toFixed(2)}ms), ${Math.round(result.throughput)} pts/s`
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`MSM benchmark failed for ${accelerator} ${size}:`, error);
      }
    }
  }

  return results;
}

/**
 * Run NTT benchmark suite
 */
export async function runNttBenchmarks(
  config: Partial<NTTBenchmarkConfig> = {}
): Promise<BenchmarkResult[]> {
  const fullConfig: NTTBenchmarkConfig = {
    ...DEFAULT_NTT_BENCHMARK_CONFIG,
    ...config,
  };

  const curve = getCurveConfig(fullConfig.curve);
  const results: BenchmarkResult[] = [];

  for (const size of fullConfig.sizes) {
    for (const accelerator of fullConfig.accelerators) {
      try {
        const result = runNttBenchmark(size, curve, accelerator, fullConfig);
        results.push(result);
        // eslint-disable-next-line no-console
        console.log(
          `NTT ${accelerator} ${size} elements: ${result.meanMs.toFixed(2)}ms ` +
            `(±${result.stddevMs.toFixed(2)}ms), ${result.throughput.toFixed(1)} transforms/s`
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`NTT benchmark failed for ${accelerator} ${size}:`, error);
      }
    }
  }

  return results;
}

/**
 * Calculate benchmark summary statistics
 */
function calculateSummary(
  results: BenchmarkResult[],
  baselineResults?: BenchmarkResult[]
): BenchmarkSummary {
  const msmResults = results.filter((r) => r.operation === 'msm');
  const nttResults = results.filter((r) => r.operation === 'ntt');

  const summary: BenchmarkSummary = {};

  // Calculate average speedups if baseline available
  if (baselineResults && baselineResults.length > 0) {
    const msmSpeedups: number[] = [];
    const nttSpeedups: number[] = [];

    for (const result of msmResults) {
      const baseline = baselineResults.find(
        (b) => b.operation === 'msm' && b.inputSize === result.inputSize
      );
      if (baseline && baseline.meanMs > 0) {
        const speedup = baseline.meanMs / result.meanMs;
        msmSpeedups.push(speedup);
        result.speedupVsBaseline = speedup;
      }
    }

    for (const result of nttResults) {
      const baseline = baselineResults.find(
        (b) => b.operation === 'ntt' && b.inputSize === result.inputSize
      );
      if (baseline && baseline.meanMs > 0) {
        const speedup = baseline.meanMs / result.meanMs;
        nttSpeedups.push(speedup);
        result.speedupVsBaseline = speedup;
      }
    }

    if (msmSpeedups.length > 0) {
      summary.avgMsmSpeedup = msmSpeedups.reduce((a, b) => a + b, 0) / msmSpeedups.length;
    }
    if (nttSpeedups.length > 0) {
      summary.avgNttSpeedup = nttSpeedups.reduce((a, b) => a + b, 0) / nttSpeedups.length;
    }
  }

  // Find peak throughputs
  if (msmResults.length > 0) {
    const peakMsm = msmResults.reduce((best, r) =>
      r.throughput > best.throughput ? r : best
    );
    summary.peakMsmThroughput = peakMsm.throughput;
    summary.bestMsmAccelerator = peakMsm.accelerator;
  }

  if (nttResults.length > 0) {
    const peakNtt = nttResults.reduce((best, r) =>
      r.throughput > best.throughput ? r : best
    );
    summary.peakNttThroughput = peakNtt.throughput;
    summary.bestNttAccelerator = peakNtt.accelerator;
  }

  return summary;
}

/**
 * Run complete benchmark suite
 */
export async function runBenchmarkSuite(
  config: Partial<BenchmarkConfig> = {},
  baselineResults?: BenchmarkResult[]
): Promise<BenchmarkSuiteResult> {
  const startTime = Date.now();
  const hardware = detectHardwareCapabilities();

  console.log('\n=== ZK Accelerate Benchmark Suite ===\n');
  console.log('Hardware:', hardware.metalDeviceName || 'Unknown');
  console.log('CPU Cores:', hardware.cpuCores);
  console.log('NEON:', hardware.hasNeon ? 'Yes' : 'No');
  console.log('AMX:', hardware.hasAmx ? 'Yes' : 'No');
  console.log('SME:', hardware.hasSme ? 'Yes' : 'No');
  console.log('Metal:', hardware.hasMetal ? 'Yes' : 'No');
  console.log('');

  const results: BenchmarkResult[] = [];

  // Run MSM benchmarks
  console.log('--- MSM Benchmarks ---');
  const msmConfig: Partial<MSMBenchmarkConfig> = {};
  if (config.sizes !== undefined) msmConfig.sizes = config.sizes;
  if (config.iterations !== undefined) msmConfig.iterations = config.iterations;
  if (config.warmup !== undefined) msmConfig.warmup = config.warmup;
  if (config.curve !== undefined) msmConfig.curve = config.curve;
  if (config.accelerators !== undefined) msmConfig.accelerators = config.accelerators;
  const msmResults = await runMsmBenchmarks(msmConfig);
  results.push(...msmResults);

  console.log('\n--- NTT Benchmarks ---');
  const nttConfig: Partial<NTTBenchmarkConfig> = {};
  if (config.sizes !== undefined) nttConfig.sizes = config.sizes;
  if (config.iterations !== undefined) nttConfig.iterations = config.iterations;
  if (config.warmup !== undefined) nttConfig.warmup = config.warmup;
  if (config.curve !== undefined) nttConfig.curve = config.curve;
  if (config.accelerators !== undefined) {
    nttConfig.accelerators = config.accelerators.filter((a) => a === 'cpu');
  }
  const nttResults = await runNttBenchmarks(nttConfig);
  results.push(...nttResults);

  const endTime = Date.now();
  const summary = calculateSummary(results, baselineResults);

  const suiteResult: BenchmarkSuiteResult = {
    timestamp: new Date().toISOString(),
    hardware,
    version: '0.1.0',
    results,
    baseline: 'snarkjs-wasm',
    totalDurationMs: endTime - startTime,
    summary,
  };

  console.log('\n--- Summary ---');
  if (summary.avgMsmSpeedup) {
    console.log(`Average MSM Speedup: ${summary.avgMsmSpeedup.toFixed(2)}x`);
  }
  if (summary.avgNttSpeedup) {
    console.log(`Average NTT Speedup: ${summary.avgNttSpeedup.toFixed(2)}x`);
  }
  if (summary.peakMsmThroughput) {
    console.log(
      `Peak MSM Throughput: ${Math.round(summary.peakMsmThroughput)} pts/s (${summary.bestMsmAccelerator})`
    );
  }
  if (summary.peakNttThroughput) {
    console.log(
      `Peak NTT Throughput: ${summary.peakNttThroughput.toFixed(1)} transforms/s (${summary.bestNttAccelerator})`
    );
  }
  console.log(`Total Duration: ${(suiteResult.totalDurationMs / 1000).toFixed(1)}s`);

  return suiteResult;
}

/**
 * Run quick benchmark (under 60 seconds)
 */
export async function runQuickBenchmark(): Promise<BenchmarkSuiteResult> {
  console.log('Running quick benchmark (target: <60s)...\n');
  return runBenchmarkSuite(QUICK_BENCHMARK_CONFIG);
}

/**
 * Export benchmark results to JSON
 */
export function exportBenchmarkResults(results: BenchmarkSuiteResult): string {
  return JSON.stringify(results, null, 2);
}

/**
 * Export benchmark results to JSON file
 */
export async function saveBenchmarkResults(
  results: BenchmarkSuiteResult,
  filename: string
): Promise<void> {
  const fs = await import('fs/promises');
  const json = exportBenchmarkResults(results);
  await fs.writeFile(filename, json, 'utf-8');
  console.log(`Benchmark results saved to ${filename}`);
}

/**
 * Load benchmark results from JSON file
 */
export async function loadBenchmarkResults(filename: string): Promise<BenchmarkSuiteResult> {
  const fs = await import('fs/promises');
  const json = await fs.readFile(filename, 'utf-8');
  return JSON.parse(json) as BenchmarkSuiteResult;
}
