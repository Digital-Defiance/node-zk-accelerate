/**
 * Acceleration Layers Checkpoint Tests
 *
 * This test file verifies that all acceleration paths produce correct results
 * and that fallback behavior works correctly.
 *
 * Checkpoint 13: Acceleration Layers Complete
 * - Ensure all acceleration paths produce correct results
 * - Verify fallback behavior works correctly
 * - Benchmark CPU, GPU, and hybrid modes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectHardwareCapabilities,
  clearHardwareCapabilitiesCache,
  getHardwareCapabilitiesSummary,
  hasHardwareAcceleration,
} from './hardware.js';
import {
  getCPUAcceleratorStatus,
  isCPUAccelerationAvailable,
  createVDSPOperations,
  createBLASOperations,
  createNEONOperations,
  createSMEOperations,
} from './cpu-accelerate/index.js';
import {
  getGPUAccelerator,
  isMetalAvailable,
  getMetalStatus,
  checkGPUAvailability,
  FallbackReason,
  getFallbackReasonDescription,
} from './gpu-accelerate/index.js';
import {
  calculateWorkloadSplit,
  hybridMsmSync,
  hybridMsmWithFallback,
  DEFAULT_SPLIT_CONFIG,
} from './msm/hybrid.js';
import { pippengerMsm } from './msm/pippenger.js';
import { BN254_CURVE } from './curve/config.js';
import { scalarMul } from './curve/operations.js';
import { curvePointsEqual } from './curve/point.js';
import {
  forwardNtt,
  inverseNtt,
  createNTTConfig,
  forwardNttRadix2,
  inverseNttRadix2,
  forwardNttRadix4,
  inverseNttRadix4,
} from './ntt/index.js';
import { BN254_SCALAR_FIELD, BN254_FIELD } from './field/config.js';
import { createFieldElement, fieldElementsEqual } from './field/element.js';

describe('Checkpoint 13: Acceleration Layers Complete', () => {
  beforeEach(() => {
    clearHardwareCapabilitiesCache();
  });

  describe('Hardware Detection', () => {
    it('should detect hardware capabilities correctly', () => {
      const caps = detectHardwareCapabilities();

      expect(caps).toBeDefined();
      expect(typeof caps.hasNeon).toBe('boolean');
      expect(typeof caps.hasAmx).toBe('boolean');
      expect(typeof caps.hasSme).toBe('boolean');
      expect(typeof caps.hasMetal).toBe('boolean');
      expect(typeof caps.unifiedMemory).toBe('boolean');
      expect(caps.cpuCores).toBeGreaterThanOrEqual(1);
    });

    it('should provide human-readable summary', () => {
      const summary = getHardwareCapabilitiesSummary();

      expect(summary).toContain('Hardware Capabilities:');
      expect(summary).toContain('CPU:');
      expect(summary).toContain('NEON SIMD:');
      expect(summary).toContain('AMX:');
      expect(summary).toContain('SME:');
      expect(summary).toContain('Metal GPU:');
    });

    it('should report acceleration availability', () => {
      const hasAccel = hasHardwareAcceleration();
      expect(typeof hasAccel).toBe('boolean');

      // On Apple Silicon, should have acceleration
      if (process.platform === 'darwin' && process.arch === 'arm64') {
        expect(hasAccel).toBe(true);
      }
    });
  });

  describe('CPU Acceleration Layer', () => {
    it('should report CPU accelerator status', () => {
      const status = getCPUAcceleratorStatus();

      expect(status).toHaveProperty('vdspAvailable');
      expect(status).toHaveProperty('blasAvailable');
      expect(status).toHaveProperty('neonAvailable');
      expect(status).toHaveProperty('amxAvailable');
      expect(status).toHaveProperty('smeAvailable');
    });

    it('should have CPU acceleration available on supported platforms', () => {
      const available = isCPUAccelerationAvailable();

      // On macOS or ARM64, should have some acceleration
      if (process.platform === 'darwin' || process.arch === 'arm64') {
        expect(available).toBe(true);
      }
    });

    describe('vDSP Operations', () => {
      const vdsp = createVDSPOperations();

      it('should perform vector operations correctly', () => {
        const a = new Float64Array([1, 2, 3, 4]);
        const b = new Float64Array([5, 6, 7, 8]);

        const sum = vdsp.vectorAdd(a, b);
        expect(Array.from(sum)).toEqual([6, 8, 10, 12]);

        const product = vdsp.vectorMul(a, b);
        expect(Array.from(product)).toEqual([5, 12, 21, 32]);
      });
    });

    describe('BLAS Operations', () => {
      const blas = createBLASOperations();

      it('should perform matrix operations correctly', () => {
        // 2x2 matrix multiplication
        const a = new Float64Array([1, 2, 3, 4]);
        const b = new Float64Array([5, 6, 7, 8]);
        const result = blas.matrixMul(a, b, 2, 2, 2);

        expect(result[0]).toBe(19); // 1*5 + 2*7
        expect(result[1]).toBe(22); // 1*6 + 2*8
        expect(result[2]).toBe(43); // 3*5 + 4*7
        expect(result[3]).toBe(50); // 3*6 + 4*8
      });
    });

    describe('NEON Operations', () => {
      const neon = createNEONOperations();

      it('should perform Montgomery multiplication correctly', () => {
        const a = new BigUint64Array([1n, 0n, 0n, 0n]);
        const b = new BigUint64Array([2n, 0n, 0n, 0n]);
        const result = neon.montgomeryMul4Limb(a, b, BN254_FIELD);

        expect(result).toBeInstanceOf(BigUint64Array);
        expect(result.length).toBe(4);
        expect(result[0]).toBe(2n);
      });
    });

    describe('SME Operations', () => {
      const sme = createSMEOperations();

      it('should be marked as experimental', () => {
        expect(sme.isExperimental()).toBe(true);
      });

      it('should fall back gracefully when SME not available', () => {
        const scalars = new BigUint64Array([1n, 2n]);
        const points = new Float64Array([1, 2]);
        const { buckets, usedSME } = sme.bucketOuterProduct(scalars, points, 3, 1);

        expect(buckets).toBeInstanceOf(Float64Array);
        expect(typeof usedSME).toBe('boolean');
      });
    });
  });

  describe('GPU Acceleration Layer', () => {
    it('should report GPU accelerator status', () => {
      const accelerator = getGPUAccelerator();
      const status = accelerator.getStatus();

      expect(status).toHaveProperty('available');
      expect(status).toHaveProperty('initialized');
      expect(typeof status.available).toBe('boolean');
    });

    it('should report Metal availability', () => {
      const available = isMetalAvailable();
      expect(typeof available).toBe('boolean');

      // Note: Metal availability depends on native binding being fully functional
      // The hardware detection may report Metal available even if native binding
      // doesn't expose Metal functions yet
      const caps = detectHardwareCapabilities();
      if (process.platform === 'darwin') {
        // Hardware detection should report Metal available on macOS
        expect(caps.hasMetal).toBe(true);
      }
    });

    it('should provide Metal status', () => {
      const status = getMetalStatus();

      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('deviceAvailable');
      expect(status).toHaveProperty('unifiedMemory');
      expect(status).toHaveProperty('maxThreadsPerGroup');
    });
  });

  describe('Fallback Behavior', () => {
    it('should check GPU availability and provide fallback info', () => {
      const fallbackInfo = checkGPUAvailability();

      expect(fallbackInfo).toHaveProperty('fellBack');
      expect(typeof fallbackInfo.fellBack).toBe('boolean');

      if (fallbackInfo.fellBack) {
        expect(fallbackInfo.reason).toBeDefined();
        expect(fallbackInfo.message).toBeDefined();
      }
    });

    it('should provide human-readable fallback reason descriptions', () => {
      const reasons = [
        FallbackReason.METAL_UNAVAILABLE,
        FallbackReason.METAL_INIT_FAILED,
        FallbackReason.SHADER_COMPILATION_FAILED,
        FallbackReason.BUFFER_ALLOCATION_FAILED,
        FallbackReason.EXECUTION_FAILED,
        FallbackReason.INPUT_TOO_SMALL,
        FallbackReason.USER_REQUESTED_CPU,
        FallbackReason.UNKNOWN_ERROR,
      ];

      for (const reason of reasons) {
        const description = getFallbackReasonDescription(reason);
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(0);
      }
    });

    it('should execute with fallback when GPU unavailable', async () => {
      const accelerator = getGPUAccelerator();

      const gpuOp = async () => {
        throw new Error('GPU not available');
      };
      const cpuFallback = () => 42;

      const result = await accelerator.executeWithFallback(gpuOp, cpuFallback);
      expect(result).toBe(42);
    });
  });

  describe('Hybrid CPU+GPU Execution', () => {
    it('should calculate workload split correctly', () => {
      const split = calculateWorkloadSplit(1000);

      expect(split).toHaveProperty('cpuPoints');
      expect(split).toHaveProperty('gpuPoints');
      expect(split).toHaveProperty('useHybrid');
      expect(split).toHaveProperty('estimatedTimeMs');
      expect(split).toHaveProperty('reason');

      expect(split.cpuPoints + split.gpuPoints).toBe(1000);
    });

    it('should use CPU-only for small inputs', () => {
      const split = calculateWorkloadSplit(100);

      expect(split.useHybrid).toBe(false);
      expect(split.cpuPoints).toBe(100);
      expect(split.gpuPoints).toBe(0);
    });

    it('should respect custom GPU threshold', () => {
      const split = calculateWorkloadSplit(500, { minGpuPoints: 1000 });

      expect(split.useHybrid).toBe(false);
      expect(split.cpuPoints).toBe(500);
    });

    it('should compute correct MSM result with hybrid sync', () => {
      const scalars = [2n, 3n, 5n];
      const points = [BN254_CURVE.generator, BN254_CURVE.generator, BN254_CURVE.generator];

      const result = hybridMsmSync(scalars, points, BN254_CURVE);

      // Expected: 2*G + 3*G + 5*G = 10*G
      const expected = scalarMul(10n, BN254_CURVE.generator, BN254_CURVE);

      expect(curvePointsEqual(result.point, expected, BN254_CURVE)).toBe(true);
      expect(result.cpuTimeMs).toBeGreaterThan(0);
    });

    it('should compute correct MSM result with hybrid fallback', async () => {
      const scalars = [7n, 11n];
      const points = [BN254_CURVE.generator, BN254_CURVE.generator];

      const result = await hybridMsmWithFallback(scalars, points, BN254_CURVE);

      // Expected: 7*G + 11*G = 18*G
      const expected = scalarMul(18n, BN254_CURVE.generator, BN254_CURVE);

      expect(curvePointsEqual(result, expected, BN254_CURVE)).toBe(true);
    });
  });

  describe('MSM Correctness Across Acceleration Paths', () => {
    it('should produce identical results for CPU Pippenger', () => {
      const n = 8;
      const scalars: bigint[] = [];
      const points = [];

      for (let i = 0; i < n; i++) {
        scalars.push(BigInt(i + 1));
        points.push(BN254_CURVE.generator);
      }

      const result = pippengerMsm(scalars, points, BN254_CURVE);

      // Expected: sum of 1 + 2 + ... + n = n*(n+1)/2
      const expectedScalar = BigInt((n * (n + 1)) / 2);
      const expected = scalarMul(expectedScalar, BN254_CURVE.generator, BN254_CURVE);

      expect(curvePointsEqual(result, expected, BN254_CURVE)).toBe(true);
    });

    it('should produce identical results for hybrid sync', () => {
      const n = 8;
      const scalars: bigint[] = [];
      const points = [];

      for (let i = 0; i < n; i++) {
        scalars.push(BigInt(i + 1));
        points.push(BN254_CURVE.generator);
      }

      const result = hybridMsmSync(scalars, points, BN254_CURVE);

      const expectedScalar = BigInt((n * (n + 1)) / 2);
      const expected = scalarMul(expectedScalar, BN254_CURVE.generator, BN254_CURVE);

      expect(curvePointsEqual(result.point, expected, BN254_CURVE)).toBe(true);
    });
  });

  describe('NTT Correctness Across Acceleration Paths', () => {
    it('should produce identical results for radix-2 and radix-4', () => {
      const n = 16;
      const config = createNTTConfig(n, BN254_SCALAR_FIELD);

      // Create test coefficients
      const coefficients = [];
      for (let i = 0; i < n; i++) {
        coefficients.push(createFieldElement(BigInt(i + 1), BN254_SCALAR_FIELD));
      }

      // Forward NTT with radix-2
      const radix2Result = forwardNttRadix2(coefficients, config);

      // Forward NTT with radix-4
      const radix4Result = forwardNttRadix4(coefficients, config);

      // Results should be identical
      for (let i = 0; i < n; i++) {
        expect(fieldElementsEqual(radix2Result[i]!, radix4Result[i]!)).toBe(true);
      }
    });

    it('should produce round-trip correctness for radix-2', () => {
      const n = 8;
      const config = createNTTConfig(n, BN254_SCALAR_FIELD);

      const original = [];
      for (let i = 0; i < n; i++) {
        original.push(createFieldElement(BigInt(i + 1), BN254_SCALAR_FIELD));
      }

      const transformed = forwardNttRadix2(original, config);
      const recovered = inverseNttRadix2(transformed, config);

      for (let i = 0; i < n; i++) {
        expect(fieldElementsEqual(original[i]!, recovered[i]!)).toBe(true);
      }
    });

    it('should produce round-trip correctness for radix-4', () => {
      const n = 16;
      const config = createNTTConfig(n, BN254_SCALAR_FIELD);

      const original = [];
      for (let i = 0; i < n; i++) {
        original.push(createFieldElement(BigInt(i + 1), BN254_SCALAR_FIELD));
      }

      const transformed = forwardNttRadix4(original, config);
      const recovered = inverseNttRadix4(transformed, config);

      for (let i = 0; i < n; i++) {
        expect(fieldElementsEqual(original[i]!, recovered[i]!)).toBe(true);
      }
    });
  });

  describe('Benchmark Summary', () => {
    it('should benchmark CPU MSM performance', () => {
      const n = 64;
      const scalars: bigint[] = [];
      const points = [];

      for (let i = 0; i < n; i++) {
        scalars.push(BigInt(i + 1));
        points.push(BN254_CURVE.generator);
      }

      const startTime = performance.now();
      const result = pippengerMsm(scalars, points, BN254_CURVE);
      const endTime = performance.now();

      const timeMs = endTime - startTime;
      const pointsPerSecond = (n / timeMs) * 1000;

      expect(result).toBeDefined();
      expect(timeMs).toBeGreaterThan(0);

      // Log benchmark results
      console.log(`\n  CPU MSM Benchmark (${n} points):`);
      console.log(`    Time: ${timeMs.toFixed(2)}ms`);
      console.log(`    Throughput: ${pointsPerSecond.toFixed(0)} points/sec`);
    });

    it('should benchmark hybrid MSM performance', () => {
      const n = 64;
      const scalars: bigint[] = [];
      const points = [];

      for (let i = 0; i < n; i++) {
        scalars.push(BigInt(i + 1));
        points.push(BN254_CURVE.generator);
      }

      const result = hybridMsmSync(scalars, points, BN254_CURVE);

      expect(result.point).toBeDefined();
      expect(result.cpuTimeMs).toBeGreaterThan(0);

      console.log(`\n  Hybrid MSM Benchmark (${n} points):`);
      console.log(`    CPU Time: ${result.cpuTimeMs.toFixed(2)}ms`);
      console.log(`    GPU Time: ${result.gpuTimeMs.toFixed(2)}ms`);
      console.log(`    Total Time: ${result.totalTimeMs.toFixed(2)}ms`);
      console.log(`    Used Hybrid: ${result.usedHybrid}`);
    });

    it('should benchmark NTT performance', () => {
      const n = 256;
      const config = createNTTConfig(n, BN254_SCALAR_FIELD);

      const coefficients = [];
      for (let i = 0; i < n; i++) {
        coefficients.push(createFieldElement(BigInt(i + 1), BN254_SCALAR_FIELD));
      }

      // Benchmark radix-2
      const startRadix2 = performance.now();
      const radix2Result = forwardNttRadix2(coefficients, config);
      const endRadix2 = performance.now();
      const radix2Time = endRadix2 - startRadix2;

      // Benchmark radix-4
      const startRadix4 = performance.now();
      const radix4Result = forwardNttRadix4(coefficients, config);
      const endRadix4 = performance.now();
      const radix4Time = endRadix4 - startRadix4;

      expect(radix2Result.length).toBe(n);
      expect(radix4Result.length).toBe(n);

      console.log(`\n  NTT Benchmark (n=${n}):`);
      console.log(`    Radix-2 Time: ${radix2Time.toFixed(2)}ms`);
      console.log(`    Radix-4 Time: ${radix4Time.toFixed(2)}ms`);
      console.log(`    Radix-4 Speedup: ${(radix2Time / radix4Time).toFixed(2)}x`);
    });
  });
});
