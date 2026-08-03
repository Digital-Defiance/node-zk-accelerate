/**
 * Hardware capability detection for node-zk-accelerate
 *
 * Detects available hardware acceleration features on the system:
 * - NEON SIMD (ARM64)
 * - SME (Scalable Matrix Extension, M4+), via hw.optional.arm.FEAT_SME
 * - Metal GPU compute
 *
 * AMX is reported as 'unknown': it has no user-space availability query.
 *
 * Requirements: 6.1, 6.7, 7.1, 7.7
 */

import { loadCppBinding, loadRustBinding, getNativeBindingStatus } from './native.js';
import os from 'os';

/**
 * A capability that cannot always be determined.
 *
 * `true` and `false` mean the capability was actually queried and the answer
 * is known. `'unknown'` means no supported query exists, so no claim is made
 * in either direction. Treat `'unknown'` as "do not rely on this".
 */
export type CapabilitySupport = boolean | 'unknown';

/**
 * Hardware capabilities detected on the system
 */
export interface HardwareCapabilities {
  /** Whether NEON SIMD is available (ARM64) */
  readonly hasNeon: boolean;
  /**
   * AMX (Apple matrix coprocessor) availability.
   *
   * Always `'unknown'`. macOS exposes no user-space query for AMX -- no
   * sysctl, no hwcap bit -- and AMX is not directly programmable from user
   * space; it is an internal detail of the Accelerate framework. Earlier
   * versions reported `true` whenever the CPU brand string contained "Apple",
   * which is a claim about the vendor, not about the coprocessor. Nothing in
   * this package should branch on AMX being present.
   */
  readonly hasAmx: CapabilitySupport;
  /** Whether SME (Scalable Matrix Extension) is available (M4+) */
  readonly hasSme: boolean;
  /** Whether Metal GPU compute is available */
  readonly hasMetal: boolean;
  /** Metal GPU device name */
  readonly metalDeviceName?: string;
  /** Maximum threads per threadgroup for Metal */
  readonly metalMaxThreadsPerGroup?: number;
  /** Whether unified memory is available (Apple Silicon) */
  readonly unifiedMemory: boolean;
  /** Number of CPU cores */
  readonly cpuCores: number;
  /** Estimated number of GPU cores */
  readonly gpuCores?: number;
}

/**
 * Debug logger for hardware detection
 * Only logs when DEBUG or ZK_ACCELERATE_DEBUG environment variable is set
 */
