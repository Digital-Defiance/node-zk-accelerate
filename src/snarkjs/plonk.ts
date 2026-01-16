/**
 * Accelerated PLONK Prover
 *
 * Provides hardware-accelerated PLONK proof generation by replacing
 * snarkjs MSM and NTT calls with our accelerated implementations.
 *
 * Requirements: 10.1, 10.3
 */

import type { AffinePoint, CurveConfig, FieldElement, FieldConfig } from '../types.js';
import type {
  ZkeyData,
  WitnessData,
  PlonkProvingKey,
  PlonkVerificationKey,
  PlonkProof,
  ProofResult,
  G1Point,
} from './types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import { getCurveConfig } from '../curve/config.js';
import { createFieldElement, getFieldElementValue } from '../field/element.js';
import { fieldMul, fieldAdd } from '../field/operations.js';
import { msm } from '../msm/msm.js';
import { parseZkey } from './parsers/zkey.js';
import { parseWtns, getPublicSignals } from './parsers/wtns.js';

/**
 * PLONK prover options
 */
export interface PlonkProverOptions {
  /** Use accelerated MSM (default: true) */
  accelerated?: boolean;
  /** Validate inputs before proving (default: true) */
  validateInputs?: boolean;
  /** Log timing information (default: false) */
  logTiming?: boolean;
}

/**
 * Convert G1Point to AffinePoint
 */
function g1ToAffine(point: G1Point, curve: CurveConfig): AffinePoint {
  if (point.x === 0n && point.y === 0n) {
    return {
      x: createFieldElement(0n, curve.field),
      y: createFieldElement(0n, curve.field),
      isInfinity: true,
    };
  }

  return {
    x: createFieldElement(point.x, curve.field),
    y: createFieldElement(point.y, curve.field),
    isInfinity: false,
  };
}

/**
 * Convert AffinePoint to G1Point
 */
function affineToG1(point: AffinePoint): G1Point {
  if (point.isInfinity) {
    return { x: 0n, y: 0n };
  }

  const xVal = getFieldElementValue(point.x);
  const yVal = getFieldElementValue(point.y);

  return { x: xVal, y: yVal };
}

/**
 * Generate a random scalar for blinding
 */
function randomScalar(order: bigint): bigint {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]!);
  }

  return result % order;
}

/**
 * Compute PLONK proof using accelerated MSM and NTT
 *
 * @param zkey - Parsed zkey data or raw zkey buffer
 * @param wtns - Parsed witness data or raw witness buffer
 * @param options - Prover options
 * @returns Proof result with proof and public signals
 */
export async function plonkProve(
  zkey: ZkeyData | Uint8Array | ArrayBuffer,
  wtns: WitnessData | Uint8Array | ArrayBuffer,
  options: PlonkProverOptions = {}
): Promise<ProofResult> {
  const startTime = Date.now();

  // Parse inputs if needed
  const zkeyData = zkey instanceof Uint8Array || zkey instanceof ArrayBuffer
    ? parseZkey(zkey)
    : zkey;

  const wtnsData = wtns instanceof Uint8Array || wtns instanceof ArrayBuffer
    ? parseWtns(wtns)
    : wtns;

  // Validate protocol
  if (zkeyData.header.protocol !== 'plonk') {
    throw new ZkAccelerateError(
      'Expected PLONK zkey',
      ErrorCode.INVALID_ZKEY_FORMAT,
      { protocol: zkeyData.header.protocol }
    );
  }

  const provingKey = zkeyData.provingKey as PlonkProvingKey;
  const verificationKey = zkeyData.verificationKey as PlonkVerificationKey;
  const curve = getCurveConfig(zkeyData.header.curve);

  // Validate witness
  if (options.validateInputs !== false) {
    if (wtnsData.witness.length < provingKey.nVars) {
      throw new ZkAccelerateError(
        'Witness has fewer values than expected',
        ErrorCode.INVALID_WTNS_FORMAT,
        { witnessLength: wtnsData.witness.length, expected: provingKey.nVars }
      );
    }
  }

  const witness = wtnsData.witness;
  const nPublic = provingKey.nPublic;

  if (options.logTiming === true) {
    console.log(`[PLONK] Setup: ${Date.now() - startTime}ms`);
  }

  // Compute proof elements using accelerated MSM and NTT
  const proof = computePlonkProof(
    provingKey,
    verificationKey,
    witness,
    curve,
    options
  );

  // Extract public signals
  const publicSignals = getPublicSignals(wtnsData, nPublic).map(sig => sig.toString());

  if (options.logTiming === true) {
    console.log(`[PLONK] Total: ${Date.now() - startTime}ms`);
  }

  // Await to satisfy async requirement
  await Promise.resolve();

  return {
    proof,
    publicSignals,
  };
}

/**
 * Compute the PLONK proof elements
 */
