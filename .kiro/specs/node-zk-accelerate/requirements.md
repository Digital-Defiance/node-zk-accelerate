# Requirements Document

## Introduction

`@digitaldefiance/node-zk-accelerate` is a Zero-Knowledge Proof acceleration library for Node.js that maximizes Apple Silicon M4 Max hardware utilization. The library provides hardware-accelerated implementations of the core ZK proof primitives—Multi-Scalar Multiplication (MSM), Number Theoretic Transform (NTT), finite field arithmetic, and elliptic curve operations—targeting 10x+ speedups over existing JavaScript/WASM implementations.

The library exploits all available hardware acceleration on Apple Silicon: SME (Scalable Matrix Extension), AMX (Apple Matrix Coprocessor), NEON SIMD, Metal GPU, and potentially the Neural Engine. It follows the philosophy of "leave no hardware instruction unturned" to unlock maximum performance for web3 developers.

## Glossary

- **MSM (Multi-Scalar Multiplication)**: Computing the sum of scalar-point products on an elliptic curve. Accounts for ~70% of ZK proof generation time.
- **NTT (Number Theoretic Transform)**: A discrete Fourier transform over finite fields used for polynomial multiplication in ZK proofs.
- **Montgomery_Multiplication**: An efficient algorithm for modular multiplication that avoids expensive division operations.
- **Field_Element**: An element of a finite field used in cryptographic operations.
- **Curve_Point**: A point on an elliptic curve, represented in affine, projective, or Jacobian coordinates.
- **BN254**: A pairing-friendly elliptic curve commonly used in Ethereum and ZK-SNARKs.
- **BLS12_381**: A pairing-friendly elliptic curve with 128-bit security level.
- **Pippenger_Algorithm**: An efficient algorithm for MSM using bucket accumulation.
- **SME (Scalable Matrix Extension)**: ARM's matrix acceleration extension, first available on consumer chips with M4.
- **AMX (Apple Matrix Coprocessor)**: Apple's undocumented matrix acceleration unit accessible via Accelerate framework.
- **NEON**: ARM's 128-bit SIMD instruction set.
- **Metal**: Apple's GPU compute API.
- **Accelerate_Framework**: Apple's hardware-optimized math library providing BLAS, vDSP, and vForce functions.
- **Groth16**: A popular ZK-SNARK proving system.
- **PLONK**: A universal ZK-SNARK proving system.
- **Witness**: The private inputs to a ZK circuit.
- **Bucket_Method**: A technique in Pippenger's algorithm that groups scalars by bit windows.
- **Sparse_Matrix**: A matrix representation that exploits zero entries for efficiency.

## Requirements

### Requirement 1: Code Reuse from node-fhe-accelerate

**User Story:** As a library maintainer, I want to reuse code from @digitaldefiance/node-fhe-accelerate wherever possible, so that I avoid duplication and leverage existing tested implementations.

#### Acceptance Criteria

1. WHEN the library requires finite field arithmetic THEN the Code_Reuse_Engine SHALL evaluate using @digitaldefiance/node-fhe-accelerate as a dependency
2. WHEN the library requires NTT operations THEN the Code_Reuse_Engine SHALL reuse NTT implementations from node-fhe-accelerate if compatible
3. WHEN the library requires Montgomery multiplication THEN the Code_Reuse_Engine SHALL reuse Montgomery implementations from node-fhe-accelerate
4. WHEN the library requires NEON SIMD intrinsics THEN the Code_Reuse_Engine SHALL reuse NEON code from node-fhe-accelerate where applicable
5. WHEN the library requires Metal GPU infrastructure THEN the Code_Reuse_Engine SHALL reuse Metal setup and dispatch code from node-fhe-accelerate
6. WHEN shared functionality exists THEN the Code_Reuse_Engine SHALL import from node-fhe-accelerate rather than duplicating code
7. WHEN node-fhe-accelerate implementations are insufficient THEN the Code_Reuse_Engine SHALL extend or wrap them rather than replace entirely
8. WHEN documenting the library THEN the Documentation SHALL clearly indicate which components come from node-fhe-accelerate

