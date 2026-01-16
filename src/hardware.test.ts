/**
 * Tests for hardware capability detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectHardwareCapabilities,
  clearHardwareCapabilitiesCache,
  getHardwareCapabilitiesSummary,
  hasHardwareAcceleration,
  getHardwareDetectionStatus,
  type HardwareCapabilities,
} from './hardware.js';

describe('Hardware Capability Detection', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure fresh detection
    clearHardwareCapabilitiesCache();
  });

  describe('detectHardwareCapabilities', () => {
    it('should return a valid HardwareCapabilities object', () => {
      const caps = detectHardwareCapabilities();

      expect(caps).toBeDefined();
      expect(typeof caps.hasNeon).toBe('boolean');
      expect(typeof caps.hasAmx).toBe('boolean');
      expect(typeof caps.hasSme).toBe('boolean');
      expect(typeof caps.hasMetal).toBe('boolean');
      expect(typeof caps.unifiedMemory).toBe('boolean');
      expect(typeof caps.cpuCores).toBe('number');
      expect(caps.cpuCores).toBeGreaterThanOrEqual(1);
    });

    it('should cache results on subsequent calls', () => {
      const caps1 = detectHardwareCapabilities();
      const caps2 = detectHardwareCapabilities();

      // Should return the same object reference due to caching
      expect(caps1).toBe(caps2);
    });

    it('should return fresh results after cache clear', () => {
      const caps1 = detectHardwareCapabilities();
      clearHardwareCapabilitiesCache();
      const caps2 = detectHardwareCapabilities();

      // Should be equal in value but potentially different references
      expect(caps2.cpuCores).toBe(caps1.cpuCores);
    });

    it('should detect NEON on ARM64 architecture', () => {
      const caps = detectHardwareCapabilities();

      if (process.arch === 'arm64') {
        expect(caps.hasNeon).toBe(true);
      }
    });

    it('should detect Metal on macOS', () => {
      const caps = detectHardwareCapabilities();

      if (process.platform === 'darwin') {
        expect(caps.hasMetal).toBe(true);
      }
    });

    it('should detect AMX on Apple Silicon', () => {
      const caps = detectHardwareCapabilities();

      if (process.platform === 'darwin' && process.arch === 'arm64') {
        expect(caps.hasAmx).toBe(true);
      }
    });

    it('should detect unified memory on Apple Silicon', () => {
      const caps = detectHardwareCapabilities();

      if (process.platform === 'darwin' && process.arch === 'arm64') {
        expect(caps.unifiedMemory).toBe(true);
      }
    });
  });

  describe('getHardwareCapabilitiesSummary', () => {
    it('should return a formatted string', () => {
      const summary = getHardwareCapabilitiesSummary();

      expect(typeof summary).toBe('string');
      expect(summary).toContain('Hardware Capabilities:');
      expect(summary).toContain('CPU:');
      expect(summary).toContain('cores');
      expect(summary).toContain('NEON SIMD:');
      expect(summary).toContain('AMX:');
      expect(summary).toContain('SME:');
      expect(summary).toContain('Metal GPU:');
      expect(summary).toContain('Unified Memory:');
    });

    it('should include check marks or crosses for each capability', () => {
      const summary = getHardwareCapabilitiesSummary();

      // Should contain either ✓ or ✗ for each capability
      const checkCount = (summary.match(/✓/g) || []).length;
      const crossCount = (summary.match(/✗/g) || []).length;

      // Should have at least 5 status indicators (NEON, AMX, SME, Metal, Unified Memory)
      expect(checkCount + crossCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe('hasHardwareAcceleration', () => {
    it('should return a boolean', () => {
      const result = hasHardwareAcceleration();
      expect(typeof result).toBe('boolean');
    });

    it('should return true on Apple Silicon', () => {
      if (process.platform === 'darwin' && process.arch === 'arm64') {
        expect(hasHardwareAcceleration()).toBe(true);
      }
    });
  });

  describe('getHardwareDetectionStatus', () => {
    it('should return binding status information', () => {
      const status = getHardwareDetectionStatus();

      expect(typeof status.cppBindingLoaded).toBe('boolean');
      expect(typeof status.rustBindingLoaded).toBe('boolean');
      expect(typeof status.usingFallback).toBe('boolean');
    });

    it('should indicate fallback when no native bindings are loaded', () => {
      const status = getHardwareDetectionStatus();

      // If neither binding is loaded, should be using fallback
      if (!status.cppBindingLoaded && !status.rustBindingLoaded) {
        expect(status.usingFallback).toBe(true);
      }
    });
  });

  describe('clearHardwareCapabilitiesCache', () => {
    it('should clear the cache without throwing', () => {
      // First detection
      detectHardwareCapabilities();

      // Clear should not throw
      expect(() => clearHardwareCapabilitiesCache()).not.toThrow();
    });
  });
});
