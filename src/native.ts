/**
 * Native binding loader for node-zk-accelerate
 *
 * This module handles loading native C++ and Rust bindings with
 * proper error handling and fallback mechanisms.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { ErrorCode, ZkAccelerateError } from './errors.js';

/**
 * Native C++ binding interface
 */
export interface NativeCppBinding {
  getHardwareCapabilities(): {
    hasNeon: boolean;
    // No hasAmx: the addon cannot detect AMX and no longer reports it.
    hasSme: boolean;
    hasMetal: boolean;
    unifiedMemory: boolean;
    cpuCores: number;
    gpuCores?: number;
    metalDeviceName?: string;
    metalMaxThreadsPerGroup?: number;
  };
  isAppleSilicon(): boolean;
  getVersion(): string;
  // CPU Accelerator functions
  getCPUAcceleratorStatus?(): {
    vdspAvailable: boolean;
    blasAvailable: boolean;
    neonAvailable: boolean;
    // No amxAvailable: the addon cannot detect AMX and no longer reports it.
    smeAvailable: boolean;
  };
  vdspVectorAdd?(a: Float64Array, b: Float64Array): Float64Array;
  vdspVectorMul?(a: Float64Array, b: Float64Array): Float64Array;
  vdspVectorSub?(a: Float64Array, b: Float64Array): Float64Array;
  blasMatrixMul?(
    a: Float64Array,
    b: Float64Array,
    m: number,
    n: number,
    k: number
  ): Float64Array;
  neonAvailable?(): boolean;
  smeAvailable?(): boolean;
}

/**
 * Native Rust binding interface
 */
export interface NativeRustBinding {
  detectRustCapabilities(): {
    hasNeon: boolean;
    // No hasAmx: the Rust addon cannot detect AMX and no longer reports it.
    hasSme: boolean;
    cpuCores: number;
    arch: string;
    os: string;
  };
  rustVersion(): string;
  isAppleSilicon(): boolean;
  getBindingStatus(): {
    rustLoaded: boolean;
    rustVersion: string;
    appleSilicon: boolean;
    capabilities: {
      hasNeon: boolean;
      hasSme: boolean;
      cpuCores: number;
      arch: string;
      os: string;
    };
  };
}

/**
 * Native binding status
 */
export interface NativeBindingStatus {
  cppLoaded: boolean;
  rustLoaded: boolean;
  cppError?: string | undefined;
  rustError?: string | undefined;
}

// Cached binding instances
let cppBinding: NativeCppBinding | null = null;
let rustBinding: NativeRustBinding | null = null;
let bindingStatus: NativeBindingStatus | null = null;

// Get module directory - works in both ESM and CJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create require function for loading native modules
const requireNative = createRequire(import.meta.url);

/**
 * Locate the package root.
 *
 * The compiled entry points live in `dist/esm` or `dist/cjs`, two levels below
 * the package root, but when running from source (`src/`) it is one level, and
 * hardcoding two meant the search looked *above* the package and found nothing.
 * Walk up to the nearest directory containing a package.json instead, and keep
 * the two-levels-up guess as a fallback.
 */
function findPackageRoot(): string {
  let dir = __dirname;

  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return path.join(__dirname, '..', '..');
}

/**
 * Possible paths for native bindings
 */
function getNativeBindingPaths(): string[] {
  const paths: string[] = [];
  const rootDir = findPackageRoot();

  // Standard node-gyp build locations (present in a local checkout; `build/`
  // is not shipped in the npm tarball)
  paths.push(path.join(rootDir, 'build', 'Release', 'zk_accelerate.node'));
  paths.push(path.join(rootDir, 'build', 'Debug', 'zk_accelerate.node'));

  // Prebuilt binary locations. Two names are searched because two tools
  // produce the artifact: `scripts/create-prebuilds.js` writes
  // `zk_accelerate.node` (the node-gyp target name), while `prebuildify`
  // writes `<scope>+<name>.node`. Only the second was present in the published
  // 0.1.1 tarball while only the first was searched for, so the addon never
  // loaded for a consumer. Both are accepted now, and create-prebuilds.js also
  // makes sure the node-gyp name exists.
  const prebuildDir = path.join(rootDir, 'prebuilds', `${process.platform}-${process.arch}`);
  paths.push(path.join(prebuildDir, 'zk_accelerate.node'));
  paths.push(path.join(prebuildDir, '@digitaldefiance+node-zk-accelerate.node'));

  // Development build location
  paths.push(path.join(rootDir, 'native', 'build', 'Release', 'zk_accelerate.node'));

  return paths;
}

