/**
 * Quick Benchmark Mode
 *
 * Provides a subset of benchmarks that complete in under 60 seconds
 * with representative results for common use cases.
 *
 * Requirements: 12.7
 */

import type { BenchmarkSuiteResult } from './types.js';
import { QUICK_BENCHMARK_CONFIG } from './types.js';
import { runBenchmarkSuite } from './runner.js';
import { runBaselineComparison } from './baseline.js';
import { getHardwareReport } from './hardware-report.js';
import { detectHardwareCapabilities } from '../hardware.js';

/**
 * Quick benchmark result with summary
 */
export interface QuickBenchmarkResult {
  /** Benchmark suite results */
  suite: BenchmarkSuiteResult;
  /** Formatted summary string */
  summary: string;
  /** Whether all targets were met */
  allTargetsMet: boolean;
  /** Time taken in seconds */
  durationSeconds: number;
}

/**
 * Run quick benchmark mode
 *
 * This runs a minimal set of benchmarks designed to complete in under
 * 60 seconds while still providing representative performance data.
 *
 * Benchmarks included:
 * - MSM: 1024 and 4096 points (CPU)
 * - NTT: 1024 and 4096 elements (CPU)
 *
 * @returns Quick benchmark result with summary
 */
export async function runQuickBenchmarkMode(): Promise<QuickBenchmarkResult> {
  const startTime = Date.now();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ZK Accelerate Quick Benchmark                    ║');
  console.log('║           Target: Complete in under 60 seconds             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Detect hardware
  const hardware = detectHardwareCapabilities();
  console.log(`Hardware: ${hardware.metalDeviceName || 'Apple Silicon'}`);
  console.log(`CPU Cores: ${hardware.cpuCores}`);
  console.log(`Accelerators: NEON=${hardware.hasNeon}, AMX=${hardware.hasAmx}, SME=${hardware.hasSme}, Metal=${hardware.hasMetal}`);
  console.log('');

  // Run benchmarks with quick config
  const suite = await runBenchmarkSuite(QUICK_BENCHMARK_CONFIG);

  // Run baseline comparison
  const comparisons = runBaselineComparison(suite.results);

  // Generate hardware report
  const hardwareReport = getHardwareReport(suite.results);

  // Calculate duration
  const endTime = Date.now();
  const durationSeconds = (endTime - startTime) / 1000;

  // Check if all targets were met
  const allTargetsMet = comparisons.every((c) => c.targetAchieved);

  // Generate summary
  const summary = generateQuickSummary(suite, comparisons, hardwareReport, durationSeconds);

  console.log('');
  console.log(summary);

  return {
    suite,
    summary,
    allTargetsMet,
    durationSeconds,
  };
}

/**
 * Generate quick benchmark summary
 */
function generateQuickSummary(
  suite: BenchmarkSuiteResult,
  comparisons: ReturnType<typeof runBaselineComparison>,
  hardwareReport: ReturnType<typeof getHardwareReport>,
  durationSeconds: number
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    QUICK BENCHMARK SUMMARY                     ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Performance highlights
  lines.push('Performance Highlights:');
  lines.push('───────────────────────');

  const msmResults = suite.results.filter((r) => r.operation === 'msm');
  const nttResults = suite.results.filter((r) => r.operation === 'ntt');

  if (msmResults.length > 0) {
    const bestMsm = msmResults.reduce((best, r) =>
      r.throughput > best.throughput ? r : best
    );
    lines.push(
      `  MSM Peak: ${Math.round(bestMsm.throughput).toLocaleString()} points/sec ` +
        `(${bestMsm.inputSize} points, ${bestMsm.meanMs.toFixed(2)}ms)`
    );
  }

  if (nttResults.length > 0) {
    const bestNtt = nttResults.reduce((best, r) =>
      r.throughput > best.throughput ? r : best
    );
    lines.push(
      `  NTT Peak: ${bestNtt.throughput.toFixed(1)} transforms/sec ` +
        `(${bestNtt.inputSize} elements, ${bestNtt.meanMs.toFixed(2)}ms)`
    );
  }

  lines.push('');

  // Speedup vs baseline
  lines.push('Speedup vs snarkjs WASM:');
  lines.push('────────────────────────');

  const msmComps = comparisons.filter((c) => c.operation === 'msm');
  const nttComps = comparisons.filter((c) => c.operation === 'ntt');

  for (const comp of msmComps) {
    const status = comp.targetAchieved ? '✓' : '✗';
    lines.push(
      `  MSM ${comp.inputSize}: ${comp.speedup.toFixed(1)}x ` +
        `(target: ${comp.targetSpeedup}x) ${status}`
    );
  }

  for (const comp of nttComps) {
    const status = comp.targetAchieved ? '✓' : '✗';
    lines.push(
      `  NTT ${comp.inputSize}: ${comp.speedup.toFixed(1)}x ` +
        `(target: ${comp.targetSpeedup}x) ${status}`
    );
  }

  lines.push('');

  // Hardware utilization
  lines.push('Hardware Utilization:');
  lines.push('─────────────────────');

  for (const timing of hardwareReport.acceleratorTimings) {
    if (timing.wasActive) {
      lines.push(
        `  ${timing.accelerator.toUpperCase()}: ${timing.percentageOfTotal.toFixed(0)}% of time, ` +
          `${timing.operationsProcessed.toLocaleString()} ops`
      );
    }
  }

  if (hardwareReport.powerEstimate) {
    lines.push(
      `  Est. Power: ${hardwareReport.powerEstimate.totalWatts.toFixed(1)}W`
    );
  }

  lines.push('');

  // Timing
  lines.push('Benchmark Timing:');
  lines.push('─────────────────');
  lines.push(`  Duration: ${durationSeconds.toFixed(1)}s`);
  lines.push(`  Target: <60s ${durationSeconds < 60 ? '✓' : '✗'}`);

  lines.push('');

  // Overall status
  const allTargetsMet = comparisons.every((c) => c.targetAchieved);
  lines.push('═══════════════════════════════════════════════════════════════');
  if (allTargetsMet) {
    lines.push('  ✓ ALL PERFORMANCE TARGETS MET');
  } else {
    const metCount = comparisons.filter((c) => c.targetAchieved).length;
    lines.push(`  ✗ ${metCount}/${comparisons.length} PERFORMANCE TARGETS MET`);
  }
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Run minimal benchmark (fastest possible)
 *
 * Runs only the smallest benchmark sizes with minimal iterations.
 * Useful for CI/CD pipelines or quick sanity checks.
 */
export async function runMinimalBenchmark(): Promise<QuickBenchmarkResult> {
  const startTime = Date.now();

  console.log('Running minimal benchmark...');

  const suite = await runBenchmarkSuite({
    sizes: [1024],
    iterations: 2,
    warmup: 1,
    curve: 'BN254',
    accelerators: ['cpu'],
  });

  const comparisons = runBaselineComparison(suite.results);
  const hardwareReport = getHardwareReport(suite.results);
  const durationSeconds = (Date.now() - startTime) / 1000;

  const summary = generateQuickSummary(suite, comparisons, hardwareReport, durationSeconds);
  const allTargetsMet = comparisons.every((c) => c.targetAchieved);

  return {
    suite,
    summary,
    allTargetsMet,
    durationSeconds,
  };
}

/**
 * Run benchmark and output JSON to stdout
 *
 * Useful for scripting and automation.
 */
export async function runBenchmarkJson(): Promise<string> {
  const result = await runQuickBenchmarkMode();
  return JSON.stringify(result.suite, null, 2);
}

/**
 * Check if performance targets are met
 *
 * Quick check that can be used in CI/CD to fail builds
 * if performance regresses.
 */
export async function checkPerformanceTargets(): Promise<{
  passed: boolean;
  message: string;
}> {
  const result = await runMinimalBenchmark();

  if (result.allTargetsMet) {
    return {
      passed: true,
      message: 'All performance targets met',
    };
  } else {
    return {
      passed: false,
      message: `Performance targets not met. Duration: ${result.durationSeconds.toFixed(1)}s`,
    };
  }
}