function debugLog(message: string, data?: Record<string, unknown>): void {
  const debugEnv = process.env['DEBUG'];
  const zkDebugEnv = process.env['ZK_ACCELERATE_DEBUG'];
  const debugEnabled =
    debugEnv?.includes('zk-accelerate') || zkDebugEnv === '1' || zkDebugEnv === 'true';

  if (debugEnabled) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [zk-accelerate:hardware]`;
    if (data) {
      console.debug(`${prefix} ${message}`, data);
    } else {
      console.debug(`${prefix} ${message}`);
    }
  }
}

/**
 * Detect if running on Apple Silicon using pure JavaScript
 */
function detectAppleSiliconJS(): boolean {
  return process.platform === 'darwin' && process.arch === 'arm64';
}

/**
 * Detect NEON support using pure JavaScript
 * NEON is available on all ARM64 processors
 */
function detectNeonJS(): boolean {
  return process.arch === 'arm64';
}

/**
 * AMX availability is not detectable from JavaScript, and not detectable from
 * the native addon either. See `HardwareCapabilities.hasAmx`.
 */
const AMX_SUPPORT: CapabilitySupport = 'unknown';

/**
 * Detect SME support using pure JavaScript
 * SME is only available on M4 and later - we can't reliably detect this
 * without native code, so we return false as a conservative default
 */
function detectSmeJS(): boolean {
  // SME detection requires native sysctl calls
  // Return false as conservative default
  return false;
}

/**
 * Detect Metal support using pure JavaScript
 * Metal is available on macOS
 */
function detectMetalJS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Get CPU core count using pure JavaScript
 */
function getCpuCoresJS(): number {
  return os.cpus().length;
}

/**
 * Fallback hardware detection using pure JavaScript
 * Used when native bindings are not available
 */
function detectHardwareCapabilitiesJS(): HardwareCapabilities {
  debugLog('Using JavaScript fallback for hardware detection');

  const isAppleSilicon = detectAppleSiliconJS();

  const result: HardwareCapabilities = {
    hasNeon: detectNeonJS(),
    hasAmx: AMX_SUPPORT,
    hasSme: detectSmeJS(),
    hasMetal: detectMetalJS(),
    unifiedMemory: isAppleSilicon,
    cpuCores: getCpuCoresJS(),
  };

  return result;
}

/**
 * Detect hardware capabilities using C++ native binding
 */
function detectHardwareCapabilitiesCpp(): HardwareCapabilities | null {
  const binding = loadCppBinding();
  if (!binding) {
    debugLog('C++ binding not available');
    return null;
  }

  try {
    const caps = binding.getHardwareCapabilities();
    debugLog('Hardware capabilities detected via C++ binding', caps);

    const result: HardwareCapabilities = {
      hasNeon: caps.hasNeon,
      // The addon no longer reports AMX; it cannot detect it.
      hasAmx: AMX_SUPPORT,
      hasSme: caps.hasSme,
      hasMetal: caps.hasMetal,
      unifiedMemory: caps.unifiedMemory,
      cpuCores: caps.cpuCores,
    };

    // Only add optional properties if they have values
    if (caps.gpuCores !== undefined && caps.gpuCores > 0) {
      (result as { gpuCores?: number }).gpuCores = caps.gpuCores;
    }
    if (caps.metalDeviceName) {
      (result as { metalDeviceName?: string }).metalDeviceName = caps.metalDeviceName;
    }
    if (caps.metalMaxThreadsPerGroup !== undefined && caps.metalMaxThreadsPerGroup > 0) {
      (result as { metalMaxThreadsPerGroup?: number }).metalMaxThreadsPerGroup =
        caps.metalMaxThreadsPerGroup;
    }

    return result;
  } catch (error) {
    debugLog('Error detecting capabilities via C++ binding', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Detect hardware capabilities using Rust native binding
 */
function detectHardwareCapabilitiesRust(): HardwareCapabilities | null {
  const binding = loadRustBinding();
  if (!binding) {
    debugLog('Rust binding not available');
    return null;
  }

  try {
    const caps = binding.detectRustCapabilities();
    debugLog('Hardware capabilities detected via Rust binding', {
      ...caps,
    });

    // Rust binding doesn't have Metal info, so we need to supplement
    const isAppleSilicon = binding.isAppleSilicon();

    const result: HardwareCapabilities = {
      hasNeon: caps.hasNeon,
      // The Rust addon's hasAmx is the same brand-string guess; ignore it.
      hasAmx: AMX_SUPPORT,
      hasSme: caps.hasSme,
      hasMetal: process.platform === 'darwin', // Rust doesn't detect Metal directly
      unifiedMemory: isAppleSilicon,
      cpuCores: caps.cpuCores,
    };

    return result;
  } catch (error) {
    debugLog('Error detecting capabilities via Rust binding', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// Cached capabilities to avoid repeated detection
let cachedCapabilities: HardwareCapabilities | null = null;

/**
 * Detect hardware capabilities on the current system
 *
 * This function detects available hardware acceleration features:
 * - NEON SIMD (available on all ARM64 processors)
 * - AMX: always reported as 'unknown' (no user-space query exists)
 * - SME (Scalable Matrix Extension, available on M4 and later)
 * - Metal GPU compute (available on macOS)
 *
 * The function tries native bindings first (C++, then Rust) for accurate
 * detection, falling back to JavaScript-based detection if native bindings
 * are not available.
 *
 * Results are cached after the first call for performance.
 *
 * @returns Hardware capabilities object
 *
 * @example
 * ```typescript
 * const caps = detectHardwareCapabilities();
 * console.log(`NEON: ${caps.hasNeon}, Metal: ${caps.hasMetal}`);
 * if (caps.metalDeviceName) {
 *   console.log(`GPU: ${caps.metalDeviceName}`);
 * }
 * ```
 */
export function detectHardwareCapabilities(): HardwareCapabilities {
  // Return cached result if available
  if (cachedCapabilities !== null) {
    return cachedCapabilities;
  }

  debugLog('Starting hardware capability detection');

  // Try C++ binding first (most complete, includes Metal info)
  let capabilities = detectHardwareCapabilitiesCpp();

  // Fall back to Rust binding if C++ not available
  if (capabilities === null) {
    capabilities = detectHardwareCapabilitiesRust();
  }

  // Fall back to JavaScript detection if no native bindings
  if (capabilities === null) {
    capabilities = detectHardwareCapabilitiesJS();
  }

  // Cache the result
  cachedCapabilities = capabilities;

  // Log final capabilities at debug level
  debugLog('Hardware capability detection complete', {
    hasNeon: capabilities.hasNeon,
    hasAmx: capabilities.hasAmx,
    hasSme: capabilities.hasSme,
    hasMetal: capabilities.hasMetal,
    unifiedMemory: capabilities.unifiedMemory,
    cpuCores: capabilities.cpuCores,
    gpuCores: capabilities.gpuCores,
    metalDeviceName: capabilities.metalDeviceName,
    metalMaxThreadsPerGroup: capabilities.metalMaxThreadsPerGroup,
  });

  return capabilities;
}

/**
 * Clear the cached hardware capabilities
 *
 * This is primarily useful for testing or when hardware configuration
 * might have changed (e.g., external GPU connected/disconnected).
 */
export function clearHardwareCapabilitiesCache(): void {
  cachedCapabilities = null;
  debugLog('Hardware capabilities cache cleared');
}

/**
 * Get a human-readable summary of hardware capabilities
 *
 * @returns A formatted string describing available hardware acceleration
 *
 * @example
 * ```typescript
 * console.log(getHardwareCapabilitiesSummary());
 * // Output:
 * // Hardware Capabilities:
 * //   CPU: 12 cores
 * //   NEON SIMD: ✓
 * //   AMX: ? (not detectable)
 * //   SME: ✗
 * //   Metal GPU: ✓ (Apple M4 Max, 40 cores)
 * //   Unified Memory: ✓
 * ```
 */
function formatCapability(value: CapabilitySupport, check: string, cross: string): string {
  if (value === 'unknown') {
    return '? (not detectable)';
  }
  return value ? check : cross;
}

export function getHardwareCapabilitiesSummary(): string {
  const caps = detectHardwareCapabilities();
  const check = '✓';
  const cross = '✗';

  const lines = [
    'Hardware Capabilities:',
    `  CPU: ${caps.cpuCores} cores`,
    `  NEON SIMD: ${caps.hasNeon ? check : cross}`,
    `  AMX: ${formatCapability(caps.hasAmx, check, cross)}`,
    `  SME: ${caps.hasSme ? check : cross}`,
  ];

  if (caps.hasMetal) {
    const gpuInfo = caps.metalDeviceName
      ? ` (${caps.metalDeviceName}${caps.gpuCores ? `, ~${caps.gpuCores} cores` : ''})`
      : '';
    lines.push(`  Metal GPU: ${check}${gpuInfo}`);
  } else {
    lines.push(`  Metal GPU: ${cross}`);
  }

  lines.push(`  Unified Memory: ${caps.unifiedMemory ? check : cross}`);

  return lines.join('\n');
}

/**
 * Check if any hardware acceleration is available
 *
 * @returns true if at least one hardware acceleration feature is available
 */
export function hasHardwareAcceleration(): boolean {
  const caps = detectHardwareCapabilities();
  // hasAmx is excluded: it is never known, and 'unknown' is not a yes.
  return caps.hasNeon || caps.hasSme || caps.hasMetal;
}

/**
 * Get the native binding status for hardware detection
 *
 * @returns Object indicating which native bindings are loaded
 */
export function getHardwareDetectionStatus(): {
  cppBindingLoaded: boolean;
  rustBindingLoaded: boolean;
  usingFallback: boolean;
} {
  const status = getNativeBindingStatus();
  return {
    cppBindingLoaded: status.cppLoaded,
    rustBindingLoaded: status.rustLoaded,
    usingFallback: !status.cppLoaded && !status.rustLoaded,
  };
}
