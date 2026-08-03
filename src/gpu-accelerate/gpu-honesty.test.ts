/**
 * Tests for GPU acceleration reporting
 *
 * These cover the contract that no function reports acceleration it did not
 * perform. Before this, `msmGPU` returned the identity point and the three
 * NTT entry points returned their own input, all with `usedGPU: true`; on a
 * machine with a working Metal device and a loadable addon, a caller received
 * a wrong answer with no indication anything was amiss.
 *
 * The assertions here hold whether or not Metal is available, which matters:
 * on a machine without the addon these paths reject with METAL_UNAVAILABLE,
 * and on a machine with it they reject with NOT_IMPLEMENTED. Neither may
 * resolve, and no fallback may claim `usedGPU: true`.
 */

import { describe, it, expect } from 'vitest';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import type { CurvePoint, FieldElement } from '../types.js';
import { BN254_CURVE } from '../curve/config.js';
import { BN254_SCALAR_FIELD } from '../field/config.js';
import { createFieldElement } from '../field/element.js';
import { createNTTConfig } from '../ntt/config.js';
import { forwardNttRadix2 } from '../ntt/radix2.js';
import { getIdentityPoint } from '../curve/config.js';
import { curvePointsEqual } from '../curve/point.js';
import {
  msmGPU,
  msmGPUWithFallback,
  isGPUMSMAvailable,
} from './msm-gpu.js';
import {
  forwardNttGPU,
  inverseNttGPU,
  batchNttGPU,
  forwardNttGPUWithFallback,
} from './ntt-gpu.js';
import { pippengerMsm } from '../msm/pippenger.js';
import { scalarMul } from '../curve/operations.js';

const field = BN254_SCALAR_FIELD;

/** A small, non-trivial MSM input whose correct answer is not the identity. */
function msmInput(): { scalars: bigint[]; points: CurvePoint[] } {
  const g = BN254_CURVE.generator;
  return {
    scalars: [3n, 5n, 7n, 11n],
    points: [1n, 2n, 3n, 4n].map((k) => scalarMul(k, g, BN254_CURVE)),
  };
}

function polynomial(n: number): FieldElement[] {
  return Array.from({ length: n }, (_, i) => createFieldElement(BigInt(i * 7 + 1), field));
}

describe('GPU MSM never reports work it did not do', () => {
  it('should reject rather than return a point it did not compute', async () => {
    const { scalars, points } = msmInput();

    await expect(msmGPU(scalars, points, BN254_CURVE)).rejects.toThrow(ZkAccelerateError);
  });

  it('should reject with a code that says why', async () => {
    const { scalars, points } = msmInput();

    const error = await msmGPU(scalars, points, BN254_CURVE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZkAccelerateError);
    // Either the device is missing, or the kernel is not bound. Never success.
    expect([ErrorCode.METAL_UNAVAILABLE, ErrorCode.NOT_IMPLEMENTED]).toContain(
      (error as ZkAccelerateError).code
    );
  });

  it('should not return the identity point for a non-trivial MSM', async () => {
    // The specific regression: msmGPU used to resolve with the identity for
    // every input. Assert it does not resolve at all.
    const { scalars, points } = msmInput();
    const identity = getIdentityPoint(BN254_CURVE);

    const result = await msmGPU(scalars, points, BN254_CURVE).then(
      (r) => r,
      () => null
    );

    if (result !== null) {
      expect(curvePointsEqual(result.point, identity, BN254_CURVE)).toBe(false);
    }
    expect(result).toBeNull();
  });

  it('should fall through to the CPU and report usedGPU false', async () => {
    const { scalars, points } = msmInput();
    const expected = pippengerMsm(scalars, points, BN254_CURVE);

    const result = await msmGPUWithFallback(scalars, points, BN254_CURVE, () =>
      pippengerMsm(scalars, points, BN254_CURVE)
    );

    expect(result.usedGPU).toBe(false);
    expect(curvePointsEqual(result.point, expected, BN254_CURVE)).toBe(true);
  });

  it('should report usedGPU false from the fallback whether or not Metal is present', async () => {
    // isGPUMSMAvailable may be true (Metal device present) or false. Either
    // way the fallback must not claim the GPU ran, because it did not.
    const available = isGPUMSMAvailable();
    const { scalars, points } = msmInput();

    const result = await msmGPUWithFallback(scalars, points, BN254_CURVE, () =>
      pippengerMsm(scalars, points, BN254_CURVE)
    );

    expect(typeof available).toBe('boolean');
    expect(result.usedGPU).toBe(false);
  });
});

describe('GPU NTT never reports work it did not do', () => {
  it('should reject from forwardNttGPU rather than return the input unchanged', async () => {
    const config = createNTTConfig(8, field);
    const coefficients = polynomial(8);

    await expect(forwardNttGPU(coefficients, config.twiddles)).rejects.toThrow(
      ZkAccelerateError
    );
  });

  it('should reject from inverseNttGPU', async () => {
    const config = createNTTConfig(8, field);
    const values = polynomial(8);

    await expect(
      inverseNttGPU(values, config.twiddlesInv, config.nInv)
    ).rejects.toThrow(ZkAccelerateError);
  });

  it('should reject from batchNttGPU', async () => {
    const config = createNTTConfig(8, field);

    await expect(
      batchNttGPU([polynomial(8), polynomial(8)], config.twiddles, true)
    ).rejects.toThrow(ZkAccelerateError);
  });

  it('should never resolve with untransformed input for a non-empty batch', async () => {
    const config = createNTTConfig(8, field);
    const polys = [polynomial(8), polynomial(8)];

    const result = await batchNttGPU(polys, config.twiddles, true).then(
      (r) => r,
      () => null
    );

    // The old implementation resolved with `polynomials.map(poly => ...)`,
    // handing every input straight back with usedGPU: true.
    expect(result).toBeNull();
  });

  it('should fall through to the CPU and report usedGPU false with a real transform', async () => {
    const config = createNTTConfig(8, field);
    const coefficients = polynomial(8);
    const expected = forwardNttRadix2(coefficients, config);

    const result = await forwardNttGPUWithFallback(coefficients, config.twiddles, () =>
      forwardNttRadix2(coefficients, config)
    );

    expect(result.usedGPU).toBe(false);
    // The old GPU path returned `coefficients` verbatim. A real transform of
    // this input does not equal its input, so this also pins that down.
    expect(result.values).toHaveLength(8);
    for (let i = 0; i < expected.length; i++) {
      expect(result.values[i]!.limbs).toEqual(expected[i]!.limbs);
    }
    expect(result.values.map((v) => v.limbs[0])).not.toEqual(
      coefficients.map((c) => c.limbs[0])
    );
  });
});