### Requirement 2: Multi-Scalar Multiplication (MSM)

**User Story:** As a ZK proof developer, I want hardware-accelerated MSM operations, so that I can generate proofs 10x faster than with pure JavaScript/WASM implementations.

#### Acceptance Criteria

1. WHEN a user calls msm with an array of scalars and curve points THEN the MSM_Engine SHALL compute the multi-scalar multiplication and return the resulting curve point
2. WHEN performing MSM on BN254 curve THEN the MSM_Engine SHALL use the BN254 field parameters and curve equation
3. WHEN performing MSM on BLS12_381 curve THEN the MSM_Engine SHALL use the BLS12_381 field parameters and curve equation
4. WHEN the input size exceeds the GPU threshold THEN the MSM_Engine SHALL automatically split workload between CPU and GPU
5. WHEN the input size is below the GPU threshold THEN the MSM_Engine SHALL use CPU-only acceleration
6. WHEN Metal GPU is available THEN the MSM_Engine SHALL use sparse matrix transposition for bucket accumulation
7. WHEN AMX is available THEN the MSM_Engine SHALL use matrix outer product operations for bucket accumulation
8. WHEN SME is available on M4 chips THEN the MSM_Engine SHALL use SME matrix instructions for enhanced throughput
9. WHEN benchmarked against snarkjs WASM THEN the MSM_Engine SHALL achieve at least 10x speedup for inputs of 2^16 or more points
10. IF invalid curve points are provided THEN the MSM_Engine SHALL return a descriptive error without crashing

### Requirement 3: Number Theoretic Transform (NTT)

**User Story:** As a ZK proof developer, I want hardware-accelerated NTT operations, so that I can perform polynomial multiplication efficiently for PLONK and other polynomial-based proof systems.

#### Acceptance Criteria

1. WHEN a user calls forward_ntt with a polynomial coefficient array THEN the NTT_Engine SHALL compute the forward NTT and return the transformed array
2. WHEN a user calls inverse_ntt with a transformed array THEN the NTT_Engine SHALL compute the inverse NTT and return the original coefficients
3. WHEN performing NTT THEN the NTT_Engine SHALL support both radix-2 and radix-4 implementations
4. WHEN a user calls batch_ntt with multiple polynomials THEN the NTT_Engine SHALL process all polynomials in parallel
5. WHEN in_place mode is specified THEN the NTT_Engine SHALL perform the transform without allocating additional memory
6. WHEN vDSP is available THEN the NTT_Engine SHALL use vDSP vector operations for butterfly computations
7. WHEN Metal GPU is available THEN the NTT_Engine SHALL offload large NTTs to GPU compute shaders
8. WHEN benchmarked against snarkjs WASM THEN the NTT_Engine SHALL achieve at least 5x speedup for polynomials of degree 2^16 or higher
9. FOR ALL valid polynomial inputs, applying forward_ntt then inverse_ntt SHALL produce the original polynomial (round-trip property)
10. IF the input length is not a power of two THEN the NTT_Engine SHALL return a descriptive error

### Requirement 4: Finite Field Arithmetic

**User Story:** As a ZK proof developer, I want optimized finite field operations, so that all underlying arithmetic is as fast as possible.

#### Acceptance Criteria

1. WHEN a user calls field_mul with two field elements THEN the Field_Arithmetic_Engine SHALL compute the Montgomery multiplication and return the product
2. WHEN a user calls field_add with two field elements THEN the Field_Arithmetic_Engine SHALL compute the modular addition and return the sum
3. WHEN a user calls field_sub with two field elements THEN the Field_Arithmetic_Engine SHALL compute the modular subtraction and return the difference
4. WHEN a user calls field_inv with a field element THEN the Field_Arithmetic_Engine SHALL compute the modular inverse
5. WHEN a user calls batch_inv with an array of field elements THEN the Field_Arithmetic_Engine SHALL compute all inverses using Montgomery's batch inversion trick
6. WHEN NEON SIMD is available THEN the Field_Arithmetic_Engine SHALL use NEON intrinsics for parallel Montgomery multiplication
7. WHEN serializing field elements THEN the Field_Arithmetic_Engine SHALL support both big-endian and little-endian byte formats
8. WHEN deserializing field elements THEN the Field_Arithmetic_Engine SHALL validate that values are within the field modulus
9. FOR ALL field elements a and b, field_mul(a, b) SHALL equal field_mul(b, a) (commutativity property)
10. FOR ALL non-zero field elements a, field_mul(a, field_inv(a)) SHALL equal the multiplicative identity (inverse property)
11. IF a zero element is passed to field_inv THEN the Field_Arithmetic_Engine SHALL return a descriptive error