/**
 * Possible paths for Rust bindings
 */
function getRustBindingPaths(): string[] {
  const paths: string[] = [];
  const rootDir = findPackageRoot();

  // napi-rs .node file locations (platform-specific)
  const platform = process.platform;
  const arch = process.arch;
  const nodeName = `zk-accelerate-rs.${platform}-${arch}.node`;

  // Check in native-rust directory first (development)
  paths.push(path.join(rootDir, 'native-rust', nodeName));

  // Check in root directory (installed package)
  paths.push(path.join(rootDir, nodeName));

  // Prebuild directory: create-prebuilds.js copies the Rust addon here, and
  // this is where it lands in the published tarball
  paths.push(path.join(rootDir, 'prebuilds', `${platform}-${arch}`, nodeName));

  // Legacy locations
  paths.push(path.join(rootDir, 'zk_accelerate_rs.node'));

  return paths;
}

/**
 * Try to load a native module from multiple paths
 */
function tryLoadNative<T>(paths: string[], name: string): { module: T | null; error?: string } {
  for (const modulePath of paths) {
    if (fs.existsSync(modulePath)) {
      try {
        const loadedModule = requireNative(modulePath) as T;
        return { module: loadedModule };
      } catch {
        // Continue to next path
        continue;
      }
    }
  }

  return {
    module: null,
    error: `${name} native binding not found. Searched paths: ${paths.join(', ')}`,
  };
}

/**
 * Load the C++ native binding
 */
export function loadCppBinding(): NativeCppBinding | null {
  if (cppBinding !== null) {
    return cppBinding;
  }

  const paths = getNativeBindingPaths();
  const result = tryLoadNative<NativeCppBinding>(paths, 'C++');

  if (result.module) {
    cppBinding = result.module;
  }

  return cppBinding;
}

/**
 * Load the Rust native binding
 */
export function loadRustBinding(): NativeRustBinding | null {
  if (rustBinding !== null) {
    return rustBinding;
  }

  const paths = getRustBindingPaths();
  const result = tryLoadNative<NativeRustBinding>(paths, 'Rust');

  if (result.module) {
    rustBinding = result.module;
  }

  return rustBinding;
}

/**
 * Get the status of native bindings
 */
export function getNativeBindingStatus(): NativeBindingStatus {
  if (bindingStatus !== null) {
    return bindingStatus;
  }

  const cppPaths = getNativeBindingPaths();
  const rustPaths = getRustBindingPaths();

  const cppResult = tryLoadNative<NativeCppBinding>(cppPaths, 'C++');
  const rustResult = tryLoadNative<NativeRustBinding>(rustPaths, 'Rust');

  if (cppResult.module) {
    cppBinding = cppResult.module;
  }
  if (rustResult.module) {
    rustBinding = rustResult.module;
  }

  bindingStatus = {
    cppLoaded: cppResult.module !== null,
    rustLoaded: rustResult.module !== null,
    cppError: cppResult.error,
    rustError: rustResult.error,
  };

  return bindingStatus;
}

/**
 * Require the C++ binding, throwing if not available
 */
export function requireCppBinding(): NativeCppBinding {
  const binding = loadCppBinding();
  if (!binding) {
    throw new ZkAccelerateError(
      'C++ native binding is not available. Run `npm run build:native` to compile.',
      ErrorCode.NATIVE_BINDING_FAILED,
      { type: 'cpp', paths: getNativeBindingPaths() }
    );
  }
  return binding;
}

/**
 * Require the Rust binding, throwing if not available
 */
export function requireRustBinding(): NativeRustBinding {
  const binding = loadRustBinding();
  if (!binding) {
    throw new ZkAccelerateError(
      'Rust native binding is not available. Run `npm run build:rust` to compile.',
      ErrorCode.NATIVE_BINDING_FAILED,
      { type: 'rust', paths: getRustBindingPaths() }
    );
  }
  return binding;
}

/**
 * Check if any native binding is available
 */
export function hasNativeBinding(): boolean {
  const status = getNativeBindingStatus();
  return status.cppLoaded || status.rustLoaded;
}

/**
 * Check if C++ binding is available
 */
export function hasCppBinding(): boolean {
  return loadCppBinding() !== null;
}

/**
 * Check if Rust binding is available
 */
export function hasRustBinding(): boolean {
  return loadRustBinding() !== null;
}
