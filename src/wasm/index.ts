/**
 * @digitaldefiance/node-zk-accelerate
 * WASM Fallback Module
 *
 * This module provides WebAssembly-based fallback implementations
 * for core ZK operations when native bindings are unavailable.
 *
 * Requirements: 13.5, 13.7
 */

export {
  WasmFallback,
  getWasmFallback,
  isWasmAvailable,
  getWasmStatus,
  type WasmStatus,
} from './fallback.js';

export {
  wasmFieldAdd,
  wasmFieldSub,
  wasmFieldMul,
  wasmFieldInv,
  wasmFieldNeg,
  wasmBatchInv,
  wasmMontgomeryMul,
  wasmMontgomeryReduce,
  limbsToBigint,
  getFieldValue,
  createFieldElementFromBigint,
} from './field-ops.js';

export {
  wasmPointAdd,
  wasmPointDouble,
  wasmScalarMul,
  wasmIsOnCurve,
  jacobianToAffine,
} from './curve-ops.js';

export {
  wasmForwardNtt,
  wasmInverseNtt,
  wasmBatchNtt,
} from './ntt-ops.js';

export {
  wasmMsm,
  wasmMsmNaive,
} from './msm-ops.js';

export {
  executeWithWasmFallback,
  executeWithWasmFallbackAsync,
  getWasmFallbackReasonDescription,
  setForceWasmMode,
  isForceWasmMode,
  type WasmFallbackInfo,
  WasmFallbackReason,
} from './executor.js';