### Requirement 5: Elliptic Curve Operations

**User Story:** As a ZK proof developer, I want optimized elliptic curve operations, so that point arithmetic is hardware-accelerated.

#### Acceptance Criteria

1. WHEN a user calls point_add with two curve points THEN the Curve_Engine SHALL compute the elliptic curve addition and return the result
2. WHEN a user calls point_double with a curve point THEN the Curve_Engine SHALL compute the point doubling and return the result
3. WHEN a user calls scalar_mul with a scalar and curve point THEN the Curve_Engine SHALL compute the scalar multiplication and return the result
4. WHEN performing point operations THEN the Curve_Engine SHALL support both affine and projective/Jacobian coordinate representations
5. WHEN a user calls point_compress with a curve point THEN the Curve_Engine SHALL return the compressed point representation
6. WHEN a user calls point_decompress with compressed bytes THEN the Curve_Engine SHALL return the full curve point
7. WHEN NEON SIMD is available THEN the Curve_Engine SHALL use SIMD-optimized field operations for point arithmetic
8. FOR ALL curve points P, point_add(P, identity) SHALL equal P (identity property)
9. FOR ALL curve points P, point_compress then point_decompress SHALL produce the original point (round-trip property)
10. IF an invalid compressed point is provided THEN the Curve_Engine SHALL return a descriptive error

### Requirement 6: CPU Acceleration Layer

**User Story:** As a ZK proof developer, I want the library to automatically use Apple Accelerate framework and NEON SIMD, so that CPU operations are hardware-optimized without manual configuration.

#### Acceptance Criteria

1. WHEN the library initializes THEN the CPU_Accelerator SHALL detect available CPU acceleration features (NEON, AMX, SME)
2. WHEN vDSP functions are available THEN the CPU_Accelerator SHALL use vDSP for vector operations
3. WHEN BLAS functions are available THEN the CPU_Accelerator SHALL use BLAS for matrix operations
4. WHEN AMX is available THEN the CPU_Accelerator SHALL use AMX via Accelerate for matrix accumulation operations
5. WHEN SME is available on M4 chips THEN the CPU_Accelerator SHALL use SME matrix instructions directly
6. WHEN custom NEON intrinsics are needed THEN the CPU_Accelerator SHALL provide hand-optimized NEON assembly for Montgomery multiplication
7. WHEN the library loads THEN the CPU_Accelerator SHALL log detected hardware capabilities at debug level
8. IF Accelerate framework is unavailable THEN the CPU_Accelerator SHALL fall back to optimized pure JavaScript

### Requirement 7: GPU Acceleration Layer

**User Story:** As a ZK proof developer, I want the library to use Metal GPU compute, so that massively parallel operations run on the GPU.

#### Acceptance Criteria

1. WHEN the library initializes THEN the GPU_Accelerator SHALL detect Metal GPU availability and capabilities
2. WHEN Metal is available THEN the GPU_Accelerator SHALL compile and cache Metal compute shaders
3. WHEN performing MSM on GPU THEN the GPU_Accelerator SHALL use sparse matrix transposition techniques
4. WHEN performing NTT on GPU THEN the GPU_Accelerator SHALL use optimized butterfly compute shaders
5. WHEN allocating GPU buffers THEN the GPU_Accelerator SHALL use unified memory to avoid CPU-GPU transfer overhead
6. WHEN workgroup sizes are configured THEN the GPU_Accelerator SHALL dynamically size workgroups based on input size and GPU capabilities
7. WHEN the library loads THEN the GPU_Accelerator SHALL log GPU device name and compute capabilities at debug level
8. IF Metal is unavailable THEN the GPU_Accelerator SHALL fall back to CPU acceleration without error

