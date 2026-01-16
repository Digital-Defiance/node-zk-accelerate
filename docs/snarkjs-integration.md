# snarkjs Integration Guide

This guide explains how to accelerate your existing snarkjs workflows using `@digitaldefiance/node-zk-accelerate`.

## Overview

snarkjs is a popular JavaScript library for ZK-SNARK proof generation and verification. While snarkjs uses WebAssembly for cryptographic operations, `node-zk-accelerate` provides hardware-accelerated alternatives that can achieve 10x+ speedups on Apple Silicon.

## Installation

```bash
npm install @digitaldefiance/node-zk-accelerate snarkjs
```

## Quick Migration

### Before (Pure snarkjs)

```typescript
import * as snarkjs from 'snarkjs';
import fs from 'fs';

// Load circuit artifacts
const zkey = fs.readFileSync('circuit.zkey');
const wasm = fs.readFileSync('circuit.wasm');

// Generate witness
const input = { a: 3, b: 5 };
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  'circuit.wasm',
  'circuit.zkey'
);

// Verify
const vkey = JSON.parse(fs.readFileSync('verification_key.json', 'utf8'));
const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
```

### After (Accelerated)

```typescript
import { groth16Prove, parseZkey, parseWtns } from '@digitaldefiance/node-zk-accelerate';
import * as snarkjs from 'snarkjs';
import fs from 'fs';

// Load circuit artifacts
const zkeyBuffer = fs.readFileSync('circuit.zkey');

// Generate witness using snarkjs (still needed for circuit execution)
const input = { a: 3, b: 5 };
const wtnsBuffer = await generateWitness(input, 'circuit.wasm');

// Generate proof with hardware acceleration
const { proof, publicSignals } = await groth16Prove(zkeyBuffer, wtnsBuffer, {
  accelerated: true,
  logTiming: true,  // Optional: see timing breakdown
});

// Verify using snarkjs (verification is already fast)
const vkey = JSON.parse(fs.readFileSync('verification_key.json', 'utf8'));
const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

// Helper function to generate witness
async function generateWitness(input: object, wasmPath: string): Promise<Uint8Array> {
  const wtns = { type: 'mem' };
  await snarkjs.wtns.calculate(input, wasmPath, wtns);
  return wtns.data;
}
```

## Complete Example: Groth16 Workflow

```typescript
import {
  groth16Prove,
  exportProofToJson,
  parseZkey,
  parseWtns,
  detectHardwareCapabilities,
} from '@digitaldefiance/node-zk-accelerate';
import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';

async function acceleratedGroth16Workflow() {
  // Check hardware capabilities
  const caps = detectHardwareCapabilities();
  console.log('Hardware capabilities:');
  console.log(`  NEON: ${caps.hasNeon}`);
  console.log(`  AMX: ${caps.hasAmx}`);
  console.log(`  Metal GPU: ${caps.hasMetal}`);
  if (caps.metalDeviceName) {
    console.log(`  GPU: ${caps.metalDeviceName}`);
  }

  // Paths to circuit artifacts
  const circuitDir = './circuits/multiplier';
  const wasmPath = path.join(circuitDir, 'multiplier.wasm');
  const zkeyPath = path.join(circuitDir, 'multiplier.zkey');
  const vkeyPath = path.join(circuitDir, 'verification_key.json');

  // Circuit inputs
  const input = {
    a: 3,
    b: 11,
  };

  console.log('\n1. Generating witness...');
  const witnessStart = Date.now();
  
  // Generate witness using snarkjs
  const wtns = { type: 'mem' } as { type: string; data?: Uint8Array };
  await snarkjs.wtns.calculate(input, wasmPath, wtns);
  const wtnsBuffer = wtns.data!;
  
  console.log(`   Witness generated in ${Date.now() - witnessStart}ms`);

  // Load zkey
  const zkeyBuffer = fs.readFileSync(zkeyPath);

  console.log('\n2. Generating proof (accelerated)...');
  const proveStart = Date.now();

  // Generate proof with hardware acceleration
  const { proof, publicSignals } = await groth16Prove(zkeyBuffer, wtnsBuffer, {
    accelerated: true,
    validateInputs: true,
    logTiming: true,
  });

  console.log(`   Proof generated in ${Date.now() - proveStart}ms`);

  // Convert proof to snarkjs-compatible format
  const snarkjsProof = exportProofToJson(proof);

  console.log('\n3. Verifying proof...');
  const verifyStart = Date.now();

  // Verify using snarkjs
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, snarkjsProof);

  console.log(`   Verification: ${valid ? 'VALID' : 'INVALID'} (${Date.now() - verifyStart}ms)`);

  return { proof: snarkjsProof, publicSignals, valid };
}

// Run the workflow
acceleratedGroth16Workflow()
  .then(result => {
    console.log('\nResult:', JSON.stringify(result, null, 2));
  })
  .catch(console.error);
```

