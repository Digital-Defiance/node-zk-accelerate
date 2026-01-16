/**
 * Parser Utilities
 *
 * Common utilities for parsing snarkjs binary file formats.
 *
 * Requirements: 10.4
 */

import { ZkAccelerateError, ErrorCode } from '../../errors.js';
import type { CurveName } from '../../types.js';
import type { G1Point, G2Point } from '../types.js';

/**
 * Binary reader for parsing snarkjs file formats
 */
export class BinaryReader {
  private view: DataView;
  private offset: number;
  private littleEndian: boolean;

  constructor(buffer: ArrayBuffer | Uint8Array, littleEndian = true) {
    const arrayBuffer = buffer instanceof Uint8Array ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;
    this.view = new DataView(arrayBuffer);
    this.offset = 0;
    this.littleEndian = littleEndian;
  }

  get position(): number {
    return this.offset;
  }

  get length(): number {
    return this.view.byteLength;
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.view.byteLength) {
      throw new ZkAccelerateError(
        `Seek position ${offset} out of bounds`,
        ErrorCode.INTERNAL_ERROR,
        { offset, length: this.view.byteLength }
      );
    }
    this.offset = offset;
  }

  skip(bytes: number): void {
    this.seek(this.offset + bytes);
  }

  readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  readUint64(): bigint {
    const low = BigInt(this.view.getUint32(this.offset, this.littleEndian));
    const high = BigInt(this.view.getUint32(this.offset + 4, this.littleEndian));
    this.offset += 8;
    return this.littleEndian ? low | (high << 32n) : (low << 32n) | high;
  }

  readBytes(length: number): Uint8Array {
    if (this.offset + length > this.view.byteLength) {
      throw new ZkAccelerateError(
        `Read beyond buffer end`,
        ErrorCode.INTERNAL_ERROR,
        { offset: this.offset, length, bufferLength: this.view.byteLength }
      );
    }
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return bytes;
  }

  /**
   * Read a field element as bigint (little-endian)
   */
  readFieldElement(byteLength: number): bigint {
    const bytes = this.readBytes(byteLength);
    return bytesToBigintLE(bytes);
  }

  /**
   * Read a string (null-terminated or fixed length)
   */
  readString(length?: number): string {
    if (length !== undefined) {
      const bytes = this.readBytes(length);
      const nullIndex = bytes.indexOf(0);
      const actualBytes = nullIndex >= 0 ? bytes.slice(0, nullIndex) : bytes;
      return new TextDecoder().decode(actualBytes);
    }

    // Read null-terminated string
    const chars: number[] = [];
    while (this.offset < this.view.byteLength) {
      const char = this.readUint8();
      if (char === 0) break;
      chars.push(char);
    }
    return String.fromCharCode(...chars);
  }
}

/**
 * Convert bytes to bigint (little-endian)
 */
export function bytesToBigintLE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << 8n) | BigInt(bytes[i]!);
  }
  return result;
}

/**
 * Convert bytes to bigint (big-endian)
 */
export function bytesToBigintBE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]!);
  }
  return result;
}

/**
 * Convert bigint to bytes (little-endian)
 */
export function bigintToBytesLE(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let v = value;
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytes;
}

/**
 * Detect curve from field prime
 */
export function detectCurveFromPrime(prime: bigint): CurveName {
  // BN254 base field prime
  const BN254_PRIME = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
  // BN254 scalar field prime
  const BN254_SCALAR = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  // BLS12-381 base field prime
  const BLS12_381_PRIME = 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
  // BLS12-381 scalar field prime
  const BLS12_381_SCALAR = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;

  if (prime === BN254_PRIME || prime === BN254_SCALAR) {
    return 'BN254';
  }
  if (prime === BLS12_381_PRIME || prime === BLS12_381_SCALAR) {
    return 'BLS12_381';
  }

  throw new ZkAccelerateError(
    'Unsupported curve: unknown field prime',
    ErrorCode.UNSUPPORTED_CURVE,
    { prime: prime.toString() }
  );
}

/**
 * Get field element byte length for a curve
 */
export function getFieldByteLength(curve: CurveName): number {
  switch (curve) {
    case 'BN254':
      return 32; // 254 bits
    case 'BLS12_381':
      return 48; // 381 bits
  }
}

/**
 * Read a G1 point from binary data
 */
export function readG1Point(reader: BinaryReader, curve: CurveName): G1Point {
  const byteLength = getFieldByteLength(curve);
  const x = reader.readFieldElement(byteLength);
  const y = reader.readFieldElement(byteLength);
  return { x, y };
}

/**
 * Read a G2 point from binary data
 */
export function readG2Point(reader: BinaryReader, curve: CurveName): G2Point {
  const byteLength = getFieldByteLength(curve);
  // G2 points have Fp2 coordinates (two field elements each)
  const x0 = reader.readFieldElement(byteLength);
  const x1 = reader.readFieldElement(byteLength);
  const y0 = reader.readFieldElement(byteLength);
  const y1 = reader.readFieldElement(byteLength);
  return {
    x: [x0, x1],
    y: [y0, y1],
  };
}

/**
 * snarkjs file magic numbers
 */
export const ZKEY_MAGIC = 0x7a6b6579; // "zkey" in little-endian
export const WTNS_MAGIC = 0x77746e73; // "wtns" in little-endian
export const R1CS_MAGIC = 0x72316373; // "r1cs" in little-endian

/**
 * snarkjs section types for zkey files
 */
export enum ZkeySectionType {
  HEADER = 1,
  GROTH16_HEADER = 2,
  IC = 3,
  COEFFICIENTS = 4,
  A = 5,
  B1 = 6,
  B2 = 7,
  C = 8,
  H = 9,
  CONTRIBUTIONS = 10,
  // PLONK sections
  PLONK_HEADER = 2,
  PLONK_ADDITIONS = 3,
  PLONK_A_MAP = 4,
  PLONK_B_MAP = 5,
  PLONK_C_MAP = 6,
  PLONK_QM = 7,
  PLONK_QL = 8,
  PLONK_QR = 9,
  PLONK_QO = 10,
  PLONK_QC = 11,
  PLONK_SIGMA1 = 12,
  PLONK_SIGMA2 = 13,
  PLONK_SIGMA3 = 14,
  PLONK_LAGRANGE = 15,
  PLONK_PTAU = 16,
}

/**
 * Section header in snarkjs files
 */
export interface SectionHeader {
  type: number;
  size: bigint;
  position: number;
}

/**
 * Read section headers from a snarkjs file
 */
export function readSectionHeaders(reader: BinaryReader): Map<number, SectionHeader> {
  const sections = new Map<number, SectionHeader>();
  const numSections = reader.readUint32();

  for (let i = 0; i < numSections; i++) {
    const type = reader.readUint32();
    const size = reader.readUint64();
    const position = reader.position;
    
    sections.set(type, { type, size, position });
    
    // Skip to next section header
    reader.skip(Number(size));
  }

  return sections;
}