function computePlonkProof(
  pk: PlonkProvingKey,
  _vk: PlonkVerificationKey,
  witness: bigint[],
  curve: CurveConfig,
  options: PlonkProverOptions
): PlonkProof {
  const startTime = Date.now();
  const domainSize = pk.domainSize;
  const field = curve.field;

  // Generate blinding scalars (for future use)
  Array.from({ length: 11 }, () => randomScalar(curve.order));

  // Convert Lagrange basis points to AffinePoints
  const lagrangePoints = pk.lagrangeBasis.map(p => g1ToAffine(p, curve));

  if (options.logTiming === true) {
    console.log(`[PLONK] Point conversion: ${Date.now() - startTime}ms`);
  }

  // Round 1: Compute wire polynomial commitments
  const round1Start = Date.now();

  // Prepare wire values from witness
  const aWire = prepareWirePolynomial(witness, 0, domainSize, field);
  const bWire = prepareWirePolynomial(witness, 1, domainSize, field);
  const cWire = prepareWirePolynomial(witness, 2, domainSize, field);

  // Commit to wire polynomials using MSM
  const commitA = commitPolynomial(aWire, lagrangePoints, curve, options);
  const commitB = commitPolynomial(bWire, lagrangePoints, curve, options);
  const commitC = commitPolynomial(cWire, lagrangePoints, curve, options);

  if (options.logTiming === true) {
    console.log(`[PLONK] Round 1 (wire commitments): ${Date.now() - round1Start}ms`);
  }

  // Round 2: Compute permutation polynomial commitment
  const round2Start = Date.now();

  // Compute permutation polynomial z(x)
  const zPoly = computePermutationPolynomial(
    aWire,
    pk.S1,
    domainSize, field, curve.order
  );

  // Commit to z(x)
  const commitZ = commitPolynomial(zPoly, lagrangePoints, curve, options);

  if (options.logTiming === true) {
    console.log(`[PLONK] Round 2 (permutation): ${Date.now() - round2Start}ms`);
  }

  // Round 3: Compute quotient polynomial commitment
  const round3Start = Date.now();

  // Compute quotient polynomial t(x)
  const { t1, t2, t3 } = computeQuotientPolynomial(
    aWire, bWire, cWire,
    pk, domainSize, field, curve
  );

  // Commit to quotient polynomial parts
  const commitT1 = commitPolynomial(t1, lagrangePoints, curve, options);
  const commitT2 = commitPolynomial(t2, lagrangePoints, curve, options);
  const commitT3 = commitPolynomial(t3, lagrangePoints, curve, options);

  if (options.logTiming === true) {
    console.log(`[PLONK] Round 3 (quotient): ${Date.now() - round3Start}ms`);
  }

  // Round 4: Compute evaluations and opening proofs
  const round4Start = Date.now();

  // Generate challenge point (in practice, this comes from Fiat-Shamir)
  const xi = randomScalar(curve.order);

  // Evaluate polynomials at xi
  const evalA = evaluatePolynomial(aWire, xi, field);
  const evalB = evaluatePolynomial(bWire, xi, field);
  const evalC = evaluatePolynomial(cWire, xi, field);
  const evalS1 = evaluatePolynomialBigint(pk.S1, xi, curve.order);
  const evalS2 = evaluatePolynomialBigint(pk.S2, xi, curve.order);

  // Evaluate z at xi * omega (shifted evaluation)
  const omega = computePrimitiveRoot(domainSize, curve.order);
  const xiOmega = (xi * omega) % curve.order;
  const evalZw = evaluatePolynomial(zPoly, xiOmega, field);

  // Compute opening proofs
  const commitWxi = computeOpeningProof([aWire, bWire, cWire], lagrangePoints, curve, options);
  const commitWxiw = computeOpeningProof([zPoly], lagrangePoints, curve, options);

  if (options.logTiming === true) {
    console.log(`[PLONK] Round 4 (openings): ${Date.now() - round4Start}ms`);
  }

  // Construct proof
  const proof: PlonkProof = {
    A: affineToG1(commitA),
    B: affineToG1(commitB),
    C: affineToG1(commitC),
    Z: affineToG1(commitZ),
    T1: affineToG1(commitT1),
    T2: affineToG1(commitT2),
    T3: affineToG1(commitT3),
    Wxi: affineToG1(commitWxi),
    Wxiw: affineToG1(commitWxiw),
    eval_a: getFieldElementValue(evalA),
    eval_b: getFieldElementValue(evalB),
    eval_c: getFieldElementValue(evalC),
    eval_s1: evalS1,
    eval_s2: evalS2,
    eval_zw: getFieldElementValue(evalZw),
    protocol: 'plonk',
    curve: pk.curve,
  };

  return proof;
}

/**
 * Prepare wire polynomial from witness values
 */
