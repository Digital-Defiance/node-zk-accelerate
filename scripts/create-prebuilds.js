#!/usr/bin/env node
/**
 * @digitaldefiance/node-zk-accelerate
 * Create Prebuilt Binaries Script
 *
 * This script packages prebuilt binaries for distribution.
 * It collects all native artifacts and organizes them for npm publishing.
 *
 * Requirements: 13.6
 */

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, readFileSync } from 'fs';
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
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}[prebuild]${colors.reset} ${message}`);
}

function logSuccess(message) {
  log(message, colors.green);
}

function logWarning(message) {
  log(message, colors.yellow);
}

/**
 * Get package version from package.json
 */
function getPackageVersion() {
  const packageJson = join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(readFileSync(packageJson, 'utf8'));
  return pkg.version;
}

/**
 * Create prebuild directory structure
 */
function createPrebuildDir() {
  const prebuildDir = join(ROOT_DIR, 'prebuilds', `${platform}-${arch}`);
  
  if (!existsSync(prebuildDir)) {
    mkdirSync(prebuildDir, { recursive: true });
  }
  
  return prebuildDir;
}

/**
 * Copy native C++ addon
 */
function copyNativeAddon(prebuildDir) {
  const sources = [
    join(ROOT_DIR, 'build', 'Release', 'zk_accelerate.node'),
    join(ROOT_DIR, 'build', 'Debug', 'zk_accelerate.node'),
    // Prebuildify creates the addon with package name format
    join(ROOT_DIR, 'prebuilds', `${platform}-${arch}`, '@digitaldefiance+node-zk-accelerate.node'),
  ];

  for (const src of sources) {
    if (existsSync(src)) {
      const dest = join(prebuildDir, 'zk_accelerate.node');
      // Skip if source and dest are the same (prebuildify output)
      if (src.includes('prebuilds') && src.includes('@digitaldefiance')) {
        logSuccess(`Native addon already in prebuilds: ${src}`);
        return true;
      }
      copyFileSync(src, dest);
      logSuccess(`Copied native addon: ${src}`);
      return true;
    }
  }

  // Check if prebuildify already created the addon
  const prebuildifyAddon = join(prebuildDir, '@digitaldefiance+node-zk-accelerate.node');
  if (existsSync(prebuildifyAddon)) {
    logSuccess(`Native addon created by prebuildify: ${prebuildifyAddon}`);
    return true;
  }

  logWarning('Native C++ addon not found');
  return false;
}

/**
 * Copy Rust addon
 */
function copyRustAddon(prebuildDir) {
  const nodeName = `zk-accelerate-rs.${platform}-${arch}.node`;
  const sources = [
    join(ROOT_DIR, 'native-rust', nodeName),
    join(ROOT_DIR, nodeName),
  ];

  for (const src of sources) {
    if (existsSync(src)) {
      const dest = join(prebuildDir, nodeName);
      copyFileSync(src, dest);
      logSuccess(`Copied Rust addon: ${src}`);
      return true;
    }
  }

  logWarning('Rust addon not found');
  return false;
}

/**
 * Copy Metal shader libraries
 */
function copyMetalLibs(prebuildDir) {
  if (platform !== 'darwin') {
    return false;
  }

  const metalDir = join(ROOT_DIR, 'native', 'compiled-shaders');
  if (!existsSync(metalDir)) {
    logWarning('Compiled Metal shaders not found');
    return false;
  }

  const metalLibs = readdirSync(metalDir).filter(f => f.endsWith('.metallib'));
  
  for (const lib of metalLibs) {
    const src = join(metalDir, lib);
    const dest = join(prebuildDir, lib);
    copyFileSync(src, dest);
    logSuccess(`Copied Metal library: ${lib}`);
  }

  return metalLibs.length > 0;
}

/**
 * Create manifest file
 */
function createManifest(prebuildDir, artifacts) {
  const manifest = {
    version: getPackageVersion(),
    platform,
    arch,
    created: new Date().toISOString(),
    artifacts: {
      native: artifacts.native,
      rust: artifacts.rust,
      metal: artifacts.metal,
    },
    nodeVersion: process.version,
    napiVersion: 8,
  };

  const manifestPath = join(prebuildDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  logSuccess('Created manifest.json');
}

/**
 * Run prebuildify if available
 */
function runPrebuildify() {
  try {
    log('Running prebuildify...');
    execSync('npx prebuildify --napi --strip', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    logSuccess('Prebuildify completed');
    return true;
  } catch (error) {
    logWarning('Prebuildify failed or not available');
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  log(`Creating prebuilds for ${platform}-${arch}`);

  // Run prebuildify first
  runPrebuildify();

  // Create prebuild directory
  const prebuildDir = createPrebuildDir();
  log(`Prebuild directory: ${prebuildDir}`);

  // Copy artifacts
  const artifacts = {
    native: copyNativeAddon(prebuildDir),
    rust: copyRustAddon(prebuildDir),
    metal: copyMetalLibs(prebuildDir),
  };

  // Create manifest
  createManifest(prebuildDir, artifacts);

  // Summary
  log('\nPrebuild Summary:');
  log(`  Platform: ${platform}-${arch}`);
  log(`  Native C++ addon: ${artifacts.native ? '✓' : '✗'}`);
  log(`  Rust addon: ${artifacts.rust ? '✓' : '✗'}`);
  log(`  Metal shaders: ${artifacts.metal ? '✓' : 'N/A'}`);

  if (artifacts.native || artifacts.rust) {
    logSuccess('\nPrebuilds created successfully!');
  } else {
    logWarning('\nNo native artifacts found. Build native code first.');
  }
}

main().catch((error) => {
  console.error('Error creating prebuilds:', error);
  process.exit(1);
});
