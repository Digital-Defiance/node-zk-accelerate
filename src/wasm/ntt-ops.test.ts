/**
 * Tests for the WASM-fallback NTT root of unity
 *
 * `computeRootOfUnity` hardcodes the generator 5 and used to apply no checks at
 * all. Two things could go wrong silently:
 *
 *  - If n does not divide p-1, `(p-1)/n` is a BigInt floor division and
 *    `5^((p-1)/n)` is not an n-th root of unity. The transform then ran to
 *    completion on unrelated twiddle factors and returned nonsense.
 *  - If 5 is a quadratic residue in the field, the value has order dividing
 *    n/2, the twiddles repeat, and the transform is not invertible.
 *
 * 5 happens to be correct for both supported scalar fields, so these paths were
 * unreachable for supported inputs -- but nothing restricted callers to those
 * fields, and an unchecked constant is not a verified one.
 */

import { describe, it, expect } from 'vitest';
import type { FieldConfig } from '../types.js';
import { BN254_SCALAR_FIELD, BLS12_381_SCALAR_FIELD } from '../field/config.js';
import { wasmForwardNtt, wasmInverseNtt } from './ntt-ops.js';
import { createFieldElementFromBigint, getFieldValue } from './field-ops.js';

/**
 * Build a field config for an arbitrary prime, reusing the shape of a supported
 * one. Only `modulus` matters to computeRootOfUnity.
 */
function fieldWithModulus(modulus: bigint): FieldConfig {
  return { ...BN254_SCALAR_FIELD, modulus } as FieldConfig;
}

describe('WASM NTT root of unity verification', () => {
  it('should transform correctly for supported fields', () => {
    for (const field of [BN254_SCALAR_FIELD, BLS12_381_SCALAR_FIELD]) {
      const coefficients = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n].map((v) =>
        createFieldElementFromBigint(v, field)
      );

      const transformed = wasmForwardNtt(coefficients, field);
      const recovered = wasmInverseNtt(transformed, field);

      expect(recovered.map((e) => getFieldValue(e))).toEqual([
        1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n,
      ]);
    }
  });

  it('should throw when n does not divide p-1', () => {
    // p = 11, p-1 = 10. 10 % 4 !== 0, so no primitive 4th root of unity
    // exists. Previously (p-1)/n floored to 2 and 5^2 mod 11 = 3 was used as
    // though it were a 4th root of unity; 3^4 mod 11 = 4, not 1.
    const field = fieldWithModulus(11n);
    const coefficients = [1n, 2n, 3n, 4n].map((v) =>
      createFieldElementFromBigint(v, field)
    );

    expect(() => wasmForwardNtt(coefficients, field)).toThrow(/does not divide p-1/);
    expect(() => wasmInverseNtt(coefficients, field)).toThrow(/does not divide p-1/);
  });

  it('should throw when the generator does not produce a primitive root', () => {
    // p = 41, p-1 = 40, and 4 divides 40 so check 1 passes. But 5 is a
    // quadratic residue mod 41 (5^20 = 1), so omega = 5^10 = 40 = -1, whose
    // order is 2, not 4. omega^4 = 1 so check 2 also passes; it is check 3,
    // omega^(n/2) = omega^2 = 1, that catches it. Without check 3 the twiddle
    // table would be [1, -1, 1, -1] and the transform would not be invertible.
    const field = fieldWithModulus(41n);
    const coefficients = [1n, 2n, 3n, 4n].map((v) =>
      createFieldElementFromBigint(v, field)
    );

    expect(() => wasmForwardNtt(coefficients, field)).toThrow(/not primitive/);
  });

  it('should reject non-power-of-two lengths before anything else', () => {
    const field = BN254_SCALAR_FIELD;
    const coefficients = [1n, 2n, 3n].map((v) => createFieldElementFromBigint(v, field));

    expect(() => wasmForwardNtt(coefficients, field)).toThrow(/power of two/);
  });
});
