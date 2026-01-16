/**
 * @digitaldefiance/node-zk-accelerate
 *
 * Zero-Knowledge Proof acceleration library for Node.js
 * maximizing Apple Silicon M4 Max hardware utilization.
 */

// Core types
export * from './types.js';

// Hardware detection
export {
  detectHardwareCapabilities,
  clearHardwareCapabilitiesCache,
  getHardwareCapabilitiesSummary,
  hasHardwareAcceleration,
  getHardwareDetectionStatus,
  type HardwareCapabilities,
} from './hardware.js';

// Error handling
export * from './errors.js';

// Native binding utilities
export {
  getNativeBindingStatus,
  hasNativeBinding,
  hasCppBinding,
  hasRustBinding,
  type NativeBindingStatus,
} from './native.js';

// Field arithmetic
export * from './field/index.js';

// Curve operations
export * from './curve/index.js';

// NTT operations
export * from './ntt/index.js';

// MSM operations
export * from './msm/index.js';
