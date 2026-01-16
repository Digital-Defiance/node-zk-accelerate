/**
 * CPU Acceleration Layer Tests
 *
 * Tests for vDSP, BLAS, NEON, and SME operations.
 */

import { describe, it, expect } from 'vitest';
import {
  getCPUAcceleratorStatus,
  isCPUAccelerationAvailable,
  createVDSPOperations,
  createBLASOperations,
  createNEONOperations,
  createSMEOperations,
} from './index.js';
import { BN254_FIELD } from '../field/config.js';

describe('CPU Accelerator Status', () => {
  it('should return status object with all required fields', () => {
    const status = getCPUAcceleratorStatus();

    expect(status).toHaveProperty('vdspAvailable');
    expect(status).toHaveProperty('blasAvailable');
    expect(status).toHaveProperty('neonAvailable');
    expect(status).toHaveProperty('amxAvailable');
    expect(status).toHaveProperty('smeAvailable');

    expect(typeof status.vdspAvailable).toBe('boolean');
    expect(typeof status.blasAvailable).toBe('boolean');
    expect(typeof status.neonAvailable).toBe('boolean');
    expect(typeof status.amxAvailable).toBe('boolean');
    expect(typeof status.smeAvailable).toBe('boolean');
  });

  it('should detect platform-specific features correctly', () => {
    const status = getCPUAcceleratorStatus();

    if (process.platform === 'darwin') {
      // macOS should have vDSP and BLAS
      expect(status.vdspAvailable).toBe(true);
      expect(status.blasAvailable).toBe(true);
    }

    if (process.arch === 'arm64') {
      // ARM64 should have NEON
      expect(status.neonAvailable).toBe(true);
    }

    if (process.platform === 'darwin' && process.arch === 'arm64') {
      // Apple Silicon should have AMX
      expect(status.amxAvailable).toBe(true);
    }
  });

  it('should report acceleration availability', () => {
    const available = isCPUAccelerationAvailable();
    expect(typeof available).toBe('boolean');

    // On most modern systems, at least one acceleration should be available
    if (process.platform === 'darwin' || process.arch === 'arm64') {
      expect(available).toBe(true);
    }
  });
});

describe('vDSP Operations', () => {
  const vdsp = createVDSPOperations();

  it('should report availability', () => {
    expect(typeof vdsp.isAvailable()).toBe('boolean');
  });

  it('should perform vector addition', () => {
    const a = new Float64Array([1, 2, 3, 4]);
    const b = new Float64Array([5, 6, 7, 8]);
    const result = vdsp.vectorAdd(a, b);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(6);
    expect(result[1]).toBe(8);
    expect(result[2]).toBe(10);
    expect(result[3]).toBe(12);
  });

  it('should perform vector multiplication', () => {
    const a = new Float64Array([1, 2, 3, 4]);
    const b = new Float64Array([2, 3, 4, 5]);
    const result = vdsp.vectorMul(a, b);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(2);
    expect(result[1]).toBe(6);
    expect(result[2]).toBe(12);
    expect(result[3]).toBe(20);
  });

  it('should perform vector subtraction', () => {
    const a = new Float64Array([10, 20, 30, 40]);
    const b = new Float64Array([1, 2, 3, 4]);
    const result = vdsp.vectorSub(a, b);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(9);
    expect(result[1]).toBe(18);
    expect(result[2]).toBe(27);
    expect(result[3]).toBe(36);
  });

  it('should perform vector scaling', () => {
    const a = new Float64Array([1, 2, 3, 4]);
    const result = vdsp.vectorScale(a, 2.5);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(2.5);
    expect(result[1]).toBe(5);
    expect(result[2]).toBe(7.5);
    expect(result[3]).toBe(10);
  });

  it('should perform vector multiply-add', () => {
    const a = new Float64Array([1, 2, 3, 4]);
    const b = new Float64Array([2, 2, 2, 2]);
    const c = new Float64Array([1, 1, 1, 1]);
    const result = vdsp.vectorMulAdd(a, b, c);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(3); // 1*2 + 1
    expect(result[1]).toBe(5); // 2*2 + 1
    expect(result[2]).toBe(7); // 3*2 + 1
    expect(result[3]).toBe(9); // 4*2 + 1
  });

  it('should perform NTT butterfly operation', () => {
    const inEven = new Float64Array([1, 2, 3, 4]);
    const inOdd = new Float64Array([1, 1, 1, 1]);
    const twiddle = new Float64Array([1, 2, 3, 4]);

    const { outEven, outOdd } = vdsp.nttButterfly(inEven, inOdd, twiddle);

    expect(outEven).toBeInstanceOf(Float64Array);
    expect(outOdd).toBeInstanceOf(Float64Array);
    expect(outEven.length).toBe(4);
    expect(outOdd.length).toBe(4);

    // outEven = inEven + twiddle * inOdd
    expect(outEven[0]).toBe(2); // 1 + 1*1
    expect(outEven[1]).toBe(4); // 2 + 2*1
    expect(outEven[2]).toBe(6); // 3 + 3*1
    expect(outEven[3]).toBe(8); // 4 + 4*1

    // outOdd = inEven - twiddle * inOdd
    expect(outOdd[0]).toBe(0); // 1 - 1*1
    expect(outOdd[1]).toBe(0); // 2 - 2*1
    expect(outOdd[2]).toBe(0); // 3 - 3*1
    expect(outOdd[3]).toBe(0); // 4 - 4*1
  });
});

