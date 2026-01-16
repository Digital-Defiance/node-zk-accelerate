/**
 * Benchmarking Suite for @digitaldefiance/node-zk-accelerate
 *
 * Provides comprehensive benchmarking capabilities for MSM and NTT operations,
 * including comparison against snarkjs WASM baseline and hardware utilization
 * reporting.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 *
 * @module benchmark
 */

// Types
export type {
  BenchmarkOperation,
  AcceleratorType,
  BenchmarkResult,
  HardwareUtilization,
  BenchmarkConfig,
  MSMBenchmarkConfig,
  NTTBenchmarkConfig,
  BenchmarkSuiteResult,
  BenchmarkSummary,
} from './types.js';

export {
  DEFAULT_MSM_BENCHMARK_CONFIG,
  DEFAULT_NTT_BENCHMARK_CONFIG,
  QUICK_BENCHMARK_CONFIG,
  FULL_BENCHMARK_CONFIG,
} from './types.js';

// Runner
export {
  runMsmBenchmarks,
  runNttBenchmarks,
  runBenchmarkSuite,
  runQuickBenchmark,
  exportBenchmarkResults,
  saveBenchmarkResults,
  loadBenchmarkResults,
} from './runner.js';

// Baseline comparison
export {
  runBaselineComparison,
  simulateSnarkjsBaseline,
  calculateSpeedups,
  type BaselineComparisonResult,
} from './baseline.js';

// Hardware reporting
export {
  getHardwareReport,
  measureHardwareUtilization,
  estimatePowerConsumption,
  type HardwareReport,
  type PowerEstimate,
} from './hardware-report.js';

// Quick benchmark
export { runQuickBenchmarkMode, type QuickBenchmarkResult } from './quick.js';