## Complete Example: PLONK Workflow

```typescript
import {
  plonkProve,
  exportPlonkProofToJson,
  detectHardwareCapabilities,
} from '@digitaldefiance/node-zk-accelerate';
import * as snarkjs from 'snarkjs';
import fs from 'fs';

async function acceleratedPlonkWorkflow() {
  const caps = detectHardwareCapabilities();
  console.log(`Using ${caps.hasMetal ? 'GPU' : 'CPU'} acceleration`);

  // Load artifacts
  const zkeyBuffer = fs.readFileSync('circuit_plonk.zkey');
  
  // Generate witness
  const input = { x: 5, y: 7 };
  const wtns = { type: 'mem' } as { type: string; data?: Uint8Array };
  await snarkjs.wtns.calculate(input, 'circuit.wasm', wtns);

  // Generate accelerated PLONK proof
  const { proof, publicSignals } = await plonkProve(zkeyBuffer, wtns.data!, {
    accelerated: true,
    logTiming: true,
  });

  // Convert to snarkjs format for verification
  const snarkjsProof = exportPlonkProofToJson(proof);

  // Verify
  const vkey = JSON.parse(fs.readFileSync('verification_key.json', 'utf8'));
  const valid = await snarkjs.plonk.verify(vkey, publicSignals, snarkjsProof);

  return { valid, publicSignals };
}
```

## File Parsing

The library includes parsers for snarkjs file formats:

```typescript
import {
  parseZkey,
  parseWtns,
  parseR1cs,
} from '@digitaldefiance/node-zk-accelerate';

// Parse zkey file
const zkeyBuffer = fs.readFileSync('circuit.zkey');
const zkeyData = parseZkey(zkeyBuffer);

console.log('Zkey info:');
console.log(`  Protocol: ${zkeyData.header.protocol}`);  // 'groth16' or 'plonk'
console.log(`  Curve: ${zkeyData.header.curve}`);        // 'BN254' or 'BLS12_381'
console.log(`  Variables: ${zkeyData.provingKey.nVars}`);
console.log(`  Public inputs: ${zkeyData.provingKey.nPublic}`);

// Parse witness file
const wtnsBuffer = fs.readFileSync('witness.wtns');
const wtnsData = parseWtns(wtnsBuffer);

console.log('Witness info:');
console.log(`  Values: ${wtnsData.witness.length}`);

// Parse R1CS file
const r1csBuffer = fs.readFileSync('circuit.r1cs');
const r1csData = parseR1cs(r1csBuffer);

console.log('R1CS info:');
console.log(`  Constraints: ${r1csData.nConstraints}`);
console.log(`  Variables: ${r1csData.nVars}`);
```

## Performance Comparison

Here's how to benchmark the acceleration:

```typescript
import {
  groth16Prove,
  runBaselineComparison,
} from '@digitaldefiance/node-zk-accelerate';
import * as snarkjs from 'snarkjs';

async function benchmarkComparison() {
  const zkeyBuffer = fs.readFileSync('circuit.zkey');
  const wtnsBuffer = fs.readFileSync('witness.wtns');
  const iterations = 5;

  // Benchmark accelerated version
  console.log('Benchmarking accelerated prover...');
  const acceleratedTimes: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await groth16Prove(zkeyBuffer, wtnsBuffer, { accelerated: true });
    acceleratedTimes.push(Date.now() - start);
  }

  // Benchmark snarkjs baseline
  console.log('Benchmarking snarkjs baseline...');
  const baselineTimes: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await snarkjs.groth16.prove('circuit.zkey', 'witness.wtns');
    baselineTimes.push(Date.now() - start);
  }

  // Calculate statistics
  const avgAccelerated = acceleratedTimes.reduce((a, b) => a + b) / iterations;
  const avgBaseline = baselineTimes.reduce((a, b) => a + b) / iterations;
  const speedup = avgBaseline / avgAccelerated;

  console.log('\nResults:');
  console.log(`  Accelerated: ${avgAccelerated.toFixed(1)}ms avg`);
  console.log(`  Baseline: ${avgBaseline.toFixed(1)}ms avg`);
  console.log(`  Speedup: ${speedup.toFixed(1)}x`);
}
```

## Configuration Options

### Groth16 Prover Options

```typescript
interface Groth16ProverOptions {
  // Use hardware acceleration (default: true)
  accelerated?: boolean;
  
  // Validate inputs before proving (default: true)
  validateInputs?: boolean;
  
  // Log timing breakdown (default: false)
  logTiming?: boolean;
}
```

### PLONK Prover Options

```typescript
interface PlonkProverOptions {
  // Use hardware acceleration (default: true)
  accelerated?: boolean;
  
  // Validate inputs before proving (default: true)
  validateInputs?: boolean;
  
  // Log timing breakdown (default: false)
  logTiming?: boolean;
}
```

## Troubleshooting

### "Native binding not available"

The library falls back to WASM when native bindings aren't available. To enable native acceleration:

```bash
# Ensure Xcode Command Line Tools are installed
xcode-select --install

# Rebuild native modules
npm rebuild @digitaldefiance/node-zk-accelerate
```

### "Invalid zkey format"

Ensure your zkey file was generated with a compatible version of snarkjs:

```bash
# Check snarkjs version
npx snarkjs --version

# Regenerate zkey if needed
npx snarkjs groth16 setup circuit.r1cs pot_final.ptau circuit.zkey
```

### Performance Not as Expected

1. Check hardware capabilities:
```typescript
import { detectHardwareCapabilities, getHardwareCapabilitiesSummary } from '@digitaldefiance/node-zk-accelerate';
console.log(getHardwareCapabilitiesSummary());
```

2. Ensure you're using a large enough circuit (GPU acceleration benefits larger inputs)

3. Enable timing logs to identify bottlenecks:
```typescript
const result = await groth16Prove(zkey, wtns, { logTiming: true });
```

## API Reference

### groth16Prove

```typescript
function groth16Prove(
  zkey: ZkeyData | Uint8Array | ArrayBuffer,
  wtns: WitnessData | Uint8Array | ArrayBuffer,
  options?: Groth16ProverOptions
): Promise<ProofResult>
```

### plonkProve

```typescript
function plonkProve(
  zkey: ZkeyData | Uint8Array | ArrayBuffer,
  wtns: WitnessData | Uint8Array | ArrayBuffer,
  options?: PlonkProverOptions
): Promise<ProofResult>
```

### parseZkey

```typescript
function parseZkey(data: Uint8Array | ArrayBuffer): ZkeyData
```

### parseWtns

```typescript
function parseWtns(data: Uint8Array | ArrayBuffer): WitnessData
```

### parseR1cs

```typescript
function parseR1cs(data: Uint8Array | ArrayBuffer): R1csData
```

## Next Steps

- See the [Hardware Utilization Guide](./hardware-utilization.md) for details on which operations use which hardware
- See the [Benchmarking Guide](./benchmarking.md) for comprehensive performance testing
- Check the [README](../README.md) for general library usage
