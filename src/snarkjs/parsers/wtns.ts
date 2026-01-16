/**
 * Witness File Parser
 *
 * Parses snarkjs .wtns (witness) files. The witness file contains
 * the computed values for all wires in the circuit.
 *
 * Requirements: 10.4
 */

import { ZkAccelerateError, ErrorCode } from '../../errors.js';
import type { WitnessData } from '../types.js';
import {
  BinaryReader,
  WTNS_MAGIC,
  detectCurveFromPrime,
  type SectionHeader,
} from './utils.js';

/**
 * Witness file section types
 */
enum WtnsSectionType {
  HEADER = 1,
  DATA = 2,
}

/**
 * Parse a witness file buffer
 *
 * @param data - The witness file contents as Uint8Array or ArrayBuffer
 * @returns Parsed witness data
 */
export function parseWtns(data: Uint8Array | ArrayBuffer): WitnessData {
  const reader = new BinaryReader(data);

  // Read and validate magic number
  const magic = reader.readUint32();
  if (magic !== WTNS_MAGIC) {
    throw new ZkAccelerateError(
      'Invalid witness file: wrong magic number',
      ErrorCode.INVALID_WTNS_FORMAT,
      { expected: WTNS_MAGIC.toString(16), actual: magic.toString(16) }
    );
  }

  // Read version
  const version = reader.readUint32();
  if (version !== 2) {
    throw new ZkAccelerateError(
      'Unsupported witness file version',
      ErrorCode.INVALID_WTNS_FORMAT,
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
  const headerSection = sections.get(WtnsSectionType.HEADER);
  if (!headerSection) {
    throw new ZkAccelerateError(
      'Invalid witness file: missing header section',
      ErrorCode.INVALID_WTNS_FORMAT
    );
  }

  reader.seek(headerSection.position);

  // Read field element size and prime
  const n8 = reader.readUint32();
  const prime = reader.readFieldElement(n8);
  const curve = detectCurveFromPrime(prime);

  // Read number of witness values
  const nWitness = Number(reader.readUint32());

  // Read data section
  const dataSection = sections.get(WtnsSectionType.DATA);
  if (!dataSection) {
    throw new ZkAccelerateError(
      'Invalid witness file: missing data section',
      ErrorCode.INVALID_WTNS_FORMAT
    );
  }

  reader.seek(dataSection.position);

  // Read witness values
  const witness: bigint[] = [];
  for (let i = 0; i < nWitness; i++) {
    witness.push(reader.readFieldElement(n8));
  }

  return {
    curve,
    nWitness,
    witness,
  };
}

/**
 * Validate a parsed witness file
 */
export function validateWtns(wtns: WitnessData): boolean {
  // Check that witness array length matches nWitness
  if (wtns.witness.length !== wtns.nWitness) {
    return false;
  }

  // Check that first witness value is 1 (constant wire)
  if (wtns.witness[0] !== 1n) {
    return false;
  }

  return true;
}

/**
 * Get witness value by index
 */
export function getWitnessValue(wtns: WitnessData, index: number): bigint {
  if (index < 0 || index >= wtns.nWitness) {
    throw new ZkAccelerateError(
      'Witness index out of bounds',
      ErrorCode.INVALID_WTNS_FORMAT,
      { index, nWitness: wtns.nWitness }
    );
  }
  return wtns.witness[index]!;
}

/**
 * Get public signals from witness (indices 1 to nPublic)
 */
export function getPublicSignals(wtns: WitnessData, nPublic: number): bigint[] {
  if (nPublic + 1 > wtns.nWitness) {
    throw new ZkAccelerateError(
      'Not enough witness values for public signals',
      ErrorCode.INVALID_WTNS_FORMAT,
      { nPublic, nWitness: wtns.nWitness }
    );
  }

  return wtns.witness.slice(1, nPublic + 1);
}

/**
 * Convert witness values to string array (for snarkjs compatibility)
 */
export function witnessToStrings(wtns: WitnessData): string[] {
  return wtns.witness.map((w) => w.toString());
}
