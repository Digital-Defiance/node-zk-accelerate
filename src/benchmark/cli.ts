#!/usr/bin/env node
/**
 * Benchmark CLI
 *
 * Command-line interface for running benchmarks.
 *
 * Usage:
 *   yarn benchmark          # Run quick benchmark
 *   yarn benchmark:quick    # Run quick benchmark (< 60s)
 *   yarn benchmark:full     # Run full benchmark suite
 *   yarn benchmark:json     # Output results as JSON
 *
 * Requirements: 12.7
 */

import { runQuickBenchmarkMode, runMinimalBenchmark } from './quick.js';
import { runBenchmarkSuite, exportBenchmarkResults } from './runner.js';
import { runBaselineComparison } from './baseline.js';
import { FULL_BENCHMARK_CONFIG } from './types.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const isQuick = args.includes('--quick') || args.length === 0;
  const isFull = args.includes('--full');
  const isJson = args.includes('--json');
  const isMinimal = args.includes('--minimal');

  try {
    if (isMinimal) {
      const result = await runMinimalBenchmark();
      if (isJson) {
        console.log(JSON.stringify(result.suite, null, 2));
      }
      process.exit(result.allTargetsMet ? 0 : 1);
    } else if (isFull) {
      console.log('Running full benchmark suite...\n');
      const suite = await runBenchmarkSuite(FULL_BENCHMARK_CONFIG);
      const comparisons = runBaselineComparison(suite.results);

      if (isJson) {
        console.log(exportBenchmarkResults(suite));
      } else {
        console.log('\n=== Baseline Comparison ===');
        for (const comp of comparisons) {
          const status = comp.targetAchieved ? '✓' : '✗';
          console.log(
            `${comp.operation.toUpperCase()} ${comp.inputSize}: ` +
              `${comp.speedup.toFixed(1)}x vs snarkjs (target: ${comp.targetSpeedup}x) ${status}`
          );
        }
      }

      const allTargetsMet = comparisons.every((c) => c.targetAchieved);
      process.exit(allTargetsMet ? 0 : 1);
    } else if (isQuick) {
      const result = await runQuickBenchmarkMode();
      if (isJson) {
        console.log(JSON.stringify(result.suite, null, 2));
      }
      process.exit(result.allTargetsMet ? 0 : 1);
    }
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

main();
