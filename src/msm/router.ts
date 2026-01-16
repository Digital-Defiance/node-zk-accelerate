/**
 * MSM Acceleration Router
 *
 * This module selects the optimal acceleration path for MSM computation
 * based on input size, hardware availability, and user hints.
 *
 * Requirements: 2.4, 2.5
 */

import { detectHardwareCapabilities, type HardwareCapabilities } from '../hardware.js';
import { DEFAULT_MSM_CONFIG, type MSMConfig } from './config.js';

/**
 * Acceleration path for MSM computation
 */
export type AccelerationPath = 'cpu' | 'gpu' | 'hybrid';

/**
 * MSM router configuration
 */
export interface RouterConfig {
  /** Minimum points to consider GPU acceleration */
  gpuThreshold: number;
  /** Minimum points to consider hybrid CPU+GPU */
  hybridThreshold: number;
  /** User acceleration hint */
  hint: 'cpu' | 'gpu' | 'hybrid' | 'auto';
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  gpuThreshold: 4096,
  hybridThreshold: 65536,
  hint: 'auto',
};

/**
 * Select the optimal acceleration path for MSM
 *
 * Decision logic:
 * 1. If user provides explicit hint (not 'auto'), respect it if hardware supports it
 * 2. For small inputs (< gpuThreshold), use CPU
 * 3. For medium inputs (gpuThreshold to hybridThreshold), use GPU if available
 * 4. For large inputs (>= hybridThreshold), use hybrid if GPU available
 *
 * @param numPoints - Number of points in the MSM
 * @param config - Router configuration
 * @param capabilities - Hardware capabilities (auto-detected if not provided)
 * @returns The selected acceleration path
 */
export function selectAccelerationPath(
  numPoints: number,
  config: Partial<RouterConfig> = {},
  capabilities?: HardwareCapabilities
): AccelerationPath {
  const fullConfig: RouterConfig = {
    ...DEFAULT_ROUTER_CONFIG,
    ...config,
  };

  const caps = capabilities ?? detectHardwareCapabilities();

  // Handle explicit user hints
  if (fullConfig.hint !== 'auto') {
    return handleExplicitHint(fullConfig.hint, caps);
  }

  // Auto-select based on input size and hardware
  return autoSelectPath(numPoints, fullConfig, caps);
}

/**
 * Handle explicit user acceleration hint
 */
function handleExplicitHint(
  hint: 'cpu' | 'gpu' | 'hybrid',
  caps: HardwareCapabilities
): AccelerationPath {
  switch (hint) {
    case 'gpu':
      // Fall back to CPU if GPU not available
      return caps.hasMetal ? 'gpu' : 'cpu';

    case 'hybrid':
      // Fall back to GPU or CPU if hybrid not possible
      if (caps.hasMetal) {
        return 'hybrid';
      }
      return 'cpu';

    case 'cpu':
    default:
      return 'cpu';
  }
}

/**
 * Auto-select acceleration path based on input size and hardware
 */
function autoSelectPath(
  numPoints: number,
  config: RouterConfig,
  caps: HardwareCapabilities
): AccelerationPath {
  // Small inputs: always use CPU (GPU dispatch overhead not worth it)
  if (numPoints < config.gpuThreshold) {
    return 'cpu';
  }

  // No GPU available: use CPU
  if (!caps.hasMetal) {
    return 'cpu';
  }

  // Large inputs with GPU: use hybrid for best performance
  if (numPoints >= config.hybridThreshold) {
    return 'hybrid';
  }

  // Medium inputs with GPU: use GPU
  return 'gpu';
}

/**
 * Get acceleration path description for logging/debugging
 */
export function getAccelerationPathDescription(path: AccelerationPath): string {
  switch (path) {
    case 'cpu':
      return 'CPU (Pippenger with NEON/AMX optimization)';
    case 'gpu':
      return 'GPU (Metal compute shaders)';
    case 'hybrid':
      return 'Hybrid (CPU + GPU parallel execution)';
  }
}

/**
 * Estimate MSM execution time based on path and input size
 * Returns estimated milliseconds (rough approximation for routing decisions)
 */
export function estimateMsmTime(
  numPoints: number,
  path: AccelerationPath,
  caps: HardwareCapabilities
): number {
  // These are rough estimates based on typical Apple Silicon performance
  // Actual times vary significantly based on specific hardware and scalar distribution

  // Note: scalarBits would be used for more accurate estimation
  // const scalarBits = 254; // Assuming BN254

  switch (path) {
    case 'cpu': {
      // CPU: ~1-2 µs per point for optimized Pippenger
      const baseTimePerPoint = caps.hasAmx ? 1.0 : 2.0;
      return numPoints * baseTimePerPoint / 1000;
    }

    case 'gpu': {
      // GPU: ~0.5 µs per point for large inputs, but ~5ms dispatch overhead
      const dispatchOverhead = 5;
      const timePerPoint = 0.5;
      return dispatchOverhead + (numPoints * timePerPoint / 1000);
    }

    case 'hybrid': {
      // Hybrid: best of both, ~0.3 µs per point for very large inputs
      const dispatchOverhead = 5;
      const timePerPoint = 0.3;
      return dispatchOverhead + (numPoints * timePerPoint / 1000);
    }
  }
}

/**
 * Create MSM configuration from options
 */
export function createMsmConfig(options?: Partial<MSMConfig>): MSMConfig {
  return {
    ...DEFAULT_MSM_CONFIG,
    ...options,
  };
}
