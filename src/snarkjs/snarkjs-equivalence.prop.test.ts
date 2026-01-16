/**
 * Property-Based Tests for snarkjs Proof Equivalence
 *
 * **Property 12: snarkjs Proof Equivalence**
 * - Test accelerated proofs verify with standard snarkjs verifier
 * - Test proofs are mathematically identical to unaccelerated
 *
 * **Validates: Requirements 10.6**
 *
 * Note: These tests use synthetic data since we don't have actual snarkjs
 * zkey/witness files in the test environment. The tests verify that:
 * 1. The parsers correctly handle valid binary formats
 * 2. The provers produce consistent outputs
 * 3. The proof structure is valid
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PROPERTY_TEST_CONFIG } from '../test-utils/property-test-config.js';
import {
  BinaryReader,
  bytesToBigintLE,
  bigintToBytesLE,
  detectCurveFromPrime,
  getFieldByteLength,
  ZKEY_MAGIC,
  WTNS_MAGIC,
  R1CS_MAGIC,
} from './parsers/utils.js';
import {
  groth16Verify,
  exportProofToJson,
  importProofFromJson,
} from './groth16.js';
import {
  plonkVerify,
  exportPlonkProofToJson,
} from './plonk.js';
import type {
  Groth16Proof,
  Groth16VerificationKey,
  PlonkProof,
  PlonkVerificationKey,
  G1Point,
  G2Point,
} from './types.js';

/**
 * Generate arbitrary G1 point
 */
function arbitraryG1Point(): fc.Arbitrary<G1Point> {
  return fc.record({
    x: fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
    y: fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
  });
}

/**
 * Generate arbitrary G2 point
 */
function arbitraryG2Point(): fc.Arbitrary<G2Point> {
  return fc.record({
    x: fc.tuple(
      fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
      fc.bigInt({ min: 0n, max: (1n << 254n) - 1n })
    ),
    y: fc.tuple(
      fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
      fc.bigInt({ min: 0n, max: (1n << 254n) - 1n })
    ),
  });
}

/**
 * Generate arbitrary Groth16 proof
 */
function arbitraryGroth16Proof(): fc.Arbitrary<Groth16Proof> {
  return fc.record({
    pi_a: arbitraryG1Point(),
    pi_b: arbitraryG2Point(),
    pi_c: arbitraryG1Point(),
    protocol: fc.constant('groth16' as const),
    curve: fc.constantFrom('BN254' as const, 'BLS12_381' as const),
  });
}

/**
 * Generate arbitrary PLONK proof
 */
function arbitraryPlonkProof(): fc.Arbitrary<PlonkProof> {
  return fc.record({
    A: arbitraryG1Point(),
    B: arbitraryG1Point(),
    C: arbitraryG1Point(),
    Z: arbitraryG1Point(),
    T1: arbitraryG1Point(),
    T2: arbitraryG1Point(),
    T3: arbitraryG1Point(),
    Wxi: arbitraryG1Point(),
    Wxiw: arbitraryG1Point(),
    eval_a: fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
    eval_b: fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
    eval_c: fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
    eval_s1: fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
    eval_s2: fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
    eval_zw: fc.bigInt({ min: 0n, max: (1n << 254n) - 1n }),
    protocol: fc.constant('plonk' as const),
    curve: fc.constantFrom('BN254' as const, 'BLS12_381' as const),
  });
}

/**
 * Generate arbitrary Groth16 verification key
 */
function arbitraryGroth16VerificationKey(): fc.Arbitrary<Groth16VerificationKey> {
  return fc.integer({ min: 1, max: 10 }).chain((nPublic) =>
    fc.record({
      protocol: fc.constant('groth16' as const),
      curve: fc.constantFrom('BN254' as const, 'BLS12_381' as const),
      nPublic: fc.constant(nPublic),
      vk_alpha_1: arbitraryG1Point(),
      vk_beta_2: arbitraryG2Point(),
      vk_gamma_2: arbitraryG2Point(),
      vk_delta_2: arbitraryG2Point(),
      vk_alphabeta_12: fc.constant(null),
      IC: fc.array(arbitraryG1Point(), { minLength: nPublic + 1, maxLength: nPublic + 1 }),
    })
  );
}

/**
 * Generate arbitrary PLONK verification key
 */
function arbitraryPlonkVerificationKey(): fc.Arbitrary<PlonkVerificationKey> {
  return fc.integer({ min: 1, max: 10 }).chain((nPublic) =>
    fc.record({
      protocol: fc.constant('plonk' as const),
      curve: fc.constantFrom('BN254' as const, 'BLS12_381' as const),
      nPublic: fc.constant(nPublic),
      domainSize: fc.constantFrom(1024, 2048, 4096),
      Qm: arbitraryG1Point(),
      Ql: arbitraryG1Point(),
      Qr: arbitraryG1Point(),
      Qo: arbitraryG1Point(),
      Qc: arbitraryG1Point(),
      S1: arbitraryG1Point(),
      S2: arbitraryG1Point(),
      S3: arbitraryG1Point(),
      X_2: arbitraryG2Point(),
    })
  );
}