describe('BLAS Operations', () => {
  const blas = createBLASOperations();

  it('should report availability', () => {
    expect(typeof blas.isAvailable()).toBe('boolean');
  });

  it('should report AMX acceleration status', () => {
    expect(typeof blas.isAMXAccelerated()).toBe('boolean');
  });

  it('should perform matrix multiplication', () => {
    // A = [[1, 2], [3, 4]] (2x2)
    // B = [[5, 6], [7, 8]] (2x2)
    // C = A * B = [[19, 22], [43, 50]]
    const a = new Float64Array([1, 2, 3, 4]);
    const b = new Float64Array([5, 6, 7, 8]);
    const result = blas.matrixMul(a, b, 2, 2, 2);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(19);
    expect(result[1]).toBe(22);
    expect(result[2]).toBe(43);
    expect(result[3]).toBe(50);
  });

  it('should perform matrix-vector multiplication', () => {
    // A = [[1, 2], [3, 4]] (2x2)
    // x = [1, 2]
    // y = A * x = [5, 11]
    const a = new Float64Array([1, 2, 3, 4]);
    const x = new Float64Array([1, 2]);
    const result = blas.matrixVectorMul(a, x, 2, 2);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(5); // 1*1 + 2*2
    expect(result[1]).toBe(11); // 3*1 + 4*2
  });

  it('should perform bucket accumulation', () => {
    const bucketIndices = new Uint32Array([0, 1, 0, 2, 1]);
    const pointCoords = new Float64Array([1, 2, 3, 4, 5]);
    const result = blas.bucketAccumulate(bucketIndices, pointCoords, 3, 1);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(3);
    expect(result[0]).toBe(4); // 1 + 3 (indices 0, 2)
    expect(result[1]).toBe(7); // 2 + 5 (indices 1, 4)
    expect(result[2]).toBe(4); // 4 (index 3)
  });
});

describe('NEON Operations', () => {
  const neon = createNEONOperations();

  it('should report availability', () => {
    expect(typeof neon.isAvailable()).toBe('boolean');
  });

  it('should perform Montgomery multiplication for 4-limb elements', () => {
    const a = new BigUint64Array([1n, 0n, 0n, 0n]);
    const b = new BigUint64Array([2n, 0n, 0n, 0n]);
    const result = neon.montgomeryMul4Limb(a, b, BN254_FIELD);

    expect(result).toBeInstanceOf(BigUint64Array);
    expect(result.length).toBe(4);
    // Result should be (1 * 2) mod p = 2
    expect(result[0]).toBe(2n);
  });

  it('should perform batch Montgomery multiplication', () => {
    const pairs: Array<[BigUint64Array, BigUint64Array]> = [
      [new BigUint64Array([1n, 0n, 0n, 0n]), new BigUint64Array([2n, 0n, 0n, 0n])],
      [new BigUint64Array([3n, 0n, 0n, 0n]), new BigUint64Array([4n, 0n, 0n, 0n])],
    ];

    const results = neon.batchMontgomeryMul(pairs, BN254_FIELD);

    expect(results.length).toBe(2);
    expect(results[0]![0]).toBe(2n); // 1 * 2
    expect(results[1]![0]).toBe(12n); // 3 * 4
  });
});

describe('SME Operations', () => {
  const sme = createSMEOperations();

  it('should report availability', () => {
    expect(typeof sme.isAvailable()).toBe('boolean');
  });

  it('should report experimental status', () => {
    expect(sme.isExperimental()).toBe(true);
  });

  it('should perform bucket outer product', () => {
    const scalars = new BigUint64Array([1n, 2n, 1n, 3n]);
    const points = new Float64Array([1, 2, 3, 4]);
    const { buckets, usedSME } = sme.bucketOuterProduct(scalars, points, 4, 2);

    expect(buckets).toBeInstanceOf(Float64Array);
    expect(buckets.length).toBe(4);
    expect(typeof usedSME).toBe('boolean');

    // Bucket 0 (scalar 1): points[0] + points[2] = 1 + 3 = 4
    expect(buckets[0]).toBe(4);
    // Bucket 1 (scalar 2): points[1] = 2
    expect(buckets[1]).toBe(2);
    // Bucket 2 (scalar 3): points[3] = 4
    expect(buckets[2]).toBe(4);
  });

  it('should perform matrix accumulation', () => {
    const a = new Float64Array([1, 2, 3, 4]);
    const b = new Float64Array([5, 6, 7, 8]);
    const { result, usedSME } = sme.matrixAccumulate(a, b, 2, 2, 2);

    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(4);
    expect(typeof usedSME).toBe('boolean');

    // Same as BLAS matrix multiplication
    expect(result[0]).toBe(19);
    expect(result[1]).toBe(22);
    expect(result[2]).toBe(43);
    expect(result[3]).toBe(50);
  });
});
