# Benchmarking Guide

This guide explains how to run benchmarks and interpret results for `@digitaldefiance/node-zk-accelerate`.

## Quick Benchmark

Run a quick benchmark that completes in under 60 seconds:

```typescript
import { runQuickBenchmarkMode } from '@digitaldefiance/node-zk-accelerate';

const results = await runQuickBenchmarkMode();
console.log(results);
```

Or via command line:

```bash
npx ts-node -e "
import { runQuickBenchmarkMode } from '@digitaldefiance/node-zk-accelerate';
runQuickBenchmarkMode().then(r => console.log(JSON.stringify(r, null, 2)));
"
```

## Benchmark Suite

### Running the Full Suite

```typescript
import {
  runBenchmarkSuite,
  saveBenchmarkResults,
  FULL_BENCHMARK_CONFIG,
} from '@digitaldefiance/node-zk-accelerate';

// Run comprehensive benchmarks
const results = await runBenchmarkSuite({
  msm: FULL_BENCHMARK_CONFIG,
  ntt: FULL_BENCHMARK_CONFIG,
});

// Save results to file
await saveBenchmarkResults(results, './benchmark-results.json');

console.log('Summary:');
console.log(`  MSM speedup: ${results.summary.avgMsmSpeedup?.toFixed(1)}x`);
console.log(`  NTT speedup: ${results.summary.avgNttSpeedup?.toFixed(1)}x`);
```

### MSM Benchmarks

```typescript
import {
  runMsmBenchmarks,
  DEFAULT_MSM_BENCHMARK_CONFIG,
} from '@digitaldefiance/node-zk-accelerate';

// Run MSM benchmarks with default config
const msmResults = await runMsmBenchmarks(DEFAULT_MSM_BENCHMARK_CONFIG);

// Custom configuration
const customResults = await runMsmBenchmarks({
  sizes: [1024, 4096, 16384, 65536, 262144],  // Input sizes
  iterations: 10,                               // Iterations per size
  warmup: 3,                                    // Warmup iterations
  curve: 'BN254',                               // Curve to use
  accelerators: ['cpu', 'gpu', 'hybrid'],       // Accelerators to test
  validateResults: true,                        // Verify correctness
  timeoutMs: 120000,                            // Timeout per benchmark
});

// Print results
for (const result of customResults) {
  console.log(`MSM ${result.inputSize}: ${result.meanMs.toFixed(1)}ms (${result.accelerator})`);
}
```

### NTT Benchmarks

```typescript
import {
  runNttBenchmarks,
  DEFAULT_NTT_BENCHMARK_CONFIG,
} from '@digitaldefiance/node-zk-accelerate';

// Run NTT benchmarks
const nttResults = await runNttBenchmarks({
  sizes: [1024, 4096, 16384, 65536],
  iterations: 10,
  warmup: 3,
  curve: 'BN254',
  accelerators: ['cpu'],
  radix: 2,        // NTT radix (2 or 4)
  inPlace: false,  // In-place transform
});

for (const result of nttResults) {
  console.log(`NTT ${result.inputSize}: ${result.meanMs.toFixed(1)}ms`);
}
```

## Baseline Comparison

Compare against snarkjs WASM baseline:

```typescript
import {
  runBaselineComparison,
  calculateSpeedups,
} from '@digitaldefiance/node-zk-accelerate';

// Run comparison benchmarks
const comparison = await runBaselineComparison({
  sizes: [4096, 16384, 65536],
  iterations: 5,
  curve: 'BN254',
});

console.log('Baseline Comparison:');
for (const result of comparison.results) {
  const speedup = result.speedupVsBaseline?.toFixed(1) || 'N/A';
  console.log(`  ${result.operation} ${result.inputSize}: ${speedup}x speedup`);
}
```

## Benchmark Configuration

### Predefined Configurations

```typescript
import {
  QUICK_BENCHMARK_CONFIG,
  DEFAULT_MSM_BENCHMARK_CONFIG,
  DEFAULT_NTT_BENCHMARK_CONFIG,
  FULL_BENCHMARK_CONFIG,
} from '@digitaldefiance/node-zk-accelerate';

// Quick: ~60 seconds, representative results
// sizes: [1024, 4096], iterations: 3, warmup: 1

// Default MSM: ~5 minutes, good coverage
// sizes: [1024, 4096, 16384, 65536], iterations: 5, warmup: 2

// Default NTT: ~5 minutes, good coverage
// sizes: [1024, 4096, 16384, 65536], iterations: 5, warmup: 2

// Full: ~30 minutes, comprehensive
// sizes: [1024, 4096, 16384, 65536, 262144, 1048576], iterations: 10, warmup: 3
```

### Custom Configuration

