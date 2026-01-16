# Implementation Plan: @digitaldefiance/node-zk-accelerate

## Overview

This implementation plan builds the ZK acceleration library incrementally, starting with core field arithmetic (reusing node-fhe-accelerate where possible), then curve operations, followed by MSM and NTT engines, and finally integration adapters. Each phase includes property-based tests to validate correctness before proceeding.

## Tasks

- [x] 1. Project Setup and Core Infrastructure
  - [x] 1.1 Initialize npm package with TypeScript configuration
    - Create package.json with name `@digitaldefiance/node-zk-accelerate`
    - Configure TypeScript with strict mode and ES2022 target
    - Set up ESLint and Prettier
    - Add @digitaldefiance/node-fhe-accelerate as dependency
    - _Requirements: 1.1, 1.6, 13.1_

  - [x] 1.2 Set up native binding infrastructure
    - Configure node-gyp for C/C++ compilation
    - Set up napi-rs for Rust components
    - Create binding.gyp with Apple framework linkage (Accelerate, Metal)
    - _Requirements: 13.1, 13.2_

  - [x] 1.3 Implement hardware capability detection
    - Create HardwareCapabilities interface and detection logic
    - Detect NEON, AMX, SME availability
    - Detect Metal GPU and query device capabilities
    - Log capabilities at debug level on initialization
    - _Requirements: 6.1, 6.7, 7.1, 7.7_

  - [x] 1.4 Set up testing infrastructure
    - Configure Vitest for unit and property tests
    - Add fast-check for property-based testing
    - Create test utilities and arbitrary generators
    - _Requirements: Testing Strategy_

- [x] 2. Finite Field Arithmetic
  - [x] 2.1 Implement field configuration for BN254 and BLS12-381
    - Define FieldConfig with modulus, Montgomery constants (R, R², R⁻¹)
    - Create BN254_FIELD and BLS12_381_FIELD constants
    - Implement field element creation from BigInt, bytes, hex string
    - _Requirements: 4.1, 14.2_

  - [x] 2.2 Implement core field operations (reuse from node-fhe-accelerate)
    - Import or wrap Montgomery multiplication from node-fhe-accelerate
    - Implement field_add, field_sub, field_neg
    - Implement field_mul using Montgomery multiplication
    - Implement field_inv using extended Euclidean algorithm
    - _Requirements: 1.1, 1.3, 4.1, 4.2, 4.3, 4.4_

  - [x] 2.3 Write property tests for field arithmetic
    - **Property 5: Field Arithmetic Algebraic Properties**
    - Test commutativity: mul(a, b) = mul(b, a)
    - Test associativity: mul(mul(a, b), c) = mul(a, mul(b, c))
    - Test inverse: mul(a, inv(a)) = 1 for non-zero a
    - **Validates: Requirements 4.9, 4.10**

  - [x] 2.4 Implement batch inversion
    - Implement Montgomery's batch inversion trick
    - Optimize for SIMD where available
    - _Requirements: 4.5_

  - [x] 2.5 Write property test for batch inversion
    - **Property 6: Batch Inversion Correctness**
    - Verify batch_inv produces same results as individual inv calls
    - **Validates: Requirements 4.5**

  - [x] 2.6 Implement field element serialization
    - Implement toBytes with big-endian and little-endian support
    - Implement fromBytes with modulus validation
    - _Requirements: 4.7, 4.8_

  - [x] 2.7 Write property test for field serialization round-trip
    - **Property 7: Field Element Serialization Round-Trip**
    - Test serialize then deserialize returns original
    - Test both endianness options
    - **Validates: Requirements 4.7, 4.8**

- [x] 3. Checkpoint - Field Arithmetic Complete
  - Ensure all field arithmetic tests pass
  - Verify node-fhe-accelerate integration works correctly
  - Ask the user if questions arise

