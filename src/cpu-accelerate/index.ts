/**
 * CPU Acceleration Layer
 *
 * Provides TypeScript interfaces to native CPU acceleration features:
 * - vDSP vector operations (Apple Accelerate)
 * - BLAS matrix operations (AMX acceleration)
 * - NEON SIMD operations
 * - SME matrix operations (M4 experimental)
 *
 * Requirements: 6.2, 6.4, 6.5, 6.6, 1.4
 */

export type { VDSPOperations } from './vdsp.js';
export { createVDSPOperations } from './vdsp.js';
export type { BLASOperations } from './blas.js';
export { createBLASOperations } from './blas.js';
export type { NEONOperations } from './neon.js';
export { createNEONOperations } from './neon.js';
export type { SMEOperations } from './sme.js';
export { createSMEOperations } from './sme.js';
export type { CPUAcceleratorStatus } from './status.js';
export { getCPUAcceleratorStatus, isCPUAccelerationAvailable } from './status.js';
