/**
 * snarkjs Integration Types
 *
 * Type definitions for snarkjs file formats and data structures.
 *
 * Requirements: 10.4
 */

import type { CurveName } from '../types.js';

/**
 * Supported protocol types
 */
export type ProtocolType = 'groth16' | 'plonk' | 'fflonk';

/**
 * Parsed zkey file header
 */
export interface ZkeyHeader {
  /** Protocol type (groth16, plonk, fflonk) */
  protocol: ProtocolType;
  /** Curve name */
  curve: CurveName;
  /** Number of public inputs */
  nPublic: number;
  /** Domain size (power of 2) */
  domainSize: number;
  /** Number of constraints */
  nConstraints: number;
  /** Number of variables */
  nVars: number;
}

/**
 * G1 point in affine coordinates (serialized format)
 */
export interface G1Point {
  x: bigint;
  y: bigint;
}

/**
 * G2 point in affine coordinates (serialized format)
 */
export interface G2Point {
  x: [bigint, bigint]; // Fp2 element
  y: [bigint, bigint]; // Fp2 element
}

/**
 * Groth16 verification key
 */
export interface Groth16VerificationKey {
  protocol: 'groth16';
  curve: CurveName;
  nPublic: number;
  vk_alpha_1: G1Point;
  vk_beta_2: G2Point;
  vk_gamma_2: G2Point;
  vk_delta_2: G2Point;
  vk_alphabeta_12: unknown; // Pairing result
  IC: G1Point[]; // Public input commitments
}

/**
 * Groth16 proving key data
 */
export interface Groth16ProvingKey {
  protocol: 'groth16';
  curve: CurveName;
  nVars: number;
  nPublic: number;
  domainSize: number;
  /** A polynomials evaluated at tau */
  A: G1Point[];
  /** B polynomials evaluated at tau (G1) */
  B1: G1Point[];
  /** B polynomials evaluated at tau (G2) */
  B2: G2Point[];
  /** C polynomials evaluated at tau */
  C: G1Point[];
  /** H polynomials for quotient */
  H: G1Point[];
}

/**
 * PLONK verification key
 */
export interface PlonkVerificationKey {
  protocol: 'plonk';
  curve: CurveName;
  nPublic: number;
  domainSize: number;
  /** Selector commitments */
  Qm: G1Point;
  Ql: G1Point;
  Qr: G1Point;
  Qo: G1Point;
  Qc: G1Point;
  /** Permutation commitments */
  S1: G1Point;
  S2: G1Point;
  S3: G1Point;
  /** Generator point */
  X_2: G2Point;
}

/**
 * PLONK proving key data
 */
export interface PlonkProvingKey {
  protocol: 'plonk';
  curve: CurveName;
  nVars: number;
  nPublic: number;
  domainSize: number;
  /** Selector polynomials */
  Qm: bigint[];
  Ql: bigint[];
  Qr: bigint[];
  Qo: bigint[];
  Qc: bigint[];
  /** Permutation polynomials */
  S1: bigint[];
  S2: bigint[];
  S3: bigint[];
  /** Lagrange basis SRS */
  lagrangeBasis: G1Point[];
}

/**
 * Parsed zkey data (union of Groth16 and PLONK)
 */
export interface ZkeyData {
  header: ZkeyHeader;
  provingKey: Groth16ProvingKey | PlonkProvingKey;
  verificationKey: Groth16VerificationKey | PlonkVerificationKey;
}

/**
 * Parsed witness file data
 */
export interface WitnessData {
  /** Curve name */
  curve: CurveName;
  /** Number of witness values */
  nWitness: number;
  /** Witness values as field elements */
  witness: bigint[];
}

/**
 * R1CS constraint: A * B = C
 * Each constraint is represented as sparse vectors
 */
export interface R1CSConstraint {
  /** A coefficients: Map from variable index to coefficient */
  A: Map<number, bigint>;
  /** B coefficients: Map from variable index to coefficient */
  B: Map<number, bigint>;
  /** C coefficients: Map from variable index to coefficient */
  C: Map<number, bigint>;
}

/**
 * Parsed R1CS file data
 */
export interface R1CSData {
  /** Curve name */
  curve: CurveName;
  /** Field prime */
  prime: bigint;
  /** Number of wires (variables) */
  nWires: number;
  /** Number of public outputs */
  nPubOut: number;
  /** Number of public inputs */
  nPubIn: number;
  /** Number of private inputs */
  nPrvIn: number;
  /** Number of labels */
  nLabels: number;
  /** Number of constraints */
  nConstraints: number;
  /** Constraints */
  constraints: R1CSConstraint[];
  /** Wire to label mapping */
  wireToLabel?: Map<number, bigint>;
}

/**
 * Groth16 proof structure
 */
export interface Groth16Proof {
  pi_a: G1Point;
  pi_b: G2Point;
  pi_c: G1Point;
  protocol: 'groth16';
  curve: CurveName;
}

/**
 * PLONK proof structure
 */
export interface PlonkProof {
  /** Wire commitments */
  A: G1Point;
  B: G1Point;
  C: G1Point;
  /** Permutation commitment */
  Z: G1Point;
  /** Quotient commitments */
  T1: G1Point;
  T2: G1Point;
  T3: G1Point;
  /** Opening proof */
  Wxi: G1Point;
  Wxiw: G1Point;
  /** Evaluations */
  eval_a: bigint;
  eval_b: bigint;
  eval_c: bigint;
  eval_s1: bigint;
  eval_s2: bigint;
  eval_zw: bigint;
  protocol: 'plonk';
  curve: CurveName;
}

/**
 * Proof result from accelerated prover
 */
export interface ProofResult {
  proof: Groth16Proof | PlonkProof;
  publicSignals: string[];
}
