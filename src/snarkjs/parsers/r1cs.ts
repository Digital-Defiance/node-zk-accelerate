/**
 * R1CS File Parser
 *
 * Parses snarkjs .r1cs (Rank-1 Constraint System) files. The R1CS file
 * contains the constraint system that defines the circuit.
 *
 * Requirements: 10.4
 */

import { ZkAccelerateError, ErrorCode } from '../../errors.js';
import type { R1CSData, R1CSConstraint } from '../types.js';
import {
  BinaryReader,
  R1CS_MAGIC,
  detectCurveFromPrime,
  type SectionHeader,
} from './utils.js';

/**
 * R1CS file section types
 */
enum R1CSSectionType {
  HEADER = 1,
  CONSTRAINTS = 2,
  WIRE2LABEL = 3,
  CUSTOM_GATES_LIST = 4,
  CUSTOM_GATES_APPLICATION = 5,
}

/**
 * Parse an R1CS file buffer
 *
 * @param data - The R1CS file contents as Uint8Array or ArrayBuffer
 * @returns Parsed R1CS data
 */
export function parseR1cs(data: Uint8Array | ArrayBuffer): R1CSData {
  const reader = new BinaryReader(data);

  // Read and validate magic number
  const magic = reader.readUint32();
  if (magic !== R1CS_MAGIC) {
    throw new ZkAccelerateError(
      'Invalid R1CS file: wrong magic number',
      ErrorCode.INVALID_R1CS_FORMAT,
      { expected: R1CS_MAGIC.toString(16), actual: magic.toString(16) }
    );
  }

  // Read version
  const version = reader.readUint32();
  if (version !== 1) {
    throw new ZkAccelerateError(
      'Unsupported R1CS file version',
      ErrorCode.INVALID_R1CS_FORMAT,
      { version }
    );
  }

  // Read number of sections
  const numSections = reader.readUint32();

  // Read section headers
  const sections = new Map<number, SectionHeader>();
  for (let i = 0; i < numSections; i++) {
    const type = reader.readUint32();
    const size = reader.readUint64();
    const position = reader.position;
    sections.set(type, { type, size, position });
    reader.skip(Number(size));
  }

  // Read header section
  const headerSection = sections.get(R1CSSectionType.HEADER);
  if (!headerSection) {
    throw new ZkAccelerateError(
      'Invalid R1CS file: missing header section',
      ErrorCode.INVALID_R1CS_FORMAT
    );
  }

  reader.seek(headerSection.position);

  // Read field element size and prime
  const n8 = reader.readUint32();
  const prime = reader.readFieldElement(n8);
  const curve = detectCurveFromPrime(prime);

  // Read circuit dimensions
  const nWires = Number(reader.readUint32());
  const nPubOut = Number(reader.readUint32());
  const nPubIn = Number(reader.readUint32());
  const nPrvIn = Number(reader.readUint32());
  const nLabels = Number(reader.readUint64());
  const nConstraints = Number(reader.readUint32());

  // Read constraints section
  const constraintsSection = sections.get(R1CSSectionType.CONSTRAINTS);
  const constraints: R1CSConstraint[] = [];

  if (constraintsSection) {
    reader.seek(constraintsSection.position);

    for (let i = 0; i < nConstraints; i++) {
      const constraint = readConstraint(reader, n8);
      constraints.push(constraint);
    }
  }

  // Read wire to label mapping (optional)
  const wire2LabelSection = sections.get(R1CSSectionType.WIRE2LABEL);
  let wireToLabel: Map<number, bigint> | undefined = undefined;

  if (wire2LabelSection) {
    reader.seek(wire2LabelSection.position);
    wireToLabel = new Map();

    for (let i = 0; i < nWires; i++) {
      const label = reader.readUint64();
      wireToLabel.set(i, label);
    }
  }

  const result: R1CSData = {
    curve,
    prime,
    nWires,
    nPubOut,
    nPubIn,
    nPrvIn,
    nLabels,
    nConstraints,
    constraints,
  };

  if (wireToLabel !== undefined) {
    result.wireToLabel = wireToLabel;
  }

  return result;
}