- [x] 4. Elliptic Curve Operations
  - [x] 4.1 Implement curve configuration for BN254 and BLS12-381
    - Define CurveConfig with field, curve parameters (a, b), generator, order
    - Create BN254_CURVE and BLS12_381_CURVE constants
    - Implement identity point representation
    - _Requirements: 2.2, 2.3, 5.4_

  - [x] 4.2 Implement point representations and conversions
    - Implement AffinePoint, ProjectivePoint, JacobianPoint types
    - Implement toAffine, toProjective, toJacobian conversions
    - Implement isIdentity check for each representation
    - _Requirements: 5.4_

  - [x] 4.3 Write property test for coordinate representation equivalence
    - **Property 10: Coordinate Representation Equivalence**
    - Test converting between representations preserves point
    - **Validates: Requirements 5.4**

  - [x] 4.4 Implement point addition and doubling
    - Implement point_add for Jacobian coordinates (most efficient)
    - Implement point_double for Jacobian coordinates
    - Handle identity point cases
    - _Requirements: 5.1, 5.2_

  - [x] 4.5 Write property tests for curve group properties
    - **Property 8: Elliptic Curve Group Properties**
    - Test identity: add(P, identity) = P
    - Test inverse: add(P, negate(P)) = identity
    - Test doubling: double(P) = add(P, P)
    - **Validates: Requirements 5.1, 5.2, 5.8**

  - [x] 4.6 Implement scalar multiplication
    - Implement double-and-add algorithm
    - Optimize with windowed method for larger scalars
    - _Requirements: 5.3_

  - [x] 4.7 Write property test for scalar multiplication
    - **Property 11: Scalar Multiplication Correctness**
    - Test scalar_mul(s, P) equals adding P s times (for small s)
    - Test scalar_mul(a+b, P) = add(scalar_mul(a, P), scalar_mul(b, P))
    - **Validates: Requirements 5.3**

  - [x] 4.8 Implement point compression and decompression
    - Implement compress: store x-coordinate and y-parity bit
    - Implement decompress: recover y from x using curve equation
    - _Requirements: 5.5, 5.6_

  - [x] 4.9 Write property test for point compression round-trip
    - **Property 9: Point Compression Round-Trip**
    - Test compress then decompress returns original point
    - **Validates: Requirements 5.5, 5.6, 5.9**

  - [x] 4.10 Implement curve point validation
    - Implement isOnCurve check (y² = x³ + ax + b)
    - Implement validateCurvePoint that throws on invalid points
    - _Requirements: 15.2_

- [x] 5. Checkpoint - Curve Operations Complete
  - Ensure all curve operation tests pass
  - Verify both BN254 and BLS12-381 curves work correctly
  - Ask the user if questions arise

- [x] 6. Number Theoretic Transform (NTT)
  - [x] 6.1 Implement NTT configuration and twiddle factors
    - Compute primitive roots of unity for supported sizes
    - Precompute twiddle factors for common NTT sizes
    - Store inverse twiddle factors and n⁻¹ for inverse NTT
    - _Requirements: 3.1, 3.2_

  - [x] 6.2 Implement radix-2 NTT (reuse from node-fhe-accelerate if compatible)
    - Implement Cooley-Tukey radix-2 forward NTT
    - Implement inverse NTT with scaling
    - Support in-place computation
    - _Requirements: 1.2, 3.1, 3.2, 3.3, 3.5_

  - [x] 6.3 Implement radix-4 NTT
    - Implement radix-4 butterfly operations
    - Optimize for better cache utilization
    - _Requirements: 3.3_

  - [x] 6.4 Write property test for NTT round-trip
    - **Property 3: NTT Round-Trip**
    - Test forward_ntt then inverse_ntt returns original
    - Test for various power-of-two sizes
    - **Validates: Requirements 3.1, 3.2, 3.9**

  - [x] 6.5 Write property test for NTT implementation consistency
    - **Property 4: NTT Implementation Consistency**
    - Test radix-2 and radix-4 produce identical results
    - **Validates: Requirements 3.3**

  - [x] 6.6 Implement batch NTT
    - Process multiple polynomials in parallel
    - Use thread pool for CPU parallelism
    - _Requirements: 3.4_

  - [x] 6.7 Write property test for batch NTT correctness
    - **Property 4: NTT Implementation Consistency (batch)**
    - Test batch_ntt produces same results as individual NTTs
    - **Validates: Requirements 3.4**

  - [x] 6.8 Implement NTT input validation
    - Validate input length is power of two
    - Return descriptive error for invalid sizes
    - _Requirements: 3.10_

- [x] 7. Checkpoint - NTT Complete
  - Ensure all NTT tests pass
  - Verify radix-2 and radix-4 produce identical results
  - Ask the user if questions arise

- [x] 8. Multi-Scalar Multiplication (MSM)
  - [x] 8.1 Implement Pippenger's algorithm (CPU)
    - Implement bucket method with configurable window size
    - Implement bucket accumulation using point addition
    - Implement final bucket reduction
    - _Requirements: 2.1_

  - [x] 8.2 Implement MSM input validation
    - Validate scalars and points arrays have same length
    - Validate all points are on the curve (when validation enabled)
    - Return descriptive errors for invalid inputs
    - _Requirements: 2.10, 15.4_

  - [x] 8.3 Write property test for MSM correctness
    - **Property 1: MSM Correctness**
    - Test MSM result equals sum of individual scalar multiplications
    - Test for various input sizes
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 8.4 Write property test for MSM invalid input handling
    - **Property 2: MSM Invalid Input Handling**
    - Test invalid curve points return errors
    - Test mismatched array lengths return errors
    - **Validates: Requirements 2.10**

  - [x] 8.5 Implement MSM acceleration router
    - Select CPU-only for small inputs (below GPU threshold)
    - Select GPU for large inputs when Metal available
    - Respect user acceleration hints
    - _Requirements: 2.4, 2.5_

