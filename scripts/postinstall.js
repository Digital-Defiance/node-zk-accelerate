#!/usr/bin/env node
/**
 * @digitaldefiance/node-zk-accelerate
 * Post-install Script
 *
 * This script runs after npm install to:
 * 1. Check for prebuilt binaries
 * 2. Attempt to compile native code if prebuilts not available
 * 3. Fall back to WASM if native compilation fails
 *
 * Requirements: 13.1, 13.5, 13.7
 */

import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const platform = process.platform;
const arch = process.arch;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}[node-zk-accelerate]${colors.reset} ${message}`);
}

function logSuccess(message) {
  log(message, colors.green);
}

function logWarning(message) {
  log(message, colors.yellow);
}

function logError(message) {
  log(message, colors.red);
}

/**
 * Check if prebuilt binaries exist
 */
function checkPrebuilts() {
  const prebuildDir = join(ROOT_DIR, 'prebuilds', `${platform}-${arch}`);
  const nativeAddon = join(prebuildDir, 'zk_accelerate.node');
  const rustAddon = join(prebuildDir, `zk-accelerate-rs.${platform}-${arch}.node`);

  return {
    dir: prebuildDir,
    hasNative: existsSync(nativeAddon),
    hasRust: existsSync(rustAddon),
    nativePath: nativeAddon,
    rustPath: rustAddon,
  };
}

/**
 * Check if build artifacts exist
 */
function checkBuildArtifacts() {
  const nativeAddon = join(ROOT_DIR, 'build', 'Release', 'zk_accelerate.node');
  const rustAddon = join(ROOT_DIR, 'native-rust', `zk-accelerate-rs.${platform}-${arch}.node`);

  return {
    hasNative: existsSync(nativeAddon),
    hasRust: existsSync(rustAddon),
    nativePath: nativeAddon,
    rustPath: rustAddon,
  };
}

/**
 * Copy prebuilt binaries to expected locations
 */
function copyPrebuilts(prebuilts) {
  const buildDir = join(ROOT_DIR, 'build', 'Release');
  
  if (prebuilts.hasNative) {
    if (!existsSync(buildDir)) {
      mkdirSync(buildDir, { recursive: true });
    }
    const destPath = join(buildDir, 'zk_accelerate.node');
    if (!existsSync(destPath)) {
      copyFileSync(prebuilts.nativePath, destPath);
      logSuccess('Installed prebuilt C++ native addon');
    }
  }

  if (prebuilts.hasRust) {
    const destPath = join(ROOT_DIR, 'native-rust', `zk-accelerate-rs.${platform}-${arch}.node`);
    if (!existsSync(destPath)) {
      copyFileSync(prebuilts.rustPath, destPath);
      logSuccess('Installed prebuilt Rust addon');
    }
  }
}

/**
 * Attempt to compile native code
 */
function tryCompileNative() {
  log('Attempting to compile native code...');

  try {
    // Try node-gyp build
    execSync('npx node-gyp rebuild', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    logSuccess('Native C++ addon compiled successfully');
    return true;
  } catch (error) {
    logWarning('Native C++ compilation failed');
    return false;
  }
}

/**
 * Attempt to compile Rust code
 */
function tryCompileRust() {
  log('Attempting to compile Rust code...');

  // Check if cargo is available
  try {
    execSync('cargo --version', { stdio: 'ignore' });
  } catch {
    logWarning('Cargo not found, skipping Rust compilation');
    return false;
  }

  const rustDir = join(ROOT_DIR, 'native-rust');
  if (!existsSync(rustDir)) {
    logWarning('native-rust directory not found');
    return false;
  }

  try {
    execSync('npx napi build --platform --release', {
      cwd: rustDir,
      stdio: 'inherit',
    });
    logSuccess('Rust addon compiled successfully');
    return true;
  } catch (error) {
    logWarning('Rust compilation failed');
    return false;
  }
}

/**
 * Check platform compatibility
 */
function checkPlatformCompatibility() {
  // Primary target: Apple Silicon macOS
  if (platform === 'darwin' && arch === 'arm64') {
    return { compatible: true, optimal: true };
  }

  // Secondary: Intel macOS (limited acceleration)
  if (platform === 'darwin' && arch === 'x64') {
    return { compatible: true, optimal: false, message: 'Intel Mac detected. Some hardware acceleration features will be unavailable.' };
  }

  // Linux ARM64 (limited support)
  if (platform === 'linux' && arch === 'arm64') {
    return { compatible: true, optimal: false, message: 'Linux ARM64 detected. Apple-specific acceleration unavailable.' };
  }

  // Other platforms: WASM fallback only
  return {
    compatible: true,
    optimal: false,
    message: `Platform ${platform}-${arch} will use WASM fallback for all operations.`,
  };
}

/**
 * Main postinstall function
 */
async function main() {
  log(`Post-install for ${platform}-${arch}`);

  // Check platform compatibility
  const compatibility = checkPlatformCompatibility();
  if (compatibility.message) {
    logWarning(compatibility.message);
  }

  // Check for prebuilt binaries
  const prebuilts = checkPrebuilts();
  if (prebuilts.hasNative || prebuilts.hasRust) {
    log('Found prebuilt binaries');
    copyPrebuilts(prebuilts);
  }

  // Check for existing build artifacts
  const artifacts = checkBuildArtifacts();
  
  // If we have native bindings, we're done
  if (artifacts.hasNative || prebuilts.hasNative) {
    logSuccess('Native C++ addon available');
  } else if (platform === 'darwin') {
    // Try to compile on macOS
    tryCompileNative();
  }

  if (artifacts.hasRust || prebuilts.hasRust) {
    logSuccess('Rust addon available');
  } else {
    // Try to compile Rust if cargo is available
    tryCompileRust();
  }

  // Final status check
  const finalArtifacts = checkBuildArtifacts();
  const finalPrebuilts = checkPrebuilts();

  if (!finalArtifacts.hasNative && !finalPrebuilts.hasNative) {
    logWarning('No native C++ addon available. WASM fallback will be used.');
  }

  if (!finalArtifacts.hasRust && !finalPrebuilts.hasRust) {
    logWarning('No Rust addon available. Some features may be limited.');
  }

  if (compatibility.optimal) {
    logSuccess('Installation complete with full hardware acceleration support!');
  } else {
    log('Installation complete. Some features may use fallback implementations.');
  }
}

main().catch((error) => {
  logError(`Post-install failed: ${error.message}`);
  // Don't exit with error - allow installation to continue
  process.exit(0);
});