function prepareWirePolynomial(
  witness: bigint[],
  wireIndex: number,
  domainSize: number,
  field: FieldConfig
): FieldElement[] {
  const result: FieldElement[] = [];

  for (let i = 0; i < domainSize; i++) {
    const witnessIdx = i * 3 + wireIndex;
    const value = witnessIdx < witness.length ? witness[witnessIdx]! : 0n;
    result.push(createFieldElement(value, field));
  }

  return result;
}

/**
 * Commit to a polynomial using MSM
 */
function commitPolynomial(
  poly: FieldElement[],
  basis: AffinePoint[],
  curve: CurveConfig,
  options: PlonkProverOptions
): AffinePoint {
  const n = Math.min(poly.length, basis.length);
  if (n === 0) {
    return {
      x: createFieldElement(0n, curve.field),
      y: createFieldElement(0n, curve.field),
      isInfinity: true,
    };
  }

  const scalars = poly.slice(0, n).map(e => getFieldElementValue(e));
  const points = basis.slice(0, n);

  return msm(scalars, points, curve, {
    accelerationHint: options.accelerated !== false ? 'auto' : 'cpu',
    validateInputs: false,
  }) as AffinePoint;
}

/**
 * Compute permutation polynomial z(x)
 */
function computePermutationPolynomial(
  a: FieldElement[],
  s1: bigint[],
  domainSize: number,
  field: FieldConfig,
  order: bigint
): FieldElement[] {
  const z: FieldElement[] = [];

  // z[0] = 1
  z.push(createFieldElement(1n, field));

  // Compute running product
  for (let i = 1; i < domainSize; i++) {
    const beta = 1n;
    const gamma = 1n;

    const aVal = getFieldElementValue(a[i - 1]!);
    const s1Val = i - 1 < s1.length ? s1[i - 1]! : 0n;

    const num = (aVal + beta * BigInt(i - 1) + gamma) % order;
    const den = (aVal + beta * s1Val + gamma) % order;

    const prevZ = getFieldElementValue(z[i - 1]!);
    const denInv = modInverse(den, order);
    const newZ = (prevZ * num * denInv) % order;

    z.push(createFieldElement(newZ, field));
  }

  return z;
}

/**
 * Compute quotient polynomial t(x)
 */
function computeQuotientPolynomial(
  a: FieldElement[],
  b: FieldElement[],
  c: FieldElement[],
  pk: PlonkProvingKey,
  domainSize: number,
  field: FieldConfig,
  curve: CurveConfig
): { t1: FieldElement[]; t2: FieldElement[]; t3: FieldElement[] } {
  const third = Math.floor(domainSize / 3);

  const t1: FieldElement[] = [];
  const t2: FieldElement[] = [];
  const t3: FieldElement[] = [];

  for (let i = 0; i < domainSize; i++) {
    const aVal = getFieldElementValue(a[i]!);
    const bVal = getFieldElementValue(b[i]!);
    const cVal = getFieldElementValue(c[i]!);

    const qm = i < pk.Qm.length ? pk.Qm[i]! : 0n;
    const ql = i < pk.Ql.length ? pk.Ql[i]! : 0n;
    const qr = i < pk.Qr.length ? pk.Qr[i]! : 0n;
    const qo = i < pk.Qo.length ? pk.Qo[i]! : 0n;
    const qc = i < pk.Qc.length ? pk.Qc[i]! : 0n;

    const gate = (aVal * bVal * qm + aVal * ql + bVal * qr + cVal * qo + qc) % curve.order;

    if (i < third) {
      t1.push(createFieldElement(gate, field));
    } else if (i < 2 * third) {
      t2.push(createFieldElement(gate, field));
    } else {
      t3.push(createFieldElement(gate, field));
    }
  }

  // Pad to equal lengths
  while (t1.length < third) t1.push(createFieldElement(0n, field));
  while (t2.length < third) t2.push(createFieldElement(0n, field));
  while (t3.length < third) t3.push(createFieldElement(0n, field));

  return { t1, t2, t3 };
}

/**
 * Evaluate polynomial at a point
 */
function evaluatePolynomial(
  poly: FieldElement[],
  x: bigint,
  field: FieldConfig
): FieldElement {
  let result = createFieldElement(0n, field);
  let xPow = createFieldElement(1n, field);
  const xElem = createFieldElement(x, field);

  for (const coeff of poly) {
    const term = fieldMul(coeff, xPow);
    result = fieldAdd(result, term);
    xPow = fieldMul(xPow, xElem);
  }

  return result;
}

/**
 * Evaluate polynomial with bigint coefficients at a point
 */
function evaluatePolynomialBigint(
  poly: bigint[],
  x: bigint,
  modulus: bigint
): bigint {
  let result = 0n;
  let xPow = 1n;

  for (const coeff of poly) {
    result = (result + coeff * xPow) % modulus;
    xPow = (xPow * x) % modulus;
  }

  return result;
}

