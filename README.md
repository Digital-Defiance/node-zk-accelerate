# @digitaldefiance/node-zk-accelerate

Zero-Knowledge Proof acceleration library for Node.js, maximizing Apple Silicon hardware utilization.

[![npm version](https://badge.fury.io/js/%40digitaldefiance%2Fnode-zk-accelerate.svg)](https://www.npmjs.com/package/@digitaldefiance/node-zk-accelerate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

`node-zk-accelerate` provides hardware-accelerated implementations of core ZK proof primitives:

- **Multi-Scalar Multiplication (MSM)** - 10x+ speedup over WASM
- **Number Theoretic Transform (NTT)** - 5x+ speedup over WASM
- **Finite Field Arithmetic** - Montgomery multiplication with SIMD optimization
- **Elliptic Curve Operations** - BN254 and BLS12-381 support

The library automatically detects and utilizes available hardware acceleration:
- **NEON SIMD** - ARM64 vector operations
- **AMX** - Apple Matrix Coprocessor via Accelerate framework
- **SME** - Scalable Matrix Extension (M4+)
- **Metal GPU** - Parallel compute for large workloads
- **Unified Memory** - Zero-copy CPU/GPU data sharing

## Installation

```bash
npm install @digitaldefiance/node-zk-accelerate
```

### Requirements

- Node.js 18+
- macOS with Apple Silicon (M1/M2/M3/M4)
- Xcode Command Line Tools (for native compilation)

### Optional Dependencies

For native acceleration (recommended):
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Rust toolchain (for additional optimizations)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Quick Start

```typescript
import {
  createFieldElement,
  createAffinePoint,
  msm,
  forwardNtt,
  inverseNtt,
  BN254_CURVE,
  BLS12_381_CURVE,
  detectHardwareCapabilities,
} from '@digitaldefiance/node-zk-accelerate';

// Check available hardware acceleration
const caps = detectHardwareCapabilities();
console.log(`NEON: ${caps.hasNeon}, Metal: ${caps.hasMetal}, AMX: ${caps.hasAmx}`);

// Field arithmetic
const a = createFieldElement(123n);
const b = createFieldElement(456n);

// MSM computation
const scalars = [1n, 2n, 3n];
const points = [
  BN254_CURVE.generator,
  BN254_CURVE.generator,
  BN254_CURVE.generator,
];
const result = msm(scalars, points, BN254_CURVE);

// NTT operations
const coefficients = [
  createFieldElement(1n),
  createFieldElement(2n),
  createFieldElement(3n),
  createFieldElement(4n),
];
const transformed = forwardNtt(coefficients);
const recovered = inverseNtt(transformed);
```

## API Reference

### Configuration

```typescript
import { configure, getConfig, resetConfig } from '@digitaldefiance/node-zk-accelerate';

// Configure global settings
configure({
  defaultCurve: 'BN254',        // or 'BLS12_381'
  validateInputs: true,         // Enable input validation
  accelerationHint: 'auto',     // 'cpu', 'gpu', 'hybrid', or 'auto'
  gpuThreshold: 1024,           // Min points for GPU dispatch
  debug: false,                 // Enable debug logging
});

// Get current configuration
const config = getConfig();

// Reset to defaults
resetConfig();
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultCurve` | `'BN254' \| 'BLS12_381'` | `'BN254'` | Default curve for operations |
| `validateInputs` | `boolean` | `true` | Enable input validation |
| `accelerationHint` | `'cpu' \| 'gpu' \| 'hybrid' \| 'auto'` | `'auto'` | Hardware acceleration preference |
| `gpuThreshold` | `number` | `1024` | Minimum points for GPU dispatch |
| `debug` | `boolean` | `false` | Enable debug logging |

---

### Field Elements

Field elements are the fundamental building blocks for ZK operations. They represent values in a finite field using Montgomery representation for efficient arithmetic.

```typescript
import {
  // Factory functions
  createFieldElement,
  createZero,
  createOne,
  
  // Arithmetic operations
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldDiv,
  fieldNeg,
  fieldInv,
  fieldSquare,
  fieldPow,
  
  // Batch operations
  batchInv,
  batchMul,
  batchAdd,
  
  // Utilities
  getFieldElementValue,
  isZeroFieldElement,
  fieldElementsEqual,
  
  // Serialization
  fieldElementToBytes,
  fieldElementFromBytes,
  
  // Field configurations
  BN254_FIELD,
  BLS12_381_FIELD,
} from '@digitaldefiance/node-zk-accelerate';
```

**Creating Field Elements:**

```typescript
// From BigInt (most common)
const a = createFieldElement(123n);

// From hex string
const b = createFieldElement('0x1a2b3c');

// From bytes (big-endian by default)
const c = createFieldElement(new Uint8Array([1, 2, 3, 4]), { endian: 'be' });

// With specific field
const d = createFieldElement(123n, { curve: 'BLS12_381', fieldType: 'scalar' });

// Special elements
const zero = createZero();
const one = createOne();
```

**Arithmetic Operations:**

```typescript
const sum = fieldAdd(a, b);           // a + b mod p
const diff = fieldSub(a, b);          // a - b mod p
const product = fieldMul(a, b);       // a * b mod p
const quotient = fieldDiv(a, b);      // a / b mod p
const negation = fieldNeg(a);         // -a mod p
const inverse = fieldInv(a);          // a^(-1) mod p
const squared = fieldSquare(a);       // a^2 mod p
const power = fieldPow(a, 10n);       // a^10 mod p
```

**Batch Operations (Optimized):**

```typescript
// Batch inversion using Montgomery's trick (much faster than individual inversions)
const inverses = batchInv([a, b, c, d]);

// Batch multiplication
const products = batchMul([[a, b], [c, d]]);

// Batch addition
const sums = batchAdd([[a, b], [c, d]]);
```

**Serialization:**

```typescript
// To bytes
const bytes = fieldElementToBytes(a, 'be');  // big-endian
const bytesLE = fieldElementToBytes(a, 'le'); // little-endian

// From bytes
const restored = fieldElementFromBytes(bytes, BN254_FIELD, 'be');
```

---

### Curve Points

Elliptic curve points support multiple coordinate representations for optimal performance.

```typescript
import {
  // Factory functions
  createAffinePoint,
  createJacobianPoint,
  createProjectivePoint,
  createIdentity,
  getGenerator,
  createScalar,
  
  // Point operations
  pointAdd,
  pointDouble,
  pointNegate,
  scalarMul,
  scalarMulWindowed,
  
  // Coordinate conversions
  toAffine,
  toJacobian,
  toProjective,
  
  // Validation
  isOnCurve,
  isIdentity,
  validateCurvePoint,
  curvePointsEqual,
  
  // Compression
  compressPoint,
  decompressPoint,
  
  // Curve configurations
  BN254_CURVE,
  BLS12_381_CURVE,
} from '@digitaldefiance/node-zk-accelerate';
```

**Creating Points:**

```typescript
// Get the generator point
const G = getGenerator({ curveName: 'BN254' });

// Create from coordinates
const P = createAffinePoint(xCoord, yCoord, { curveName: 'BN254' });

// Create identity (point at infinity)
const identity = createIdentity({ curveName: 'BN254' });

// Create scalar for multiplication
const scalar = createScalar(123n, { curveName: 'BN254' });
```

**Point Operations:**

```typescript
// Addition
const R = pointAdd(P, Q, BN254_CURVE);

// Doubling
const doubled = pointDouble(P, BN254_CURVE);

// Negation
const negP = pointNegate(P, BN254_CURVE);

// Scalar multiplication
const sP = scalarMul(123n, P, BN254_CURVE);

// Windowed scalar multiplication (faster for large scalars)
const sP2 = scalarMulWindowed(123n, P, BN254_CURVE, { windowSize: 4 });
```

**Coordinate Conversions:**

```typescript
// Convert to different representations
const jacobian = toJacobian(affinePoint, BN254_CURVE);
const projective = toProjective(affinePoint, BN254_CURVE);
const affine = toAffine(jacobianPoint, BN254_CURVE);
```

**Point Compression:**

```typescript
// Compress (33 bytes for BN254)
const compressed = compressPoint(P, BN254_CURVE);

// Decompress
const decompressed = decompressPoint(compressed, BN254_CURVE);
```

---

### Multi-Scalar Multiplication (MSM)

MSM computes Σ(sᵢ · Pᵢ) efficiently using Pippenger's algorithm with hardware acceleration.

```typescript
import {
  msm,
  msmAsync,
  batchMsm,
  msmNaive,
  msmWithMetadata,
  
  // Advanced
  hybridMsm,
  calibrate,
  pippengerMsm,
} from '@digitaldefiance/node-zk-accelerate';
```

**Basic Usage:**

```typescript
const scalars = [1n, 2n, 3n, 4n];
const points = [P1, P2, P3, P4];

// Synchronous MSM
const result = msm(scalars, points, BN254_CURVE);

// Async MSM (recommended for large inputs)
const asyncResult = await msmAsync(scalars, points, BN254_CURVE);
```

**MSM Options:**

```typescript
const result = msm(scalars, points, BN254_CURVE, {
  accelerationHint: 'auto',   // 'cpu', 'gpu', 'hybrid', or 'auto'
  validateInputs: true,       // Validate points are on curve
  windowSize: 16,             // Pippenger window size (auto-selected if omitted)
  gpuThreshold: 4096,         // Min points for GPU dispatch
});
```

**Batch MSM:**

```typescript
// Process multiple independent MSMs efficiently
const batches = [
  { scalars: [1n, 2n], points: [P1, P2] },
  { scalars: [3n, 4n], points: [P3, P4] },
];
const results = batchMsm(batches, BN254_CURVE);
```

**With Metadata:**

```typescript
const { result, metadata } = msmWithMetadata(scalars, points, BN254_CURVE);
console.log(`Time: ${metadata.timeMs}ms`);
console.log(`Accelerator: ${metadata.accelerator}`);
console.log(`Window size: ${metadata.windowSize}`);
```

**Hybrid CPU+GPU Execution:**

```typescript
// Calibrate for optimal CPU/GPU split
const calibration = await calibrate(10000);
console.log(`Optimal GPU ratio: ${calibration.optimalSplit}`);

// Use hybrid execution
const result = await hybridMsm(scalars, points, BN254_CURVE, {
  splitRatio: calibration.optimalSplit,
});
```

---

### Number Theoretic Transform (NTT)

NTT is used for polynomial multiplication in ZK proofs. Input length must be a power of 2.

```typescript
import {
  forwardNtt,
  inverseNtt,
  batchForwardNtt,
  batchInverseNtt,
  createNTTEngine,
  
  // Radix-specific
  forwardNttRadix2,
  forwardNttRadix4,
} from '@digitaldefiance/node-zk-accelerate';
```

**Basic Usage:**

```typescript
// Forward NTT
const transformed = forwardNtt(coefficients);

// Inverse NTT
const recovered = inverseNtt(transformed);

// Round-trip property: recovered ≈ coefficients
```

**NTT Options:**

```typescript
const transformed = forwardNtt(coefficients, {
  radix: 2,                   // 2 or 4 (radix-4 is faster for large inputs)
  inPlace: false,             // Modify input array in place
  accelerationHint: 'auto',   // 'cpu', 'gpu', or 'auto'
});
```

**Batch NTT:**

```typescript
// Process multiple polynomials efficiently
const polynomials = [poly1, poly2, poly3];
const transformed = batchForwardNtt(polynomials);
const recovered = batchInverseNtt(transformed);
```

**Reusable NTT Engine:**

```typescript
// Create engine with precomputed twiddle factors
const engine = createNTTEngine(1024, BN254_FIELD);

// Reuse for multiple transforms (faster)
const result1 = engine.forward(poly1);
const result2 = engine.forward(poly2);
const inverse1 = engine.inverse(result1);
```

---

### Hardware Detection

```typescript
import {
  detectHardwareCapabilities,
  getHardwareCapabilitiesSummary,
  hasHardwareAcceleration,
  clearHardwareCapabilitiesCache,
  getHardwareDetectionStatus,
} from '@digitaldefiance/node-zk-accelerate';
```

**Detect Capabilities:**

```typescript
const caps = detectHardwareCapabilities();
// {
//   hasNeon: true,              // ARM SIMD
//   hasAmx: true,               // Apple Matrix Coprocessor
//   hasSme: false,              // Scalable Matrix Extension (M4+)
//   hasMetal: true,             // Metal GPU
//   metalDeviceName: 'Apple M4 Max',
//   metalMaxThreadsPerGroup: 1024,
//   unifiedMemory: true,
//   cpuCores: 16,
//   gpuCores: 40
// }

// Human-readable summary
console.log(getHardwareCapabilitiesSummary());
// Hardware Capabilities:
//   CPU: 16 cores
//   NEON SIMD: ✓
//   AMX: ✓
//   SME: ✗
//   Metal GPU: ✓ (Apple M4 Max, ~40 cores)
//   Unified Memory: ✓

// Quick check
if (hasHardwareAcceleration()) {
  console.log('Hardware acceleration available');
}
```

---

### snarkjs Integration

Drop-in acceleration for snarkjs Groth16 and PLONK provers.

```typescript
import {
  // Provers
  groth16Prove,
  groth16ProveSync,
  plonkProve,
  plonkProveSync,
  
  // File parsers
  parseZkey,
  parseWtns,
  parseR1cs,
  
  // Proof utilities
  exportProofToJson,
  importProofFromJson,
  groth16Verify,
} from '@digitaldefiance/node-zk-accelerate';
```

**Groth16 Proving:**

```typescript
// Async (recommended)
const { proof, publicSignals } = await groth16Prove(zkeyBuffer, wtnsBuffer, {
  accelerated: true,    // Use hardware acceleration
  validateInputs: true, // Validate inputs
  logTiming: true,      // Log timing breakdown
});

// Sync version
const result = groth16ProveSync(zkeyBuffer, wtnsBuffer);

// Export to snarkjs format
const snarkjsProof = exportProofToJson(proof);
```

**PLONK Proving:**

```typescript
const { proof, publicSignals } = await plonkProve(zkeyBuffer, wtnsBuffer, {
  accelerated: true,
  logTiming: true,
});
```

**File Parsing:**

```typescript
// Parse zkey
const zkeyData = parseZkey(zkeyBuffer);
console.log(`Protocol: ${zkeyData.header.protocol}`);  // 'groth16' or 'plonk'
console.log(`Curve: ${zkeyData.header.curve}`);        // 'BN254' or 'BLS12_381'

// Parse witness
const wtnsData = parseWtns(wtnsBuffer);
console.log(`Witness values: ${wtnsData.witness.length}`);

// Parse R1CS
const r1csData = parseR1cs(r1csBuffer);
console.log(`Constraints: ${r1csData.nConstraints}`);
```

---

### Arkworks Compatibility

Serialize/deserialize in Arkworks-compatible format for Rust interoperability.

```typescript
import {
  serializeArkworksPoint,
  deserializeArkworksPoint,
  serializeArkworksFieldElement,
  deserializeArkworksFieldElement,
} from '@digitaldefiance/node-zk-accelerate';

// Serialize point to Arkworks format
const arkworksBytes = serializeArkworksPoint(point, BN254_CURVE);

// Deserialize from Arkworks format
const point = deserializeArkworksPoint(arkworksBytes, BN254_CURVE);
```

---

### Benchmarking

```typescript
import {
  runQuickBenchmarkMode,
  runBenchmarkSuite,
  runMsmBenchmarks,
  runNttBenchmarks,
  getHardwareReport,
  QUICK_BENCHMARK_CONFIG,
  FULL_BENCHMARK_CONFIG,
} from '@digitaldefiance/node-zk-accelerate';

// Quick benchmark (~60 seconds)
const quick = await runQuickBenchmarkMode();
console.log(`MSM speedup: ${quick.msmSpeedup}x`);

// Full benchmark suite
const results = await runBenchmarkSuite({
  msm: FULL_BENCHMARK_CONFIG,
  ntt: FULL_BENCHMARK_CONFIG,
});

// Hardware report
const report = getHardwareReport();
console.log(`Recommended accelerator: ${report.recommendedAccelerator}`);
```

---

### Validation

```typescript
import {
  validateFieldElement,
  validateCurvePoint,
  validateMsmInputsComprehensive,
  validateNttInputComprehensive,
  withoutValidation,
  setValidationConfig,
} from '@digitaldefiance/node-zk-accelerate';

// Validate inputs manually
validateFieldElement(element);
validateCurvePoint(point, BN254_CURVE);

// Disable validation for performance
setValidationConfig({ enabled: false });

// Or temporarily disable
const result = withoutValidation(() => {
  return msm(scalars, points, BN254_CURVE);
});
```

---

### WASM Fallback

```typescript
import {
  isWasmAvailable,
  getWasmStatus,
  setForceWasmMode,
  executeWithWasmFallback,
} from '@digitaldefiance/node-zk-accelerate';

// Check WASM availability
if (isWasmAvailable()) {
  console.log('WASM fallback available');
}

// Force WASM mode (for testing)
setForceWasmMode(true);

// Or via environment variable
// ZK_ACCELERATE_FORCE_WASM=1 node app.js
```

## Performance Expectations

Benchmarks on Apple M4 Max (16 CPU cores, 40 GPU cores):

| Operation | Input Size | WASM Baseline | Accelerated | Speedup |
|-----------|------------|---------------|-------------|---------|
| MSM       | 2^16       | 2,500ms       | 180ms       | 13.9x   |
| MSM       | 2^20       | 45,000ms      | 3,200ms     | 14.1x   |
| NTT       | 2^16       | 450ms         | 65ms        | 6.9x    |
| NTT       | 2^20       | 8,500ms       | 1,100ms     | 7.7x    |

Performance varies based on:
- Hardware generation (M1 < M2 < M3 < M4)
- Available GPU cores
- Input size (GPU benefits larger inputs)
- Memory bandwidth

## Supported Curves

- **BN254** (alt_bn128) - Used in Ethereum, most ZK-SNARKs
- **BLS12-381** - 128-bit security, used in Zcash, Ethereum 2.0

## Error Handling

```typescript
import {
  ZkAccelerateError,
  ErrorCode,
  isZkAccelerateError,
} from '@digitaldefiance/node-zk-accelerate';

try {
  const result = msm(scalars, points, BN254_CURVE);
} catch (error) {
  if (isZkAccelerateError(error)) {
    switch (error.code) {
      case ErrorCode.INVALID_CURVE_POINT:
        console.error('Invalid point:', error.details);
        break;
      case ErrorCode.ARRAY_LENGTH_MISMATCH:
        console.error('Array lengths must match');
        break;
      default:
        console.error('ZK error:', error.message);
    }
  }
}
```

## Documentation

- [snarkjs Integration Guide](./docs/snarkjs-integration.md) - Accelerate existing snarkjs workflows
- [Hardware Utilization Guide](./docs/hardware-utilization.md) - Understand which hardware is used
- [Benchmarking Guide](./docs/benchmarking.md) - Run and interpret benchmarks

## Environment Variables

- `ZK_ACCELERATE_DEBUG=1` - Enable debug logging
- `ZK_ACCELERATE_FORCE_WASM=1` - Force WASM fallback (for testing)

## License

MIT © Digital Defiance

## Related Projects

- [@digitaldefiance/node-fhe-accelerate](https://github.com/digitaldefiance/node-fhe-accelerate) - FHE acceleration library (shared components)