```typescript
interface BenchmarkConfig {
  // Input sizes to benchmark (must be powers of 2 for NTT)
  sizes: number[];
  
  // Number of timed iterations per size
  iterations: number;
  
  // Number of warmup iterations (not timed)
  warmup: number;
  
  // Curve to use
  curve: 'BN254' | 'BLS12_381';
  
  // Accelerators to benchmark
  accelerators: ('cpu' | 'gpu' | 'hybrid' | 'wasm' | 'baseline')[];
  
  // Validate results for correctness (slower)
  validateResults?: boolean;
  
  // Timeout per benchmark in milliseconds
  timeoutMs?: number;
}
```

## Interpreting Results

### Benchmark Result Structure

```typescript
interface BenchmarkResult {
  operation: 'msm' | 'ntt' | 'field_mul' | 'point_add';
  inputSize: number;
  curve?: 'BN254' | 'BLS12_381';
  accelerator: 'cpu' | 'gpu' | 'hybrid' | 'wasm' | 'baseline';
  
  // Timing statistics (milliseconds)
  meanMs: number;      // Average time
  stddevMs: number;    // Standard deviation
  minMs: number;       // Fastest run
  maxMs: number;       // Slowest run
  
  // Performance metrics
  throughput: number;           // Operations or points per second
  speedupVsBaseline?: number;   // Speedup vs WASM baseline
  
  // Hardware utilization (if available)
  hardwareUtilization?: {
    cpuPercent?: number;
    gpuPercent?: number;
    amxActive?: boolean;
    smeActive?: boolean;
  };
  
  // All timing samples
  samples: number[];
}
```

### Key Metrics

**Throughput**: Points processed per second (MSM) or transforms per second (NTT)
```typescript
// MSM throughput = inputSize / (meanMs / 1000)
// e.g., 65536 points in 180ms = 364,089 points/sec
```

**Speedup**: Ratio of baseline time to accelerated time
```typescript
// speedup = baselineMs / acceleratedMs
// e.g., 2500ms / 180ms = 13.9x speedup
```

**Standard Deviation**: Measure of timing consistency
```typescript
// Low stddev = consistent performance
// High stddev = variable performance (check for thermal throttling)
```

### Example Output

```json
{
  "timestamp": "2025-01-16T10:30:00.000Z",
  "hardware": {
    "hasNeon": true,
    "hasAmx": true,
    "hasSme": false,
    "hasMetal": true,
    "metalDeviceName": "Apple M4 Max",
    "cpuCores": 16,
    "gpuCores": 40
  },
  "results": [
    {
      "operation": "msm",
      "inputSize": 65536,
      "curve": "BN254",
      "accelerator": "hybrid",
      "meanMs": 178.5,
      "stddevMs": 12.3,
      "minMs": 165.2,
      "maxMs": 198.7,
      "throughput": 367142,
      "speedupVsBaseline": 14.0,
      "samples": [165.2, 172.4, 178.9, 185.3, 198.7]
    }
  ],
  "summary": {
    "avgMsmSpeedup": 13.8,
    "avgNttSpeedup": 7.2,
    "peakMsmThroughput": 412000,
    "bestMsmAccelerator": "hybrid"
  }
}
```

## Hardware Utilization Reporting

```typescript
import {
  measureHardwareUtilization,
  getHardwareReport,
  estimatePowerConsumption,
} from '@digitaldefiance/node-zk-accelerate';

// Get hardware report
const report = getHardwareReport();
console.log('Hardware Report:');
console.log(`  Recommended accelerator: ${report.recommendedAccelerator}`);
console.log(`  Estimated MSM speedup: ${report.estimatedSpeedup.msm}x`);

// Measure utilization during operation
const utilization = await measureHardwareUtilization(async () => {
  return msm(scalars, points, curve);
});
console.log(`CPU: ${utilization.cpuPercent}%`);
console.log(`GPU: ${utilization.gpuPercent}%`);

// Estimate power consumption
const power = estimatePowerConsumption('msm', 65536);
console.log(`Estimated power: ${power.watts}W`);
console.log(`Estimated energy: ${power.joules}J`);
```

## Saving and Loading Results

```typescript
import {
  saveBenchmarkResults,
  loadBenchmarkResults,
  exportBenchmarkResults,
} from '@digitaldefiance/node-zk-accelerate';

// Save to JSON file
await saveBenchmarkResults(results, './benchmarks/results.json');

// Load from file
const loaded = await loadBenchmarkResults('./benchmarks/results.json');

// Export to different formats
const json = exportBenchmarkResults(results, 'json');
const csv = exportBenchmarkResults(results, 'csv');
```

## Benchmark Script Example

Create a comprehensive benchmark script:

```typescript
// benchmark.ts
import {
  runBenchmarkSuite,
  saveBenchmarkResults,
  getHardwareReport,
  detectHardwareCapabilities,
  FULL_BENCHMARK_CONFIG,
} from '@digitaldefiance/node-zk-accelerate';

async function main() {
  console.log('=== ZK Accelerate Benchmark Suite ===\n');

  // Print hardware info
  const caps = detectHardwareCapabilities();
  console.log('Hardware:');
  console.log(`  CPU: ${caps.cpuCores} cores`);
  console.log(`  GPU: ${caps.metalDeviceName || 'N/A'}`);
  console.log(`  NEON: ${caps.hasNeon}, AMX: ${caps.hasAmx}, SME: ${caps.hasSme}`);
  console.log();

  // Run benchmarks
  console.log('Running benchmarks (this may take several minutes)...\n');
  
  const results = await runBenchmarkSuite({
    msm: {
      ...FULL_BENCHMARK_CONFIG,
      sizes: [1024, 4096, 16384, 65536],
    },
    ntt: {
      ...FULL_BENCHMARK_CONFIG,
      sizes: [1024, 4096, 16384, 65536],
    },
  });

  // Print results
  console.log('\n=== Results ===\n');
  
  console.log('MSM Benchmarks:');
  for (const r of results.results.filter(r => r.operation === 'msm')) {
    const speedup = r.speedupVsBaseline?.toFixed(1) || 'N/A';
    console.log(`  ${r.inputSize.toString().padStart(6)} points: ${r.meanMs.toFixed(1).padStart(8)}ms (${r.accelerator}, ${speedup}x)`);
  }

  console.log('\nNTT Benchmarks:');
  for (const r of results.results.filter(r => r.operation === 'ntt')) {
    const speedup = r.speedupVsBaseline?.toFixed(1) || 'N/A';
    console.log(`  ${r.inputSize.toString().padStart(6)} degree: ${r.meanMs.toFixed(1).padStart(8)}ms (${r.accelerator}, ${speedup}x)`);
  }

  console.log('\n=== Summary ===');
  console.log(`  Average MSM speedup: ${results.summary.avgMsmSpeedup?.toFixed(1)}x`);
  console.log(`  Average NTT speedup: ${results.summary.avgNttSpeedup?.toFixed(1)}x`);
  console.log(`  Best MSM accelerator: ${results.summary.bestMsmAccelerator}`);
  console.log(`  Total duration: ${(results.totalDurationMs / 1000).toFixed(1)}s`);

  // Save results
  const filename = `benchmark-${new Date().toISOString().slice(0, 10)}.json`;
  await saveBenchmarkResults(results, filename);
  console.log(`\nResults saved to ${filename}`);
}

main().catch(console.error);
```

Run with:
```bash
npx ts-node benchmark.ts
```

## Performance Tips

### 1. Warm Up the System

Run a few iterations before timing:
```typescript
// Warmup
for (let i = 0; i < 3; i++) {
  msm(scalars, points, curve);
}

// Timed run
const start = Date.now();
const result = msm(scalars, points, curve);
console.log(`Time: ${Date.now() - start}ms`);
```

### 2. Avoid Thermal Throttling

For accurate benchmarks:
- Run on a cool system
- Allow cooling between benchmark runs
- Monitor for increasing times (indicates throttling)

### 3. Use Consistent Input Sizes

Powers of 2 work best:
```typescript
const sizes = [1024, 2048, 4096, 8192, 16384, 32768, 65536];
```

### 4. Multiple Iterations

Use enough iterations for statistical significance:
```typescript
const config = {
  iterations: 10,  // At least 5-10 for reliable results
  warmup: 3,       // Warmup iterations
};
```

### 5. Compare Apples to Apples

When comparing:
- Use the same input data
- Use the same curve
- Run on the same hardware
- Control for background processes

## Troubleshooting

### Inconsistent Results

High variance in timing can indicate:
- Thermal throttling (system getting hot)
- Background processes
- Memory pressure

Solution: Increase warmup, reduce iterations, or cool the system.

### Lower Than Expected Speedup

Check:
1. Native bindings are loaded (not using WASM fallback)
2. Input size is large enough for GPU benefit
3. Correct accelerator is being used

```typescript
import { getNativeBindingStatus } from '@digitaldefiance/node-zk-accelerate';
console.log(getNativeBindingStatus());
```

### Benchmark Timeout

Increase timeout for large inputs:
```typescript
const config = {
  timeoutMs: 300000,  // 5 minutes
};
```

## Next Steps

- See the [Hardware Utilization Guide](./hardware-utilization.md) for optimization tips
- See the [snarkjs Integration Guide](./snarkjs-integration.md) for real-world usage
- Check the [README](../README.md) for general library usage
