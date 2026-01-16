# Hardware Utilization Guide

This guide explains which hardware acceleration features are used by different operations in `@digitaldefiance/node-zk-accelerate`.

## Hardware Overview

Apple Silicon chips provide multiple acceleration units:

| Unit | Description | Available On |
|------|-------------|--------------|
| **NEON** | 128-bit SIMD vector operations | All ARM64 |
| **AMX** | Apple Matrix Coprocessor (via Accelerate) | M1+ |
| **SME** | Scalable Matrix Extension | M4+ |
| **Metal GPU** | Parallel compute shaders | All Apple Silicon |
| **Unified Memory** | Zero-copy CPU/GPU sharing | All Apple Silicon |

## Detecting Hardware Capabilities

```typescript
import {
  detectHardwareCapabilities,
  getHardwareCapabilitiesSummary,
  hasHardwareAcceleration,
} from '@digitaldefiance/node-zk-accelerate';

// Get detailed capabilities
const caps = detectHardwareCapabilities();
console.log(caps);
// {
//   hasNeon: true,
//   hasAmx: true,
//   hasSme: false,      // true on M4+
//   hasMetal: true,
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

## Operation-to-Hardware Mapping

### Multi-Scalar Multiplication (MSM)

MSM is the most compute-intensive operation (~70% of ZK proof time). The library uses different hardware based on input size:

| Input Size | Primary Hardware | Secondary | Notes |
|------------|------------------|-----------|-------|
| < 256 | CPU (NEON) | - | GPU overhead not worth it |
| 256 - 4096 | CPU (AMX/NEON) | - | Matrix accumulation |
| 4096 - 65536 | Hybrid (CPU+GPU) | AMX | Workload split |
| > 65536 | GPU (Metal) | CPU | GPU dominates |

**Hardware utilization in MSM:**
- **NEON**: Parallel Montgomery multiplication (4 limbs at once)
- **AMX/BLAS**: Bucket accumulation matrix operations
- **SME**: Enhanced matrix outer products (M4+)
- **Metal GPU**: Parallel bucket assignment and reduction

### Number Theoretic Transform (NTT)

NTT uses butterfly operations that benefit from vector and GPU parallelism:

| Input Size | Primary Hardware | Notes |
|------------|------------------|-------|
| < 1024 | CPU (NEON) | Small transforms |
| 1024 - 16384 | CPU (vDSP) | Vector operations |
| > 16384 | GPU (Metal) | Parallel butterflies |

**Hardware utilization in NTT:**
- **NEON**: Parallel field arithmetic in butterflies
- **vDSP**: Vector add/multiply operations
- **Metal GPU**: Massively parallel butterfly computation

### Field Arithmetic

Field operations use CPU acceleration:

| Operation | Hardware | Notes |
|-----------|----------|-------|
| Montgomery mul | NEON | 4-limb parallel |
| Batch inversion | NEON + AMX | Montgomery's trick |
| Field add/sub | NEON | Vector operations |

### Curve Operations

Point operations use CPU acceleration:

| Operation | Hardware | Notes |
|-----------|----------|-------|
| Point add | NEON | Field ops in Jacobian |
| Point double | NEON | Optimized formulas |
| Scalar mul | NEON + AMX | Windowed method |

## Configuration Options

### Global Acceleration Hint

```typescript
import { configure } from '@digitaldefiance/node-zk-accelerate';

// Force CPU-only (useful for debugging)
configure({ accelerationHint: 'cpu' });

// Force GPU (may be slower for small inputs)
configure({ accelerationHint: 'gpu' });

// Hybrid CPU+GPU (best for large inputs)
configure({ accelerationHint: 'hybrid' });

// Automatic selection (default, recommended)
configure({ accelerationHint: 'auto' });
```

### Per-Operation Hints

```typescript
import { msm, forwardNtt } from '@digitaldefiance/node-zk-accelerate';

// MSM with specific acceleration
const result = msm(scalars, points, curve, {
  accelerationHint: 'gpu',
  gpuThreshold: 2048,  // Override default threshold
});

// NTT with specific acceleration
const transformed = forwardNtt(coefficients, {
  accelerationHint: 'cpu',
});
```

### GPU Threshold Configuration

```typescript
import { configure } from '@digitaldefiance/node-zk-accelerate';

// Set minimum points for GPU dispatch
configure({
  gpuThreshold: 4096,  // Default: 1024
});
```

## Hybrid Execution

For large MSM operations, the library can split work between CPU and GPU:

```typescript
import {
  hybridMsm,
  calibrate,
  getCachedCalibration,
} from '@digitaldefiance/node-zk-accelerate';

// Run calibration to find optimal split ratio
const calibration = await calibrate(10000);  // Sample size
console.log(`Optimal split: ${calibration.optimalSplit * 100}% GPU`);
console.log(`CPU time: ${calibration.cpuTime}ms`);
console.log(`GPU time: ${calibration.gpuTime}ms`);

// Use hybrid execution with calibrated split
const result = await hybridMsm(scalars, points, curve, {
  splitRatio: calibration.optimalSplit,
});

// Or let the library use cached calibration
const autoResult = await hybridMsm(scalars, points, curve);
```

## Fallback Behavior

The library gracefully falls back when hardware is unavailable:

```
GPU unavailable → CPU (AMX/NEON)
AMX unavailable → CPU (NEON)
NEON unavailable → WASM
WASM unavailable → Pure JavaScript
```

### Checking Fallback Status

```typescript
import {
  getWasmStatus,
  isWasmAvailable,
  getNativeBindingStatus,
} from '@digitaldefiance/node-zk-accelerate';