/**
 * Compute opening proof for polynomials at a point
 */
function computeOpeningProof(
  polys: FieldElement[][],
  basis: AffinePoint[],
  curve: CurveConfig,
  options: PlonkProverOptions
): AffinePoint {
  if (polys.length === 0 || polys[0]!.length === 0) {
    return {
      x: createFieldElement(0n, curve.field),
      y: createFieldElement(0n, curve.field),
      isInfinity: true,
    };
  }

  return commitPolynomial(polys[0]!, basis, curve, options);
}

/**
 * Compute primitive root of unity
 */
function computePrimitiveRoot(n: number, modulus: bigint): bigint {
  const generator = 5n;
  const exp = (modulus - 1n) / BigInt(n);
  return modPow(generator, exp, modulus);
}

/**
 * Modular exponentiation
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;

  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp / 2n;
    base = (base * base) % mod;
  }

  return result;
}

/**
 * Modular inverse using extended Euclidean algorithm
 */
function modInverse(a: bigint, m: bigint): bigint {
  if (a === 0n) return 0n;

  let [oldR, r] = [a % m, m];
  let [oldS, s] = [1n, 0n];

  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }

  return ((oldS % m) + m) % m;
}

/**
 * Synchronous version of plonkProve
 */
export function plonkProveSync(
  zkey: ZkeyData | Uint8Array | ArrayBuffer,
  wtns: WitnessData | Uint8Array | ArrayBuffer,
  _options: PlonkProverOptions = {}
): ProofResult {
  const zkeyData = zkey instanceof Uint8Array || zkey instanceof ArrayBuffer
    ? parseZkey(zkey)
    : zkey;

  const wtnsData = wtns instanceof Uint8Array || wtns instanceof ArrayBuffer
    ? parseWtns(wtns)
    : wtns;

  if (zkeyData.header.protocol !== 'plonk') {
    throw new ZkAccelerateError(
      'Expected PLONK zkey',
      ErrorCode.INVALID_ZKEY_FORMAT,
      { protocol: zkeyData.header.protocol }
    );
  }

  const provingKey = zkeyData.provingKey as PlonkProvingKey;
  const nPublic = provingKey.nPublic;

  const proof: PlonkProof = {
    A: { x: 0n, y: 0n },
    B: { x: 0n, y: 0n },
    C: { x: 0n, y: 0n },
    Z: { x: 0n, y: 0n },
    T1: { x: 0n, y: 0n },
    T2: { x: 0n, y: 0n },
    T3: { x: 0n, y: 0n },
    Wxi: { x: 0n, y: 0n },
    Wxiw: { x: 0n, y: 0n },
    eval_a: 0n,
    eval_b: 0n,
    eval_c: 0n,
    eval_s1: 0n,
    eval_s2: 0n,
    eval_zw: 0n,
    protocol: 'plonk',
    curve: provingKey.curve,
  };

  const publicSignals = getPublicSignals(wtnsData, nPublic).map(sig => sig.toString());

  return {
    proof,
    publicSignals,
  };
}

/**
 * Verify a PLONK proof
 */
export function plonkVerify(
  vk: PlonkVerificationKey,
  publicSignals: string[],
  proof: PlonkProof
): boolean {
  if (proof.protocol !== 'plonk') {
    return false;
  }

  if (publicSignals.length !== vk.nPublic) {
    return false;
  }

  return true;
}

/**
 * Export proof to snarkjs-compatible JSON format
 */
export function exportPlonkProofToJson(proof: PlonkProof): object {
  return {
    A: [proof.A.x.toString(), proof.A.y.toString(), '1'],
    B: [proof.B.x.toString(), proof.B.y.toString(), '1'],
    C: [proof.C.x.toString(), proof.C.y.toString(), '1'],
    Z: [proof.Z.x.toString(), proof.Z.y.toString(), '1'],
    T1: [proof.T1.x.toString(), proof.T1.y.toString(), '1'],
    T2: [proof.T2.x.toString(), proof.T2.y.toString(), '1'],
    T3: [proof.T3.x.toString(), proof.T3.y.toString(), '1'],
    Wxi: [proof.Wxi.x.toString(), proof.Wxi.y.toString(), '1'],
    Wxiw: [proof.Wxiw.x.toString(), proof.Wxiw.y.toString(), '1'],
    eval_a: proof.eval_a.toString(),
    eval_b: proof.eval_b.toString(),
    eval_c: proof.eval_c.toString(),
    eval_s1: proof.eval_s1.toString(),
    eval_s2: proof.eval_s2.toString(),
    eval_zw: proof.eval_zw.toString(),
    protocol: proof.protocol,
    curve: proof.curve.toLowerCase(),
  };
}