### Requirement 8: Hybrid CPU+GPU Execution

**User Story:** As a ZK proof developer, I want the library to automatically split workloads between CPU and GPU, so that I get optimal performance without manual tuning.

#### Acceptance Criteria

1. WHEN processing large MSM inputs THEN the Hybrid_Executor SHALL split work between CPU and GPU based on learned heuristics
2. WHEN processing small inputs THEN the Hybrid_Executor SHALL use CPU-only to avoid GPU dispatch overhead
3. WHEN unified memory is available THEN the Hybrid_Executor SHALL share buffers between CPU and GPU without copying
4. WHEN workload splitting is performed THEN the Hybrid_Executor SHALL balance work to minimize idle time on either processor
5. WHEN a user provides a split ratio hint THEN the Hybrid_Executor SHALL respect the hint while allowing automatic adjustment
6. WHEN benchmarking mode is enabled THEN the Hybrid_Executor SHALL report per-processor timing and utilization

### Requirement 9: Experimental Hardware Features

**User Story:** As a ZK proof developer pushing performance boundaries, I want access to experimental hardware features like SME and Neural Engine, so that I can explore unconventional acceleration approaches.

#### Acceptance Criteria

1. WHEN SME is available on M4 chips THEN the Experimental_Engine SHALL provide direct SME instruction access for matrix operations
2. WHEN AMX is available THEN the Experimental_Engine SHALL provide custom AMX instruction sequences beyond Accelerate
3. WHEN Neural Engine exploration is enabled THEN the Experimental_Engine SHALL attempt to use ANE for matrix operations
4. WHEN experimental features are used THEN the Experimental_Engine SHALL clearly mark them as unstable in documentation
5. WHEN an experimental feature fails THEN the Experimental_Engine SHALL fall back to stable implementations gracefully
6. WHEN experimental mode is enabled THEN the Experimental_Engine SHALL log detailed hardware utilization metrics

### Requirement 10: snarkjs Integration

**User Story:** As a ZK proof developer using snarkjs, I want drop-in acceleration for snarkjs workflows, so that I can speed up existing projects without major refactoring.

#### Acceptance Criteria

1. WHEN a user imports the snarkjs adapter THEN the Snarkjs_Adapter SHALL provide accelerated implementations of MSM and NTT
2. WHEN generating Groth16 proofs THEN the Snarkjs_Adapter SHALL accelerate the MSM operations in proof generation
3. WHEN generating PLONK proofs THEN the Snarkjs_Adapter SHALL accelerate both MSM and NTT operations
4. WHEN reading snarkjs-format files THEN the Snarkjs_Adapter SHALL parse .zkey, .wtns, and .r1cs files correctly
5. WHEN a user calls accelerated witness generation THEN the Snarkjs_Adapter SHALL compute witnesses faster than pure snarkjs
6. FOR ALL valid snarkjs inputs, the Snarkjs_Adapter SHALL produce identical proof outputs to unaccelerated snarkjs (correctness property)

### Requirement 11: Arkworks Compatibility

**User Story:** As a ZK proof developer using Arkworks, I want compatible data formats, so that I can interoperate with Rust-based ZK tooling.

#### Acceptance Criteria

1. WHEN serializing curve points THEN the Arkworks_Adapter SHALL use Arkworks-compatible serialization format
2. WHEN deserializing curve points THEN the Arkworks_Adapter SHALL parse Arkworks-format bytes correctly
3. WHEN serializing field elements THEN the Arkworks_Adapter SHALL use Arkworks-compatible Montgomery representation
4. FOR ALL valid Arkworks-format inputs, deserializing then serializing SHALL produce identical bytes (round-trip property)

### Requirement 12: Benchmarking Suite

**User Story:** As a ZK proof developer, I want comprehensive benchmarks, so that I can measure performance improvements and identify bottlenecks.

#### Acceptance Criteria