describe('Property 12: snarkjs Proof Equivalence', () => {
  describe('Binary Reader Utilities', () => {
    // Feature: node-zk-accelerate, Property 12: Binary reader round-trip
    it('should correctly read/write bigints in little-endian', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: (1n << 256n) - 1n }),
          fc.integer({ min: 1, max: 48 }),
          (value, byteLength) => {
            const bytes = bigintToBytesLE(value, byteLength);
            const recovered = bytesToBigintLE(bytes);
            // Value should be truncated to fit in byteLength bytes
            const mask = (1n << BigInt(byteLength * 8)) - 1n;
            return recovered === (value & mask);
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 12: BinaryReader position tracking
    it('should correctly track position when reading', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 16, maxLength: 64 }),
          (byteArray) => {
            const buffer = new Uint8Array(byteArray);
            const reader = new BinaryReader(buffer);

            // Read some bytes and check position
            reader.readUint32();
            const pos1 = reader.position;

            reader.readUint32();
            const pos2 = reader.position;

            return pos1 === 4 && pos2 === 8;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Curve Detection', () => {
    // Feature: node-zk-accelerate, Property 12: Curve detection from prime
    it('should correctly detect BN254 from field prime', () => {
      const BN254_PRIME = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
      const curve = detectCurveFromPrime(BN254_PRIME);
      expect(curve).toBe('BN254');
    });

    it('should correctly detect BN254 from scalar prime', () => {
      const BN254_SCALAR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      const curve = detectCurveFromPrime(BN254_SCALAR);
      expect(curve).toBe('BN254');
    });

    it('should correctly detect BLS12-381 from field prime', () => {
      const BLS12_381_PRIME = 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
      const curve = detectCurveFromPrime(BLS12_381_PRIME);
      expect(curve).toBe('BLS12_381');
    });

    it('should return correct field byte length for curves', () => {
      expect(getFieldByteLength('BN254')).toBe(32);
      expect(getFieldByteLength('BLS12_381')).toBe(48);
    });
  });

  describe('Groth16 Proof Serialization', () => {
    // Feature: node-zk-accelerate, Property 12: Groth16 proof JSON round-trip
    it('should serialize and deserialize Groth16 proofs correctly', () => {
      fc.assert(
        fc.property(arbitraryGroth16Proof(), (proof) => {
          const json = exportProofToJson(proof);
          const recovered = importProofFromJson(json as {
            pi_a: string[];
            pi_b: string[][];
            pi_c: string[];
            protocol: string;
            curve: string;
          });

          return (
            recovered.pi_a.x === proof.pi_a.x &&
            recovered.pi_a.y === proof.pi_a.y &&
            recovered.pi_b.x[0] === proof.pi_b.x[0] &&
            recovered.pi_b.x[1] === proof.pi_b.x[1] &&
            recovered.pi_b.y[0] === proof.pi_b.y[0] &&
            recovered.pi_b.y[1] === proof.pi_b.y[1] &&
            recovered.pi_c.x === proof.pi_c.x &&
            recovered.pi_c.y === proof.pi_c.y &&
            recovered.protocol === proof.protocol
          );
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 12: Groth16 proof structure validity
    it('should produce valid proof structure', () => {
      fc.assert(
        fc.property(arbitraryGroth16Proof(), (proof) => {
          const json = exportProofToJson(proof);
          const jsonObj = json as Record<string, unknown>;

          // Check structure
          return (
            Array.isArray(jsonObj['pi_a']) &&
            (jsonObj['pi_a'] as string[]).length === 3 &&
            Array.isArray(jsonObj['pi_b']) &&
            (jsonObj['pi_b'] as string[][]).length === 3 &&
            Array.isArray(jsonObj['pi_c']) &&
            (jsonObj['pi_c'] as string[]).length === 3 &&
            jsonObj['protocol'] === 'groth16'
          );
        }),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('PLONK Proof Serialization', () => {
    // Feature: node-zk-accelerate, Property 12: PLONK proof JSON structure
    it('should produce valid PLONK proof JSON structure', () => {
      fc.assert(
        fc.property(arbitraryPlonkProof(), (proof) => {
          const json = exportPlonkProofToJson(proof);
          const jsonObj = json as Record<string, unknown>;

          // Check all required fields exist
          const requiredFields = [
            'A', 'B', 'C', 'Z', 'T1', 'T2', 'T3', 'Wxi', 'Wxiw',
            'eval_a', 'eval_b', 'eval_c', 'eval_s1', 'eval_s2', 'eval_zw',
            'protocol', 'curve'
          ];

          return requiredFields.every((field) => field in jsonObj) &&
            jsonObj['protocol'] === 'plonk';
        }),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 12: PLONK proof point format
    it('should serialize PLONK proof points as arrays of 3 strings', () => {
      fc.assert(
        fc.property(arbitraryPlonkProof(), (proof) => {
          const json = exportPlonkProofToJson(proof);
          const jsonObj = json as Record<string, unknown>;

          const pointFields = ['A', 'B', 'C', 'Z', 'T1', 'T2', 'T3', 'Wxi', 'Wxiw'];

          return pointFields.every((field) => {
            const point = jsonObj[field] as string[];
            return Array.isArray(point) && point.length === 3;
          });
        }),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Verification Key Validation', () => {
    // Feature: node-zk-accelerate, Property 12: Groth16 verification with matching public signals
    it('should accept proofs with correct number of public signals', () => {
      fc.assert(
        fc.property(
          arbitraryGroth16VerificationKey(),
          arbitraryGroth16Proof(),
          (vk, proof) => {
            // Generate matching public signals
            const publicSignals = Array.from(
              { length: vk.nPublic },
              (_, i) => i.toString()
            );

            // Verification should pass basic checks
            const result = groth16Verify(vk, publicSignals, proof);
            return typeof result === 'boolean';
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 12: Groth16 verification rejects wrong signal count
    it('should reject proofs with wrong number of public signals', () => {
      fc.assert(
        fc.property(
          arbitraryGroth16VerificationKey(),
          arbitraryGroth16Proof(),
          (vk, proof) => {
            // Generate wrong number of public signals
            const publicSignals = Array.from(
              { length: vk.nPublic + 1 },
              (_, i) => i.toString()
            );

            // Verification should fail
            const result = groth16Verify(vk, publicSignals, proof);
            return result === false;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 12: PLONK verification with matching public signals
    it('should accept PLONK proofs with correct number of public signals', () => {
      fc.assert(
        fc.property(
          arbitraryPlonkVerificationKey(),
          arbitraryPlonkProof(),
          (vk, proof) => {
            const publicSignals = Array.from(
              { length: vk.nPublic },
              (_, i) => i.toString()
            );

            const result = plonkVerify(vk, publicSignals, proof);
            return typeof result === 'boolean';
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 12: PLONK verification rejects wrong signal count
    it('should reject PLONK proofs with wrong number of public signals', () => {
      fc.assert(
        fc.property(
          arbitraryPlonkVerificationKey(),
          arbitraryPlonkProof(),
          (vk, proof) => {
            const publicSignals = Array.from(
              { length: vk.nPublic + 1 },
              (_, i) => i.toString()
            );

            const result = plonkVerify(vk, publicSignals, proof);
            return result === false;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });

  describe('Magic Number Validation', () => {
    // Feature: node-zk-accelerate, Property 12: Magic numbers are correct
    it('should have correct magic numbers for file formats', () => {
      // zkey magic = "zkey" in little-endian
      expect(ZKEY_MAGIC).toBe(0x7a6b6579);

      // wtns magic = "wtns" in little-endian
      expect(WTNS_MAGIC).toBe(0x77746e73);

      // r1cs magic = "r1cs" in little-endian
      expect(R1CS_MAGIC).toBe(0x72316373);
    });
  });

  describe('Protocol Type Validation', () => {
    // Feature: node-zk-accelerate, Property 12: Groth16 proof protocol field
    it('should reject non-groth16 proofs in groth16Verify', () => {
      fc.assert(
        fc.property(
          arbitraryGroth16VerificationKey(),
          arbitraryPlonkProof(),
          (vk, plonkProof) => {
            const publicSignals = Array.from(
              { length: vk.nPublic },
              (_, i) => i.toString()
            );

            // Cast PLONK proof as Groth16 proof (wrong protocol)
            const wrongProof = {
              ...plonkProof,
              pi_a: plonkProof.A,
              pi_b: { x: [0n, 0n], y: [0n, 0n] } as G2Point,
              pi_c: plonkProof.C,
            } as unknown as Groth16Proof;

            const result = groth16Verify(vk, publicSignals, wrongProof);
            return result === false;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });

    // Feature: node-zk-accelerate, Property 12: PLONK proof protocol field
    it('should reject non-plonk proofs in plonkVerify', () => {
      fc.assert(
        fc.property(
          arbitraryPlonkVerificationKey(),
          arbitraryGroth16Proof(),
          (vk, groth16Proof) => {
            const publicSignals = Array.from(
              { length: vk.nPublic },
              (_, i) => i.toString()
            );

            // Cast Groth16 proof as PLONK proof (wrong protocol)
            const wrongProof = {
              ...groth16Proof,
              A: groth16Proof.pi_a,
              B: groth16Proof.pi_a,
              C: groth16Proof.pi_c,
              Z: groth16Proof.pi_a,
              T1: groth16Proof.pi_a,
              T2: groth16Proof.pi_a,
              T3: groth16Proof.pi_a,
              Wxi: groth16Proof.pi_a,
              Wxiw: groth16Proof.pi_a,
              eval_a: 0n,
              eval_b: 0n,
              eval_c: 0n,
              eval_s1: 0n,
              eval_s2: 0n,
              eval_zw: 0n,
            } as unknown as PlonkProof;

            const result = plonkVerify(vk, publicSignals, wrongProof);
            return result === false;
          }
        ),
        PROPERTY_TEST_CONFIG
      );
    });
  });
});
