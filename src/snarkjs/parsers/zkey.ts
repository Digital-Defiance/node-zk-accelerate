/**
 * Zkey File Parser
 *
 * Parses snarkjs .zkey files for both Groth16 and PLONK protocols.
 * The zkey file contains the proving and verification keys generated
 * during the trusted setup ceremony.
 *
 * Requirements: 10.4
 */

import { ZkAccelerateError, ErrorCode } from '../../errors.js';
import type { CurveName } from '../../types.js';
import type {
  ZkeyData,
  ZkeyHeader,
  ProtocolType,
  Groth16ProvingKey,
  Groth16VerificationKey,
  PlonkProvingKey,
  PlonkVerificationKey,
  G1Point,
  G2Point,
} from '../types.js';
import {
  BinaryReader,
  ZKEY_MAGIC,
  ZkeySectionType,
  readG1Point,
  readG2Point,
  getFieldByteLength,
  detectCurveFromPrime,
  type SectionHeader,
} from './utils.js';

/**
 * Parse a zkey file buffer
 *
 * @param data - The zkey file contents as Uint8Array or ArrayBuffer
 * @returns Parsed zkey data including header, proving key, and verification key
 */
export function parseZkey(data: Uint8Array | ArrayBuffer): ZkeyData {
  const reader = new BinaryReader(data);

  // Read and validate magic number
  const magic = reader.readUint32();
  if (magic !== ZKEY_MAGIC) {
    throw new ZkAccelerateError(
      'Invalid zkey file: wrong magic number',
      ErrorCode.INVALID_ZKEY_FORMAT,
      { expected: ZKEY_MAGIC.toString(16), actual: magic.toString(16) }
    );
  }

  // Read version
  const version = reader.readUint32();
  if (version !== 1 && version !== 2) {
    throw new ZkAccelerateError(
      'Unsupported zkey version',
      ErrorCode.INVALID_ZKEY_FORMAT,
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

  // Read header section to determine protocol
  const headerSection = sections.get(ZkeySectionType.HEADER);
  if (!headerSection) {
    throw new ZkAccelerateError(
      'Invalid zkey file: missing header section',
      ErrorCode.INVALID_ZKEY_FORMAT
    );
  }

  reader.seek(headerSection.position);
  const protoId = reader.readUint32();

  // Determine protocol type
  let protocol: ProtocolType;
  switch (protoId) {
    case 1:
      protocol = 'groth16';
      break;
    case 2:
      protocol = 'plonk';
      break;
    case 3:
      protocol = 'fflonk';
      break;
    default:
      throw new ZkAccelerateError(
        'Unknown protocol type in zkey',
        ErrorCode.INVALID_ZKEY_FORMAT,
        { protoId }
      );
  }

  // Parse based on protocol
  if (protocol === 'groth16') {
    return parseGroth16Zkey(reader, sections);
  } else if (protocol === 'plonk') {
    return parsePlonkZkey(reader, sections);
  } else {
    throw new ZkAccelerateError(
      'fflonk protocol not yet supported',
      ErrorCode.INVALID_ZKEY_FORMAT,
      { protocol }
    );
  }
}

/**
 * Parse Groth16 zkey file
 */
function parseGroth16Zkey(
  reader: BinaryReader,
  sections: Map<number, SectionHeader>
): ZkeyData {
  // Read Groth16 header section
  const groth16HeaderSection = sections.get(ZkeySectionType.GROTH16_HEADER);
  if (!groth16HeaderSection) {
    throw new ZkAccelerateError(
      'Invalid Groth16 zkey: missing Groth16 header section',
      ErrorCode.INVALID_ZKEY_FORMAT
    );
  }

  reader.seek(groth16HeaderSection.position);

  // Read field size and prime
  const n8q = reader.readUint32(); // Field element byte size
  const q = reader.readFieldElement(n8q); // Field prime
  const curve = detectCurveFromPrime(q);

  const n8r = reader.readUint32(); // Scalar field byte size
  reader.readFieldElement(n8r); // Scalar field prime (read to advance position)

  const nVars = Number(reader.readUint32());
  const nPublic = Number(reader.readUint32());
  const domainSize = Number(reader.readUint32());

  // Read verification key points
  const vk_alpha_1 = readG1Point(reader, curve);
  readG1Point(reader, curve); // vk_beta_1 - read to advance position
  const vk_beta_2 = readG2Point(reader, curve);
  const vk_gamma_2 = readG2Point(reader, curve);
  readG1Point(reader, curve); // vk_delta_1 - read to advance position
  const vk_delta_2 = readG2Point(reader, curve);

  // Read IC (public input commitments) section
  const icSection = sections.get(ZkeySectionType.IC);
  const IC: G1Point[] = [];
  if (icSection) {
    reader.seek(icSection.position);
    for (let i = 0; i <= nPublic; i++) {
      IC.push(readG1Point(reader, curve));
    }
  }

  // Read A points section
  const aSection = sections.get(ZkeySectionType.A);
  const A: G1Point[] = [];
  if (aSection) {
    reader.seek(aSection.position);
    const numA = Number(aSection.size) / (2 * getFieldByteLength(curve));
    for (let i = 0; i < numA; i++) {
      A.push(readG1Point(reader, curve));
    }
  }

  // Read B1 points section
  const b1Section = sections.get(ZkeySectionType.B1);
  const B1: G1Point[] = [];
  if (b1Section) {
    reader.seek(b1Section.position);
    const numB1 = Number(b1Section.size) / (2 * getFieldByteLength(curve));
    for (let i = 0; i < numB1; i++) {
      B1.push(readG1Point(reader, curve));
    }
  }

  // Read B2 points section
  const b2Section = sections.get(ZkeySectionType.B2);
  const B2: G2Point[] = [];
  if (b2Section) {
    reader.seek(b2Section.position);
    const numB2 = Number(b2Section.size) / (4 * getFieldByteLength(curve));
    for (let i = 0; i < numB2; i++) {
      B2.push(readG2Point(reader, curve));
    }
  }

  // Read C points section
  const cSection = sections.get(ZkeySectionType.C);
  const C: G1Point[] = [];
  if (cSection) {
    reader.seek(cSection.position);
    const numC = Number(cSection.size) / (2 * getFieldByteLength(curve));
    for (let i = 0; i < numC; i++) {
      C.push(readG1Point(reader, curve));
    }
  }

  // Read H points section
  const hSection = sections.get(ZkeySectionType.H);
  const H: G1Point[] = [];
  if (hSection) {
    reader.seek(hSection.position);
    const numH = Number(hSection.size) / (2 * getFieldByteLength(curve));
    for (let i = 0; i < numH; i++) {
      H.push(readG1Point(reader, curve));
    }
  }

  const header: ZkeyHeader = {
    protocol: 'groth16',
    curve,
    nPublic,
    domainSize,
    nConstraints: domainSize,
    nVars,
  };

  const provingKey: Groth16ProvingKey = {
    protocol: 'groth16',
    curve,
    nVars,
    nPublic,
    domainSize,
    A,
    B1,
    B2,
    C,
    H,
  };

  const verificationKey: Groth16VerificationKey = {
    protocol: 'groth16',
    curve,
    nPublic,
    vk_alpha_1,
    vk_beta_2,
    vk_gamma_2,
    vk_delta_2,
    vk_alphabeta_12: null, // Computed during verification
    IC,
  };

  return { header, provingKey, verificationKey };
}

/**
 * Parse PLONK zkey file
 */
function parsePlonkZkey(
  reader: BinaryReader,
  sections: Map<number, SectionHeader>
): ZkeyData {
  // Read PLONK header section (same section type as Groth16 header)
  const plonkHeaderSection = sections.get(ZkeySectionType.PLONK_HEADER);
  if (!plonkHeaderSection) {
    throw new ZkAccelerateError(
      'Invalid PLONK zkey: missing PLONK header section',
      ErrorCode.INVALID_ZKEY_FORMAT
    );
  }

  reader.seek(plonkHeaderSection.position);

  // Read field size and prime
  const n8q = reader.readUint32();
  const q = reader.readFieldElement(n8q);
  const curve = detectCurveFromPrime(q);

  const n8r = reader.readUint32();
  reader.readFieldElement(n8r); // Scalar field prime (read to advance position)

  const nVars = Number(reader.readUint32());
  const nPublic = Number(reader.readUint32());
  const domainSize = Number(reader.readUint32());
  reader.readUint32(); // nAdditions - read to advance position
  const nConstraints = Number(reader.readUint32());

  // Read verification key commitments
  const Qm = readG1Point(reader, curve);
  const Ql = readG1Point(reader, curve);
  const Qr = readG1Point(reader, curve);
  const Qo = readG1Point(reader, curve);
  const Qc = readG1Point(reader, curve);
  const S1 = readG1Point(reader, curve);
  const S2 = readG1Point(reader, curve);
  const S3 = readG1Point(reader, curve);
  const X_2 = readG2Point(reader, curve);

  // Read selector polynomials
  const QmPoly = readPolynomialSection(reader, sections, ZkeySectionType.PLONK_QM, domainSize, curve);
  const QlPoly = readPolynomialSection(reader, sections, ZkeySectionType.PLONK_QL, domainSize, curve);
  const QrPoly = readPolynomialSection(reader, sections, ZkeySectionType.PLONK_QR, domainSize, curve);
  const QoPoly = readPolynomialSection(reader, sections, ZkeySectionType.PLONK_QO, domainSize, curve);
  const QcPoly = readPolynomialSection(reader, sections, ZkeySectionType.PLONK_QC, domainSize, curve);

  // Read permutation polynomials
  const S1Poly = readPolynomialSection(reader, sections, ZkeySectionType.PLONK_SIGMA1, domainSize, curve);
  const S2Poly = readPolynomialSection(reader, sections, ZkeySectionType.PLONK_SIGMA2, domainSize, curve);
  const S3Poly = readPolynomialSection(reader, sections, ZkeySectionType.PLONK_SIGMA3, domainSize, curve);

  // Read Lagrange basis SRS
  const lagrangeSection = sections.get(ZkeySectionType.PLONK_LAGRANGE);
  const lagrangeBasis: G1Point[] = [];
  if (lagrangeSection) {
    reader.seek(lagrangeSection.position);
    const numPoints = Number(lagrangeSection.size) / (2 * getFieldByteLength(curve));
    for (let i = 0; i < numPoints; i++) {
      lagrangeBasis.push(readG1Point(reader, curve));
    }
  }

  const header: ZkeyHeader = {
    protocol: 'plonk',
    curve,
    nPublic,
    domainSize,
    nConstraints,
    nVars,
  };

  const provingKey: PlonkProvingKey = {
    protocol: 'plonk',
    curve,
    nVars,
    nPublic,
    domainSize,
    Qm: QmPoly,
    Ql: QlPoly,
    Qr: QrPoly,
    Qo: QoPoly,
    Qc: QcPoly,
    S1: S1Poly,
    S2: S2Poly,
    S3: S3Poly,
    lagrangeBasis,
  };

  const verificationKey: PlonkVerificationKey = {
    protocol: 'plonk',
    curve,
    nPublic,
    domainSize,
    Qm,
    Ql,
    Qr,
    Qo,
    Qc,
    S1,
    S2,
    S3,
    X_2,
  };

  return { header, provingKey, verificationKey };
}

/**
 * Read a polynomial section from the zkey file
 */
function readPolynomialSection(
  reader: BinaryReader,
  sections: Map<number, SectionHeader>,
  sectionType: number,
  expectedSize: number,
  curve: CurveName
): bigint[] {
  const section = sections.get(sectionType);
  if (!section) {
    return new Array(expectedSize).fill(0n);
  }

  reader.seek(section.position);
  const byteLength = getFieldByteLength(curve);
  const numElements = Number(section.size) / byteLength;
  const result: bigint[] = [];

  for (let i = 0; i < numElements; i++) {
    result.push(reader.readFieldElement(byteLength));
  }

  return result;
}

/**
 * Validate a parsed zkey file
 */
export function validateZkey(zkey: ZkeyData): boolean {
  const { header, provingKey, verificationKey } = zkey;

  // Check protocol consistency
  if (header.protocol !== provingKey.protocol || header.protocol !== verificationKey.protocol) {
    return false;
  }

  // Check curve consistency
  if (header.curve !== provingKey.curve || header.curve !== verificationKey.curve) {
    return false;
  }

  // Check nPublic consistency
  if (header.nPublic !== provingKey.nPublic || header.nPublic !== verificationKey.nPublic) {
    return false;
  }

  return true;
}

/**
 * Get the protocol type from a zkey buffer without fully parsing
 */
export function getZkeyProtocol(data: Uint8Array | ArrayBuffer): ProtocolType {
  const reader = new BinaryReader(data);

  // Read and validate magic number
  const magic = reader.readUint32();
  if (magic !== ZKEY_MAGIC) {
    throw new ZkAccelerateError(
      'Invalid zkey file: wrong magic number',
      ErrorCode.INVALID_ZKEY_FORMAT
    );
  }

  // Skip version
  reader.skip(4);

  // Read number of sections
  const numSections = reader.readUint32();

  // Find header section
  for (let i = 0; i < numSections; i++) {
    const type = reader.readUint32();
    const size = reader.readUint64();

    if (type === ZkeySectionType.HEADER) {
      const protoId = reader.readUint32();
      switch (protoId) {
        case 1:
          return 'groth16';
        case 2:
          return 'plonk';
        case 3:
          return 'fflonk';
        default:
          throw new ZkAccelerateError(
            'Unknown protocol type',
            ErrorCode.INVALID_ZKEY_FORMAT,
            { protoId }
          );
      }
    }

    reader.skip(Number(size));
  }

  throw new ZkAccelerateError(
    'Invalid zkey file: missing header section',
    ErrorCode.INVALID_ZKEY_FORMAT
  );
}