1. WHEN a user runs the benchmark suite THEN the Benchmark_Runner SHALL measure MSM performance across input sizes from 2^10 to 2^20
2. WHEN a user runs the benchmark suite THEN the Benchmark_Runner SHALL measure NTT performance across polynomial degrees from 2^10 to 2^20
3. WHEN benchmarking THEN the Benchmark_Runner SHALL compare against snarkjs WASM baseline
4. WHEN benchmarking THEN the Benchmark_Runner SHALL report per-hardware-unit timing (CPU, GPU, AMX/SME)
5. WHEN benchmarking THEN the Benchmark_Runner SHALL report power efficiency metrics where available
6. WHEN benchmarking THEN the Benchmark_Runner SHALL output results in JSON format for automated analysis
7. WHEN a user runs quick benchmarks THEN the Benchmark_Runner SHALL complete in under 60 seconds with representative results

### Requirement 13: Build System and Distribution

**User Story:** As a ZK proof developer, I want the library to build and install easily on Apple Silicon Macs, so that I can start using it quickly.

#### Acceptance Criteria

1. WHEN a user runs npm install THEN the Build_System SHALL compile native code using node-gyp
2. WHEN Rust components are present THEN the Build_System SHALL compile them using napi-rs
3. WHEN Metal shaders are present THEN the Build_System SHALL compile them to Metal libraries
4. WHEN the library loads THEN the Build_System SHALL automatically detect hardware capabilities
5. WHEN running on non-Apple-Silicon hardware THEN the Build_System SHALL provide WASM fallback implementations
6. WHEN publishing to npm THEN the Build_System SHALL include prebuilt binaries for common Apple Silicon configurations
7. IF native compilation fails THEN the Build_System SHALL fall back to WASM with a warning message

### Requirement 14: TypeScript API

**User Story:** As a TypeScript developer, I want full type definitions and a clean API, so that I can use the library with type safety and good IDE support.

#### Acceptance Criteria

1. WHEN the library is imported THEN the TypeScript_API SHALL provide complete type definitions for all public functions
2. WHEN creating field elements THEN the TypeScript_API SHALL accept BigInt, Uint8Array, or hex string inputs
3. WHEN creating curve points THEN the TypeScript_API SHALL accept coordinate objects or compressed byte arrays
4. WHEN errors occur THEN the TypeScript_API SHALL throw typed errors with descriptive messages
5. WHEN async operations complete THEN the TypeScript_API SHALL return Promises with proper typing
6. WHEN configuring the library THEN the TypeScript_API SHALL accept an options object with hardware preferences

### Requirement 15: Error Handling and Validation

**User Story:** As a ZK proof developer, I want clear error messages and input validation, so that I can debug issues quickly.

#### Acceptance Criteria

1. WHEN invalid inputs are provided THEN the Validation_Engine SHALL return errors before attempting computation
2. WHEN curve points are not on the curve THEN the Validation_Engine SHALL detect and report the invalid point
3. WHEN field elements exceed the modulus THEN the Validation_Engine SHALL detect and report the overflow
4. WHEN array lengths are mismatched THEN the Validation_Engine SHALL report the expected vs actual lengths
5. WHEN hardware acceleration fails THEN the Validation_Engine SHALL report which acceleration layer failed and why
6. IF validation is disabled for performance THEN the Validation_Engine SHALL skip checks but document the risk

### Requirement 16: Documentation and Examples

**User Story:** As a ZK proof developer new to the library, I want comprehensive documentation and examples, so that I can learn how to use it effectively.

#### Acceptance Criteria

1. WHEN a user reads the README THEN the Documentation SHALL explain installation, basic usage, and performance expectations
2. WHEN a user needs API reference THEN the Documentation SHALL provide JSDoc comments for all public functions
3. WHEN a user wants to accelerate snarkjs THEN the Documentation SHALL provide a complete integration example
4. WHEN a user wants to understand hardware utilization THEN the Documentation SHALL explain which operations use which hardware
5. WHEN a user wants to benchmark THEN the Documentation SHALL provide instructions for running and interpreting benchmarks
