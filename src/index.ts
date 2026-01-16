/**
 * @digitaldefiance/node-zk-accelerate
 *
 * Zero-Knowledge Proof acceleration library for Node.js
 * maximizing Apple Silicon M4 Max hardware utilization.
 *
 * This library provides hardware-accelerated implementations of:
 * - Multi-Scalar Multiplication (MSM)
 * - Number Theoretic Transform (NTT)
 * - Finite field arithmetic
 * - Elliptic curve operations
 *
 * Supported curves: BN254, BLS12-381
 *
 * @example
 * ```typescript
 * import {
 *   createFieldElement,
 *   createAffinePoint,
 *   msm,
 *   forwardNtt,
 *   BN254_CURVE,
 * } from '@digitaldefiance/node-zk-accelerate';
 *
 * // Create field elements
 * const a = createFieldElement(123n);
 * const b = createFieldElement(456n);
 *
 * // Perform MSM
 * const scalars = [1n, 2n, 3n];
 * const points = [point1, point2, point3];
 * const result = msm(scalars, points, BN254_CURVE);
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Public API - Factory functions and configuration
// ============================================================================
export {
  // Configuration
  configure,
  getConfig,
  resetConfig,
  type ZkAccelerateConfig,

  // Field element factory functions
  createFieldElement,
  createZero,
  createOne,
  type FieldElementInput,
  type CreateFieldElementOptions,

  // Curve point factory functions
  createAffinePoint,
  createJacobianPoint,
  createProjectivePoint,
  createIdentity,
  getGenerator,
  createScalar,
  type CreatePointOptions,

  // Field configurations
  BN254_FIELD,
  BLS12_381_FIELD,
  BN254_SCALAR_FIELD,
  BLS12_381_SCALAR_FIELD,
  getFieldConfig,

  // Field element utilities
  getFieldElementValue,
  isZeroFieldElement,
  isOneFieldElement,
  fieldElementsEqual,
  cloneFieldElement,

  // Field arithmetic
  fieldAdd,
  fieldSub,
  fieldMul,
  fieldNeg,
  fieldInv,
  fieldDiv,
  fieldSquare,
  fieldPow,
  batchInv,
  batchMul,
  batchAdd,

  // Field serialization
  fieldElementToBytes,
  fieldElementFromBytes,

  // Curve configurations
  BN254_CURVE,
  BLS12_381_CURVE,
  getCurveConfig,
  getIdentityPoint,

  // Point utilities
  toAffine,
  toJacobian,
  toProjective,
  isIdentity,
  isAffinePoint,
  isJacobianPoint,
  isProjectivePoint,
  curvePointsEqual,
  affinePointsEqual,
  jacobianPointsEqual,

  // Curve operations
  pointAdd,
  pointDouble,
  pointNegate,
  scalarMul,
  scalarMulWindowed,
  isOnCurve,
  validateCurvePoint,

  // Point compression
  compressPoint,
  decompressPoint,

  // MSM operations
  msm,
  msmAsync,
  batchMsm,
  msmNaive,
  msmWithMetadata,
  msmAsyncWithMetadata,

  // NTT operations
  forwardNtt,
  inverseNtt,
  forwardNttWithConfig,
  inverseNttWithConfig,
  createNTTEngine,
  batchForwardNtt,
  batchInverseNtt,

  // Hardware detection
  detectHardwareCapabilities,
} from './api.js';

// ============================================================================
// Core types
// ============================================================================
export type {
  FieldConfig,
  FieldElement,
  AffinePoint,
  JacobianPoint,
  ProjectivePoint,
  CurvePoint,
  CurveConfig,
  Scalar,
  MSMOptions,
  NTTOptions,
  CurveName,
  Endianness,
} from './types.js';

// ============================================================================
// Hardware detection (additional exports)
// ============================================================================
export {
  clearHardwareCapabilitiesCache,
  getHardwareCapabilitiesSummary,
  hasHardwareAcceleration,
  getHardwareDetectionStatus,
  type HardwareCapabilities,
} from './hardware.js';

// ============================================================================
// Error handling
// ============================================================================
export {
  ZkAccelerateError,
  ErrorCode,
  isZkAccelerateError,
  // Error factory functions
  invalidCurvePointError,
  invalidFieldElementError,
  invalidScalarError,
  arrayLengthMismatchError,
  invalidInputSizeError,
  emptyInputError,
  fieldMismatchError,
  divisionByZeroError,
  metalUnavailableError,
  nativeBindingError,
  unsupportedCurveError,
  serializationError,
  unsupportedNttSizeError,
  invalidConfigError,
  internalError,
} from './errors.js';

// ============================================================================
// Validation utilities
// ============================================================================
export {
  // Configuration
  type ValidationConfig,
  getValidationConfig,
  setValidationConfig,
  resetValidationConfig,
  withoutValidation,
  isValidationEnabled,
  // Field validation
  validateFieldValue,
  validateFieldElement,
  validateSameField,
  validateFieldElementArray,
  validateNonZeroFieldElement,
  // Curve point validation (renamed to avoid conflict)
  validateCurvePoint as validateCurvePointStrict,
  validateCurvePointArray,
  // Scalar validation (renamed to avoid conflict)
  validateScalar as validateScalarStrict,
  validateScalarArray,
  // Array validation
  validateArrayLengthsMatch,
  validateNonEmptyArray,
  // MSM validation
  validateMsmInputsComprehensive,
  // NTT validation (renamed to avoid conflict)
  isPowerOfTwo as isPowerOfTwoValidation,
  nextPowerOfTwo as nextPowerOfTwoValidation,
  validatePowerOfTwo,
  validateNttInputComprehensive,
  // Serialization validation
  validateByteArrayLength,
  validateDeserializedFieldValue,
} from './validation.js';

// ============================================================================
// Native binding utilities
// ============================================================================
export {
  getNativeBindingStatus,
  hasNativeBinding,
  hasCppBinding,
  hasRustBinding,
  type NativeBindingStatus,
} from './native.js';

// ============================================================================
// CPU Acceleration
// ============================================================================
export {
  createVDSPOperations,
  createBLASOperations,
  createNEONOperations,
  createSMEOperations,
  getCPUAcceleratorStatus,
  isCPUAccelerationAvailable,
  type VDSPOperations,
  type BLASOperations,
  type NEONOperations,
  type SMEOperations,
  type CPUAcceleratorStatus,
} from './cpu-accelerate/index.js';

// ============================================================================
// GPU Acceleration
// ============================================================================
export {
  MetalGPU,
  getMetalGPU,
  isMetalAvailable,
  getMetalStatus,
  GPUAccelerator,
  getGPUAccelerator,
  msmGPU,
  msmGPUWithFallback,
  isGPUMSMAvailable,
  forwardNttGPU,
  inverseNttGPU,
  batchNttGPU,
  forwardNttGPUWithFallback,
  isGPUNTTAvailable,
  FallbackReason,
  checkGPUAvailability,
  checkInputSizeForGPU,
  createFallbackFromError,
  executeWithGPUFallback,
  executeWithGPUFallbackSync,
  getFallbackReasonDescription,
  logFallbackStatus,
  type MetalGPUStatus,
  type GPUBuffer,
  type GPUPipeline,
  type GPUResult,
  type GPUAcceleratorStatus,
  type MSMGPUConfig,
  type MSMGPUResult,
  type NTTGPUConfig,
  type NTTGPUResult,
  type FallbackInfo,
} from './gpu-accelerate/index.js';

// ============================================================================
// MSM (additional exports)
// ============================================================================
export {
  type MSMResult,
} from './msm/msm.js';

export {
  pippengerMsm,
  naiveMsm,
} from './msm/pippenger.js';

export {
  validateMsmInputs,
  extractScalarValues,
} from './msm/validation.js';

export {
  selectAccelerationPath,
  createMsmConfig,
  type AccelerationPath,
  type RouterConfig,
} from './msm/router.js';

export {
  calculateOptimalWindowSize,
  getNumWindows,
  getBucketsPerWindow,
  getScalarBits,
  type MSMConfig,
  DEFAULT_MSM_CONFIG,
} from './msm/config.js';

export {
  hybridMsm,
  hybridMsmSync,
  hybridMsmWithFallback,
  calibrate,
  quickCalibrate,
  getCachedCalibration,
  clearCalibrationCache,
  applyCalibration,
  needsCalibration,
  calculateWorkloadSplit,
  getWorkloadSplitDescription,
  type HybridMSMOptions,
  type HybridMSMResult,
  type CalibrationResult,
  type WorkloadSplit,
  type WorkloadSplitConfig,
  type CalibrationConfig,
} from './msm/hybrid.js';

// ============================================================================
// NTT (additional exports)
// ============================================================================
export {
  type NTTConfig,
  createNTTConfig,
  getBN254NTTConfig,
  getBLS12381NTTConfig,
  clearNTTConfigCache,
  getMaxNTTSize,
  isNTTSizeSupported,
  findPrimitiveRoot,
  computeTwiddleFactors,
  forwardNttRadix2,
  inverseNttRadix2,
  nttRadix2,
  inttRadix2,
  nttRadix2InPlace,
  inttRadix2InPlace,
  forwardNttRadix4,
  inverseNttRadix4,
  nttRadix4,
  inttRadix4,
  nttRadix4InPlace,
  inttRadix4InPlace,
  batchNtt,
  batchForwardNttAsync,
  batchInverseNttAsync,
  validateNTTInput,
  validateNTTConfig,
  validateNTTSizeForField,
  validateRadix,
  isPowerOfTwo,
  nextPowerOfTwo,
  type NTTEngine,
} from './ntt/index.js';

// ============================================================================
// snarkjs integration
// ============================================================================
export * from './snarkjs/index.js';

// ============================================================================
// Arkworks compatibility
// ============================================================================
export * from './arkworks/index.js';

// ============================================================================
// Async API utilities
// ============================================================================
export {
  computeMsmAsync,
  computeBatchMsmAsync,
  msmPromise,
  batchMsmPromise,
  computeForwardNttAsync,
  computeInverseNttAsync,
  computeBatchForwardNttAsync,
  computeBatchInverseNttAsync,
  computeBatchInvAsync,
  withTiming,
  parallel,
  sequential,
  withRetry,
  withTimeout,
  type AsyncOperationResult,
} from './async.js';

// ============================================================================
// WASM Fallback
// ============================================================================
export {
  WasmFallback,
  getWasmFallback,
  isWasmAvailable,
  getWasmStatus,
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
  wasmPointAdd,
  wasmPointDouble,
  wasmScalarMul,
  wasmIsOnCurve,
  jacobianToAffine,
  wasmForwardNtt,
  wasmInverseNtt,
  wasmBatchNtt,
  wasmMsm,
  wasmMsmNaive,
  executeWithWasmFallback,
  executeWithWasmFallbackAsync,
  getWasmFallbackReasonDescription,
  setForceWasmMode,
  isForceWasmMode,
  WasmFallbackReason,
  type WasmStatus,
  type WasmFallbackInfo,
} from './wasm/index.js';

// ============================================================================
// Benchmarking Suite
// ============================================================================
export {
  // Types
  type BenchmarkOperation,
  type AcceleratorType,
  type BenchmarkResult,
  type HardwareUtilization,
  type BenchmarkConfig,
  type MSMBenchmarkConfig,
  type NTTBenchmarkConfig,
  type BenchmarkSuiteResult,
  type BenchmarkSummary,
  // Configs
  DEFAULT_MSM_BENCHMARK_CONFIG,
  DEFAULT_NTT_BENCHMARK_CONFIG,
  QUICK_BENCHMARK_CONFIG,
  FULL_BENCHMARK_CONFIG,
  // Runner
  runMsmBenchmarks,
  runNttBenchmarks,
  runBenchmarkSuite,
  runQuickBenchmark,
  exportBenchmarkResults,
  saveBenchmarkResults,
  loadBenchmarkResults,
  // Baseline comparison
  runBaselineComparison,
  simulateSnarkjsBaseline,
  calculateSpeedups,
  type BaselineComparisonResult,
  // Hardware reporting
  getHardwareReport,
  measureHardwareUtilization,
  estimatePowerConsumption,
  type HardwareReport,
  type PowerEstimate,
  // Quick benchmark
  runQuickBenchmarkMode,
  type QuickBenchmarkResult,
} from './benchmark/index.js';