/**
 * Read a single constraint from the R1CS file
 */
function readConstraint(reader: BinaryReader, n8: number): R1CSConstraint {
  const A = readLinearCombination(reader, n8);
  const B = readLinearCombination(reader, n8);
  const C = readLinearCombination(reader, n8);

  return { A, B, C };
}

/**
 * Read a linear combination (sparse vector) from the R1CS file
 */
function readLinearCombination(reader: BinaryReader, n8: number): Map<number, bigint> {
  const result = new Map<number, bigint>();
  const nTerms = reader.readUint32();

  for (let i = 0; i < nTerms; i++) {
    const wireIndex = reader.readUint32();
    const coefficient = reader.readFieldElement(n8);
    result.set(wireIndex, coefficient);
  }

  return result;
}

/**
 * Validate a parsed R1CS file
 */
export function validateR1cs(r1cs: R1CSData): boolean {
  // Check that constraint count matches
  if (r1cs.constraints.length !== r1cs.nConstraints) {
    return false;
  }

  // Check that wire indices in constraints are valid
  for (const constraint of r1cs.constraints) {
    for (const wireIndex of constraint.A.keys()) {
      if (wireIndex >= r1cs.nWires) {
        return false;
      }
    }
    for (const wireIndex of constraint.B.keys()) {
      if (wireIndex >= r1cs.nWires) {
        return false;
      }
    }
    for (const wireIndex of constraint.C.keys()) {
      if (wireIndex >= r1cs.nWires) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get the number of public inputs (outputs + inputs)
 */
export function getNumPublic(r1cs: R1CSData): number {
  return r1cs.nPubOut + r1cs.nPubIn;
}

/**
 * Get the number of private inputs
 */
export function getNumPrivate(r1cs: R1CSData): number {
  return r1cs.nPrvIn;
}

/**
 * Evaluate a linear combination with given witness values
 */
export function evaluateLinearCombination(
  lc: Map<number, bigint>,
  witness: bigint[],
  prime: bigint
): bigint {
  let result = 0n;

  for (const [wireIndex, coefficient] of lc) {
    const wireValue = witness[wireIndex];
    if (wireValue === undefined) {
      throw new ZkAccelerateError(
        'Missing witness value for wire',
        ErrorCode.INVALID_WTNS_FORMAT,
        { wireIndex }
      );
    }
    result = (result + coefficient * wireValue) % prime;
  }

  // Ensure positive result
  if (result < 0n) {
    result += prime;
  }

  return result;
}

/**
 * Check if a witness satisfies all R1CS constraints
 */
export function checkR1csConstraints(r1cs: R1CSData, witness: bigint[]): boolean {
  for (let i = 0; i < r1cs.nConstraints; i++) {
    const constraint = r1cs.constraints[i]!;

    const a = evaluateLinearCombination(constraint.A, witness, r1cs.prime);
    const b = evaluateLinearCombination(constraint.B, witness, r1cs.prime);
    const c = evaluateLinearCombination(constraint.C, witness, r1cs.prime);

    // Check A * B = C
    const ab = (a * b) % r1cs.prime;
    if (ab !== c) {
      return false;
    }
  }

  return true;
}

/**
 * Get constraint statistics
 */
export function getR1csStats(r1cs: R1CSData): {
  nConstraints: number;
  nWires: number;
  nPublic: number;
  nPrivate: number;
  avgTermsPerConstraint: number;
} {
  let totalTerms = 0;
  for (const constraint of r1cs.constraints) {
    totalTerms += constraint.A.size + constraint.B.size + constraint.C.size;
  }

  return {
    nConstraints: r1cs.nConstraints,
    nWires: r1cs.nWires,
    nPublic: r1cs.nPubOut + r1cs.nPubIn,
    nPrivate: r1cs.nPrvIn,
    avgTermsPerConstraint: r1cs.nConstraints > 0 ? totalTerms / r1cs.nConstraints : 0,
  };
}