// Check native binding status
const nativeStatus = getNativeBindingStatus();
console.log(`C++ binding: ${nativeStatus.cppLoaded}`);
console.log(`Rust binding: ${nativeStatus.rustLoaded}`);

// Check WASM fallback
const wasmStatus = getWasmStatus();
console.log(`WASM available: ${wasmStatus.available}`);
```

### Forcing WASM Mode

For testing or compatibility:

```typescript
import { setForceWasmMode } from '@digitaldefiance/node-zk-accelerate';

// Force WASM for all operations
setForceWasmMode(true);

// Or via environment variable
// ZK_ACCELERATE_FORCE_WASM=1 node app.js
```

## Performance by Hardware Generation

Expected speedups vs WASM baseline:

| Chip | MSM Speedup | NTT Speedup | Notes |
|------|-------------|-------------|-------|
| M1 | 6-8x | 4-5x | Base Apple Silicon |
| M1 Pro/Max | 8-10x | 5-6x | More GPU cores |
| M2 | 8-10x | 5-6x | Improved efficiency |
| M2 Pro/Max | 10-12x | 6-7x | More GPU cores |
| M3 | 10-12x | 6-7x | Better GPU |
| M3 Pro/Max | 12-14x | 7-8x | More GPU cores |
| M4 | 12-15x | 7-8x | SME support |
| M4 Pro/Max | 14-18x | 8-10x | SME + more cores |

## Monitoring Hardware Utilization

### Timing Breakdown

```typescript
import { groth16Prove } from '@digitaldefiance/node-zk-accelerate';

const result = await groth16Prove(zkey, wtns, {
  logTiming: true,
});
// [Groth16] Setup: 5ms
// [Groth16] Point conversion: 12ms
// [Groth16] MSM A (65536 points): 180ms
// [Groth16] MSM B1 (65536 points): 175ms
// [Groth16] MSM C (32768 points): 95ms
// [Groth16] MSM H (65535 points): 178ms
// [Groth16] Total: 645ms
```

### Hardware Report

```typescript
import { getHardwareReport } from '@digitaldefiance/node-zk-accelerate';

const report = getHardwareReport();
console.log(report);
// {
//   capabilities: { ... },
//   nativeBindings: { cppLoaded: true, rustLoaded: true },
//   recommendedAccelerator: 'hybrid',
//   estimatedSpeedup: { msm: 14.2, ntt: 7.8 }
// }
```

### Power Estimation

```typescript
import { estimatePowerConsumption } from '@digitaldefiance/node-zk-accelerate';

const power = estimatePowerConsumption('msm', 65536);
console.log(`Estimated power: ${power.watts}W`);
console.log(`Estimated energy: ${power.joules}J`);
```

## Best Practices

### 1. Let the Library Choose

The automatic acceleration selection is well-tuned:

```typescript
// Recommended: let the library decide
const result = msm(scalars, points, curve);

// Only override if you have specific requirements
const gpuResult = msm(scalars, points, curve, { accelerationHint: 'gpu' });
```

### 2. Batch Operations

Batching amortizes GPU dispatch overhead:

```typescript
// Better: batch multiple MSMs
const results = batchMsm([
  { scalars: s1, points: p1 },
  { scalars: s2, points: p2 },
  { scalars: s3, points: p3 },
], curve);

// Worse: individual MSMs
const r1 = msm(s1, p1, curve);
const r2 = msm(s2, p2, curve);
const r3 = msm(s3, p3, curve);
```

### 3. Calibrate for Your Hardware

Run calibration once to optimize hybrid execution:

```typescript
import { calibrate, applyCalibration } from '@digitaldefiance/node-zk-accelerate';

// Run once at startup
const calibration = await calibrate(50000);
applyCalibration(calibration);

// All subsequent hybrid operations use optimal split
```

### 4. Monitor Performance

Use timing logs during development:

```typescript
// Enable debug logging
process.env.ZK_ACCELERATE_DEBUG = '1';

// Or per-operation timing
const result = await groth16Prove(zkey, wtns, { logTiming: true });
```

## Troubleshooting

### GPU Not Being Used

1. Check if Metal is available:
```typescript
const caps = detectHardwareCapabilities();
console.log(`Metal: ${caps.hasMetal}`);
```

2. Check input size (GPU needs larger inputs):
```typescript
// GPU threshold default is 1024
configure({ gpuThreshold: 512 });  // Lower threshold
```

3. Check acceleration hint:
```typescript
const result = msm(scalars, points, curve, {
  accelerationHint: 'gpu',  // Force GPU
});
```

### Performance Lower Than Expected

1. Check hardware generation:
```typescript
console.log(getHardwareCapabilitiesSummary());
```

2. Ensure native bindings are loaded:
```typescript
const status = getNativeBindingStatus();
if (!status.cppLoaded && !status.rustLoaded) {
  console.log('Using WASM fallback - rebuild native modules');
}
```

3. Run calibration:
```typescript
const cal = await calibrate(10000);
console.log(`Optimal split: ${cal.optimalSplit}`);
```

## Next Steps

- See the [Benchmarking Guide](./benchmarking.md) for performance testing
- See the [snarkjs Integration Guide](./snarkjs-integration.md) for proof generation
- Check the [README](../README.md) for general usage