- [x] 9. Checkpoint - MSM CPU Implementation Complete
  - Ensure MSM correctness tests pass
  - Benchmark against snarkjs WASM baseline
  - Ask the user if questions arise

- [x] 10. CPU Acceleration Layer
  - [x] 10.1 Implement vDSP vector operations wrapper
    - Wrap vDSP_vaddD, vDSP_vmulD for vector operations
    - Use for NTT butterfly computations
    - _Requirements: 6.2, 1.4_

  - [x] 10.2 Implement NEON-optimized Montgomery multiplication
    - Write NEON intrinsics for parallel limb operations
    - Optimize for 4-limb (BN254) and 6-limb (BLS12-381) elements
    - Reuse from node-fhe-accelerate if available
    - _Requirements: 1.4, 4.6, 6.6_

  - [x] 10.3 Implement AMX matrix operations via Accelerate
    - Use BLAS sgemm/dgemm for matrix accumulation
    - Apply to MSM bucket accumulation
    - _Requirements: 6.4, 2.7_

  - [x] 10.4 Implement SME matrix operations (M4 experimental)
    - Detect SME availability on M4 chips
    - Implement SME matrix outer product for bucket accumulation
    - Mark as experimental with fallback
    - _Requirements: 6.5, 2.8, 9.1_

- [x] 11. GPU Acceleration Layer
  - [x] 11.1 Implement Metal compute infrastructure
    - Initialize Metal device and command queue
    - Implement shader compilation and caching
    - Implement unified memory buffer management
    - Reuse infrastructure from node-fhe-accelerate
    - _Requirements: 1.5, 7.1, 7.2, 7.5_

  - [x] 11.2 Implement Metal MSM kernel
    - Implement sparse matrix transposition for bucket assignment
    - Implement parallel bucket accumulation shader
    - Implement bucket reduction shader
    - _Requirements: 2.6, 7.3_

  - [x] 11.3 Implement Metal NTT kernel
    - Implement butterfly operation compute shader
    - Implement batched NTT for multiple polynomials
    - Dynamic workgroup sizing based on input size
    - _Requirements: 3.7, 7.4, 7.6_

  - [x] 11.4 Implement GPU fallback handling
    - Gracefully fall back to CPU when Metal unavailable
    - Log fallback reason at debug level
    - _Requirements: 7.8_

- [x] 12. Hybrid CPU+GPU Execution
  - [x] 12.1 Implement workload splitting heuristics
    - Determine optimal CPU/GPU split based on input size
    - Account for GPU dispatch overhead
    - _Requirements: 8.1, 8.2_

  - [x] 12.2 Implement hybrid MSM executor
    - Split scalar/point arrays between CPU and GPU
    - Execute in parallel and combine results
    - Support user-provided split ratio hints
    - _Requirements: 8.3, 8.4, 8.5_

  - [x] 12.3 Implement calibration routine
    - Benchmark CPU and GPU separately
    - Learn optimal split ratio for current hardware
    - _Requirements: 8.6_

- [-] 13. Checkpoint - Acceleration Layers Complete
  - Ensure all acceleration paths produce correct results
  - Verify fallback behavior works correctly
  - Benchmark CPU, GPU, and hybrid modes
  - Ask the user if questions arise

- [ ] 14. snarkjs Integration
  - [ ] 14.1 Implement snarkjs file parsers
    - Parse .zkey files (Groth16 and PLONK formats)
    - Parse .wtns witness files
    - Parse .r1cs constraint files
    - _Requirements: 10.4_

  - [ ] 14.2 Implement accelerated Groth16 prover
    - Replace snarkjs MSM calls with accelerated implementation
    - Maintain API compatibility with snarkjs
    - _Requirements: 10.1, 10.2_

  - [ ] 14.3 Implement accelerated PLONK prover
    - Replace snarkjs MSM and NTT calls with accelerated implementations
    - Maintain API compatibility with snarkjs
    - _Requirements: 10.1, 10.3_

  - [ ] 14.4 Write property test for snarkjs proof equivalence
    - **Property 12: snarkjs Proof Equivalence**
    - Test accelerated proofs verify with standard snarkjs verifier
    - Test proofs are mathematically identical to unaccelerated
    - **Validates: Requirements 10.6**

