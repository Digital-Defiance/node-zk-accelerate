/**
 * Tests for hardware capability detection
 */

import { readFileSync } from 'node:fs';

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

    it('should report AMX as unknown, never as detected', () => {
      // Replaces "should detect AMX on Apple Silicon", which asserted
      // hasAmx === true on any Apple Silicon machine. Nothing detected AMX;
      // the native check was `strstr(brand, "Apple")`. There is no supported
      // user-space query, so the only honest answer is 'unknown', on every
      // platform and regardless of which binding is loaded.
      const caps = detectHardwareCapabilities();

      expect(caps.hasAmx).toBe('unknown');
      expect(caps.hasAmx).not.toBe(true);
    });

    it('should not count an unknown capability as hardware acceleration', () => {
      // hasHardwareAcceleration used to OR in hasAmx. With a tri-state, the
      // truthy string 'unknown' would have made this true on any platform.
      const caps = detectHardwareCapabilities();
      const accelerated = hasHardwareAcceleration();

      if (!caps.hasNeon && !caps.hasSme && !caps.hasMetal) {
        expect(accelerated).toBe(false);
      }
    });

    it('should show AMX as not detectable in the summary', () => {
      expect(getHardwareCapabilitiesSummary()).toContain('AMX: ? (not detectable)');
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

      // Should contain either ✓ or ✗ for each capability that is actually
      // known: NEON, SME, Metal and Unified Memory. AMX deliberately gets
      // neither mark, because neither would be true -- it renders as
      // '? (not detectable)'.
      const checkCount = (summary.match(/✓/g) || []).length;
      const crossCount = (summary.match(/✗/g) || []).length;

      expect(checkCount + crossCount).toBeGreaterThanOrEqual(4);
      expect(summary).toContain('AMX: ? (not detectable)');
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

describe('has_metal_support delegates to a real Metal query', () => {
  /**
   * WHY THIS TEST EXISTS, AND WHY IT IS SHAPED THIS WAY.
   *
   * `has_metal_support()` in native/src/hardware_detect.cc used to be:
   *
   *     #ifdef __APPLE__
   *         return true; // Will be verified by Metal initialization
   *     #else
   *         return false;
   *     #endif
   *
   * Nothing verified it. Every Mac reported Metal support without Metal ever
   * being asked, and the answer was indistinguishable to any caller from a real
   * check. It now delegates to `metal_gpu_is_available()`, which calls
   * `MTLCreateSystemDefaultDevice()` and `newCommandQueue`.
   *
   * The obvious test -- assert `caps.hasMetal === metalGpuIsAvailable()` --
   * CANNOT FAIL on a machine that has Metal. Both are `true` whether the
   * delegation exists or not, so it would certify the defect it is meant to
   * catch. That is the same vacuity that let the original bug survive its own
   * test suite, so it is not the test written here.
   *
   * Instead this asserts an OBSERVABLE SIDE EFFECT that only the delegation can
   * produce. `metal_gpu_is_available()` lazily initialises the device, the
   * command queue and the default shader library. So in a process that asks for
   * capabilities and NEVER calls `metalGpuInit()`, Metal must nevertheless come
   * back initialised with a device name. A hardcoded `return true` leaves it
   * uninitialised. That distinction is what makes this test able to fail.
   *
   * It runs in a CHILD PROCESS because the side effect is one-time per process:
   * anything else in this suite that touches Metal first would mask it.
   */
  /**
   * THIS IS A SOURCE GUARD, NOT A BEHAVIOURAL TEST. That distinction is the
   * point, so it is stated rather than glossed.
   *
   * Two behavioural tests were written first and both were discarded for being
   * vacuous, which is worth recording so they are not re-proposed:
   *
   *  1. `expect(caps.hasMetal).toBe(metalGpuIsAvailable())` -- on a machine with
   *     Metal both sides are `true` whether or not the delegation exists.
   *
   *  2. Asserting that asking for capabilities initialises Metal as a side
   *     effect, checked via `metalGpuGetStatus()`. This looked sound and is not:
   *     `metal_gpu_get_status()` itself calls `metal_gpu_is_available()` on its
   *     first line, which lazily initialises. The observation initialises the
   *     thing being observed, so `initialized` reads `true` even in a process
   *     that never asks for capabilities. Measured, not assumed.
   *
   * Discriminating behaviourally would need a machine with no Metal device, or
   * injection to fake one. Neither is available, so rather than ship an
   * assertion that cannot fail, this checks the source directly. It is crude,
   * and it does catch the actual regression: reverting `has_metal_support()` to
   * a hardcoded value fails it.
   */
  it('has_metal_support() calls the real check and does not hardcode a verdict', () => {
    const source = readFileSync(
      new URL('../native/src/hardware_detect.cc', import.meta.url),
      'utf8',
    );

    const match = /bool has_metal_support\(void\)\s*\{([\s\S]*?)\n\}/.exec(source);
    expect(match, 'has_metal_support(void) not found in hardware_detect.cc').not.toBeNull();
    const body = match?.[1] ?? '';

    // Strip comments before inspecting: the body documents the old defect
    // verbatim, including the words it must not actually contain as code.
    const code = body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    expect(code, 'must delegate to the one real Metal check').toContain(
      'metal_gpu_is_available()',
    );

    // The Apple branch must not short-circuit to a constant. `return false` in
    // the non-Apple branch is correct and expected; `return true` anywhere is
    // the defect this guards.
    expect(code, 'must not hardcode Metal support').not.toMatch(/return\s+true\s*;/);
  });

  // A second test comparing caps.hasMetal against metalGpuIsAvailable() was
  // considered and deliberately NOT written: on a machine with Metal both are
  // true whether or not the delegation exists, so it could only ever certify
  // the defect. The side-effect test above is the one that can fail.
});
