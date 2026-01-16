/**
 * Benchmark Module Tests
 *
 * Tests for the benchmarking suite functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MSM_BENCHMARK_CONFIG,
  DEFAULT_NTT_BENCHMARK_CONFIG,
  QUICK_BENCHMARK_CONFIG,
  FULL_BENCHMARK_CONFIG,
} from './types.js';
import { simulateSnarkjsBaseline, calculateSpeedups, runBaselineComparison } from './baseline.js';
import { estimatePowerConsumption, measureHardwareUtilization, getHardwareReport } from './hardware-report.js';
import { detectHardwareCapabilities } from '../hardware.js';
import type { BenchmarkResult } from './types.js';

describe('Benchmark Types', () => {
  it('should have valid default MSM config', () => {
    expect(DEFAULT_MSM_BENCHMARK_CONFIG.sizes).toContain(1024);
    expect(DEFAULT_MSM_BENCHMARK_CONFIG.sizes).toContain(4096);
    expect(DEFAULT_MSM_BENCHMARK_CONFIG.iterations).toBeGreaterThan(0);
    expect(DEFAULT_MSM_BENCHMARK_CONFIG.warmup).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_MSM_BENCHMARK_CONFIG.curve).toBe('BN254');
  });

  it('should have valid default NTT config', () => {
    expect(DEFAULT_NTT_BENCHMARK_CONFIG.sizes).toContain(1024);
    expect(DEFAULT_NTT_BENCHMARK_CONFIG.sizes).toContain(4096);
    expect(DEFAULT_NTT_BENCHMARK_CONFIG.radix).toBe(2);
  });

  it('should have quick config with smaller sizes', () => {
    expect(QUICK_BENCHMARK_CONFIG.sizes.length).toBeLessThanOrEqual(
      FULL_BENCHMARK_CONFIG.sizes.length
    );
    expect(QUICK_BENCHMARK_CONFIG.iterations).toBeLessThanOrEqual(
      FULL_BENCHMARK_CONFIG.iterations
    );
  });

  it('should have full config with comprehensive sizes', () => {
    expect(FULL_BENCHMARK_CONFIG.sizes).toContain(1048576); // 2^20
    expect(FULL_BENCHMARK_CONFIG.iterations).toBeGreaterThanOrEqual(10);
  });
});

describe('Baseline Comparison', () => {
  it('should simulate snarkjs MSM baseline', () => {
    const baseline1024 = simulateSnarkjsBaseline('msm', 1024);
    const baseline4096 = simulateSnarkjsBaseline('msm', 4096);

    expect(baseline1024).toBeGreaterThan(0);
    expect(baseline4096).toBeGreaterThan(baseline1024);
  });

  it('should simulate snarkjs NTT baseline', () => {
    const baseline1024 = simulateSnarkjsBaseline('ntt', 1024);
    const baseline4096 = simulateSnarkjsBaseline('ntt', 4096);

    expect(baseline1024).toBeGreaterThan(0);
    expect(baseline4096).toBeGreaterThan(baseline1024);
  });

  it('should calculate speedups for benchmark results', () => {
    const mockResults: BenchmarkResult[] = [
      {
        operation: 'msm',
        inputSize: 1024,
        accelerator: 'cpu',
        meanMs: 10,
        stddevMs: 1,
        minMs: 9,
        maxMs: 11,
        throughput: 102400,
        samples: [10, 10, 10],
      },
    ];

    const resultsWithSpeedup = calculateSpeedups(mockResults);
    expect(resultsWithSpeedup[0]!.speedupVsBaseline).toBeGreaterThan(0);
  });

  it('should run baseline comparison', () => {
    const mockResults: BenchmarkResult[] = [
      {
        operation: 'msm',
        inputSize: 1024,
        accelerator: 'cpu',
        meanMs: 10,
        stddevMs: 1,
        minMs: 9,
        maxMs: 11,
        throughput: 102400,
        samples: [10, 10, 10],
      },
      {
        operation: 'ntt',
        inputSize: 1024,
        accelerator: 'cpu',
        meanMs: 5,
        stddevMs: 0.5,
        minMs: 4.5,
        maxMs: 5.5,
        throughput: 200,
        samples: [5, 5, 5],
      },
    ];

    const comparisons = runBaselineComparison(mockResults);
    expect(comparisons.length).toBe(2);
    expect(comparisons[0]!.speedup).toBeGreaterThan(0);
    expect(comparisons[0]!.targetSpeedup).toBe(10); // MSM target
    expect(comparisons[1]!.targetSpeedup).toBe(5); // NTT target
  });
});

describe('Hardware Reporting', () => {
  it('should estimate power consumption', () => {
    const hardware = detectHardwareCapabilities();
    const mockResults: BenchmarkResult[] = [
      {
        operation: 'msm',
        inputSize: 1024,
        accelerator: 'cpu',
        meanMs: 10,
        stddevMs: 1,
        minMs: 9,
        maxMs: 11,
        throughput: 102400,
        samples: [10, 10, 10],
      },
    ];

    const powerEstimate = estimatePowerConsumption(hardware, mockResults);
    expect(powerEstimate.totalWatts).toBeGreaterThan(0);
    expect(powerEstimate.cpuWatts).toBeGreaterThanOrEqual(0);
    expect(powerEstimate.opsPerJoule).toBeGreaterThan(0);
  });

  it('should measure hardware utilization', () => {
    const mockResults: BenchmarkResult[] = [
      {
        operation: 'msm',
        inputSize: 1024,
        accelerator: 'cpu',
        meanMs: 10,
        stddevMs: 1,
        minMs: 9,
        maxMs: 11,
        throughput: 102400,
        samples: [10, 10, 10],
      },
    ];

    const utilization = measureHardwareUtilization(mockResults);
    expect(utilization.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(utilization.cpuPercent).toBeLessThanOrEqual(100);
  });

  it('should generate hardware report', () => {
    const mockResults: BenchmarkResult[] = [
      {
        operation: 'msm',
        inputSize: 1024,
        accelerator: 'cpu',
        meanMs: 10,
        stddevMs: 1,
        minMs: 9,
        maxMs: 11,
        throughput: 102400,
        samples: [10, 10, 10],
      },
    ];

    const report = getHardwareReport(mockResults);
    expect(report.capabilities).toBeDefined();
    expect(report.acceleratorTimings).toBeDefined();
    expect(report.acceleratorTimings.length).toBeGreaterThan(0);
    expect(report.recommendations).toBeDefined();
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});