- [ ] 15. Arkworks Compatibility
  - [ ] 15.1 Implement Arkworks serialization format
    - Serialize curve points in Arkworks format
    - Serialize field elements in Arkworks Montgomery format
    - _Requirements: 11.1, 11.3_

  - [ ] 15.2 Implement Arkworks deserialization
    - Parse Arkworks-format curve points
    - Parse Arkworks-format field elements
    - _Requirements: 11.2_

  - [ ] 15.3 Write property test for Arkworks serialization round-trip
    - **Property 13: Arkworks Serialization Round-Trip**
    - Test deserialize then serialize produces identical bytes
    - **Validates: Requirements 11.4**

- [ ] 16. Checkpoint - Integration Complete
  - Ensure snarkjs integration tests pass
  - Ensure Arkworks compatibility tests pass
  - Ask the user if questions arise

- [ ] 17. Error Handling and Validation
  - [ ] 17.1 Implement error types and codes
    - Create ZkAccelerateError class with error codes
    - Implement all ErrorCode enum values
    - _Requirements: 15.1, 14.4_

  - [ ] 17.2 Implement comprehensive input validation
    - Add validation to all public API functions
    - Support disabling validation for performance
    - _Requirements: 15.1, 15.6_

  - [ ] 17.3 Write property test for input validation
    - **Property 14: Input Validation Correctness**
    - Test invalid curve points are rejected
    - Test out-of-range field elements are rejected
    - Test mismatched array lengths are rejected
    - **Validates: Requirements 15.2, 15.3, 15.4**

- [ ] 18. TypeScript API and Types
  - [ ] 18.1 Create public TypeScript API
    - Export all public interfaces and types
    - Create factory functions for field elements and curve points
    - Implement configuration options interface
    - _Requirements: 14.1, 14.2, 14.3, 14.6_

  - [ ] 18.2 Add JSDoc documentation
    - Document all public functions with JSDoc
    - Include usage examples in documentation
    - _Requirements: 16.2_

  - [ ] 18.3 Implement async API with Promises
    - Wrap native async operations with Promises
    - Ensure proper typing for async returns
    - _Requirements: 14.5_

- [ ] 19. Benchmarking Suite
  - [ ] 19.1 Implement benchmark runner
    - Create benchmark configuration for MSM and NTT
    - Implement warmup and iteration logic
    - Output results in JSON format
    - _Requirements: 12.1, 12.2, 12.6_

  - [ ] 19.2 Implement snarkjs baseline comparison
    - Benchmark against snarkjs WASM implementation
    - Calculate speedup ratios
    - _Requirements: 12.3_

  - [ ] 19.3 Implement hardware utilization reporting
    - Report per-hardware-unit timing (CPU, GPU, AMX/SME)
    - Report power efficiency where available
    - _Requirements: 12.4, 12.5_

  - [ ] 19.4 Create quick benchmark mode
    - Subset of benchmarks completing in under 60 seconds
    - Representative results for common use cases
    - _Requirements: 12.7_

- [ ] 20. Build System and Distribution
  - [ ] 20.1 Configure build scripts
    - Set up node-gyp build for native code
    - Set up napi-rs build for Rust components
    - Set up Metal shader compilation
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ] 20.2 Implement WASM fallback
    - Create WASM implementations of core operations
    - Automatic fallback when native unavailable
    - _Requirements: 13.5, 13.7_

  - [ ] 20.3 Configure prebuilt binaries
    - Set up prebuild for Apple Silicon configurations
    - Configure npm publish workflow
    - _Requirements: 13.6_

- [ ] 21. Documentation
  - [ ] 21.1 Write README with installation and usage
    - Installation instructions
    - Basic usage examples
    - Performance expectations
    - _Requirements: 16.1_

  - [ ] 21.2 Write snarkjs integration guide
    - Complete example of accelerating snarkjs workflow
    - Migration guide from pure snarkjs
    - _Requirements: 16.3_

  - [ ] 21.3 Write hardware utilization documentation
    - Explain which operations use which hardware
    - Configuration options for hardware selection
    - _Requirements: 16.4_

  - [ ] 21.4 Write benchmarking guide
    - Instructions for running benchmarks
    - Interpreting benchmark results
    - _Requirements: 16.5_

- [ ] 22. Final Checkpoint
  - Ensure all tests pass (unit and property)
  - Verify 10x+ speedup for MSM vs snarkjs WASM
  - Verify 5x+ speedup for NTT vs snarkjs WASM
  - Review documentation completeness
  - Ask the user if questions arise

## Notes

- All tasks including property-based tests are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation before proceeding
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples and edge cases
- Code reuse from node-fhe-accelerate is prioritized throughout (Requirement 1)
