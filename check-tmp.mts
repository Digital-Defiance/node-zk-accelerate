import { getMetalGPU } from './src/gpu-accelerate/metal.js';
import { msmGPU } from './src/gpu-accelerate/msm-gpu.js';
import { forwardNttGPU } from './src/gpu-accelerate/ntt-gpu.js';
import { BN254_CURVE } from './src/curve/config.js';
import { BN254_SCALAR_FIELD } from './src/field/config.js';
import { createNTTConfig } from './src/ntt/config.js';
import { createFieldElement } from './src/field/element.js';
import { scalarMul } from './src/curve/operations.js';

const metal = getMetalGPU();
console.log('before init, isAvailable =', metal.isAvailable());
console.log('init() =', metal.init());
console.log('after init, isAvailable =', metal.isAvailable());
console.log('status =', JSON.stringify(metal.getStatus()));

const g = BN254_CURVE.generator;
const pts = [1n, 2n, 3n].map((k) => scalarMul(k, g, BN254_CURVE));
try {
  const r = await msmGPU([3n, 5n, 7n], pts, BN254_CURVE);
  console.log('!!! msmGPU RESOLVED', JSON.stringify(r.usedGPU));
} catch (e) {
  console.log('msmGPU rejected:', (e as Error).message.slice(0, 120));
}

const config = createNTTConfig(8, BN254_SCALAR_FIELD);
const coeffs = Array.from({ length: 8 }, (_, i) => createFieldElement(BigInt(i + 1), BN254_SCALAR_FIELD));
try {
  const r = await forwardNttGPU(coeffs, config.twiddles);
  console.log('!!! forwardNttGPU RESOLVED usedGPU =', r.usedGPU);
} catch (e) {
  console.log('forwardNttGPU rejected:', (e as Error).message.slice(0, 120));
}
