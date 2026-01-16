/**
 * Tests for Hybrid CPU+GPU MSM Execution
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { describe, it, expect } from 'vitest';
import {
  calculateWorkloadSplit,
  getWorkloadSplitDescription,
  hybridMsmSync,
  DEFAULT_SPLIT_CONFIG,
  applyCalibration,
  needsCalibration,
  clearCalibrationCache,
  type CalibrationResult,
  type WorkloadSplitConfig,
} from './hybrid.js';
import { BN254_CURVE } from '../curve/config.js';
import { scalarMul } from '../curve/operations.js';
import { curvePointsEqual } from '../curve/point.js';
import type { HardwareCapabilities } from '../hardware.js';

describe('Workload Splitting Heuristics', () => {
  const mockCapsWithGPU: HardwareCapabilities = {
    hasNeon: true,
    hasAmx: true,
    hasSme: false,
    hasMetal: true,
    unifiedMemory: true,
    cpuCores: 12,
  };

  const mockCapsNoGPU: HardwareCapabilities = {
    hasNeon: true,
    hasAmx: true,
    hasSme: false,
    hasMetal: false,
    unifiedMemory: false,
    cpuCores: 8,
  };

  it('should use CPU-only for small inputs', () => {
    // Note: This test checks the logic when GPU is available but input is small
    // Since isGPUMSMAvailable() may return false in test environment,
    // we check that the split is CPU-only regardless of reason
    const split = calculateWorkloadSplit(100, {}, mockCapsWithGPU);
    expect(split.useHybrid).toBe(false);
    expect(split.cpuPoints).toBe(100);
    expect(split.gpuPoints).toBe(0);
    // Reason could be either "below GPU threshold" or "GPU not available"
    expect(split.reason.length).toBeGreaterThan(0);
  });

  it('should use CPU-only when GPU not available', () => {
    const split = calculateWorkloadSplit(10000, {}, mockCapsNoGPU);
    expect(split.useHybrid).toBe(false);
    expect(split.cpuPoints).toBe(10000);
    expect(split.gpuPoints).toBe(0);
    expect(split.reason).toContain('GPU not available');
  });

  it('should respect custom GPU threshold', () => {
    const config: Partial<WorkloadSplitConfig> = {
      minGpuPoints: 500,
    };
    const split = calculateWorkloadSplit(400, config, mockCapsWithGPU);
    expect(split.useHybrid).toBe(false);
    expect(split.cpuPoints).toBe(400);
  });

  it('should provide meaningful description', () => {
    const split = calculateWorkloadSplit(100, {}, mockCapsNoGPU);
    const description = getWorkloadSplitDescription(split);
    expect(description).toContain('CPU-only');
    expect(description).toContain('100 points');
  });

  it('should estimate time correctly', () => {
    const split = calculateWorkloadSplit(1000, {}, mockCapsNoGPU);
    expect(split.estimatedTimeMs).toBeGreaterThan(0);
  });
});

describe('Hybrid MSM Sync Execution', () => {
  it('should compute correct MSM result for small inputs', () => {
    const scalars = [2n, 3n];
    const points = [BN254_CURVE.generator, BN254_CURVE.generator];

    const result = hybridMsmSync(scalars, points, BN254_CURVE);

    // Expected: 2*G + 3*G = 5*G
    const expected = scalarMul(5n, BN254_CURVE.generator, BN254_CURVE);

    expect(curvePointsEqual(result.point, expected, BN254_CURVE)).toBe(true);
    expect(result.usedHybrid).toBe(false);
    expect(result.cpuPoints).toBe(2);
    expect(result.gpuPoints).toBe(0);
    expect(result.cpuTimeMs).toBeGreaterThan(0);
  });

  it('should handle single point MSM', () => {
    const scalars = [7n];
    const points = [BN254_CURVE.generator];

    const result = hybridMsmSync(scalars, points, BN254_CURVE);

    const expected = scalarMul(7n, BN254_CURVE.generator, BN254_CURVE);
    expect(curvePointsEqual(result.point, expected, BN254_CURVE)).toBe(true);
  });

  it('should handle larger inputs correctly', () => {
    // Generate test data
    const n = 16;
    const scalars: bigint[] = [];
    const points = [];

    for (let i = 0; i < n; i++) {
      scalars.push(BigInt(i + 1));
      points.push(BN254_CURVE.generator);
    }

    const result = hybridMsmSync(scalars, points, BN254_CURVE);

    // Expected: sum of 1 + 2 + ... + n = n*(n+1)/2
    const expectedScalar = BigInt((n * (n + 1)) / 2);
    const expected = scalarMul(expectedScalar, BN254_CURVE.generator, BN254_CURVE);

    expect(curvePointsEqual(result.point, expected, BN254_CURVE)).toBe(true);
    expect(result.totalTimeMs).toBeGreaterThan(0);
  });
});

describe('Calibration', () => {
  it('should indicate calibration is needed initially', () => {
    clearCalibrationCache();
    expect(needsCalibration()).toBe(true);
  });

  it('should apply calibration result correctly', () => {
    const calibration: CalibrationResult = {
      optimalGpuRatio: 0.6,
      cpuTimePerPointUs: 1.2,
      gpuTimePerPointUs: 0.4,
      gpuDispatchOverheadMs: 3.0,
      hardware: {
        hasNeon: true,
        hasAmx: true,
        hasSme: false,
        hasMetal: true,
        unifiedMemory: true,
        cpuCores: 12,
      },
      timestamp: Date.now(),
    };

    const config = applyCalibration(calibration);

    expect(config.gpuRatio).toBe(0.6);
    expect(config.cpuTimePerPointUs).toBe(1.2);
    expect(config.gpuTimePerPointUs).toBe(0.4);
    expect(config.gpuDispatchOverheadMs).toBe(3.0);
    expect(config.minGpuPoints).toBe(DEFAULT_SPLIT_CONFIG.minGpuPoints);
  });
});
