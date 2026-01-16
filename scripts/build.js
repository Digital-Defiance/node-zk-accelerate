#!/usr/bin/env node
/**
 * @digitaldefiance/node-zk-accelerate
 * Unified Build Script
 *
 * This script orchestrates the complete build process including:
 * - TypeScript compilation
 * - Native C++ compilation (node-gyp)
 * - Rust compilation (napi-rs)
 * - Metal shader compilation
 *
 * Requirements: 13.1, 13.2, 13.3
 */

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Build configuration
const BUILD_CONFIG = {
  typescript: {
    enabled: true,
    configs: ['tsconfig.cjs.json', 'tsconfig.esm.json', 'tsconfig.types.json'],
  },
  native: {
    enabled: true,
    debug: false,
  },
  rust: {
    enabled: true,
    release: true,
  },
  metal: {
    enabled: process.platform === 'darwin',
    shaderDir: 'native/shaders',
    outputDir: 'native/compiled-shaders',
  },
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, colors.cyan);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

/**
 * Run a command and return a promise
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      cwd: options.cwd || ROOT_DIR,
      shell: process.platform === 'win32',
      ...options,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Check if a command exists
 */
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build TypeScript
 */
async function buildTypeScript() {
  if (!BUILD_CONFIG.typescript.enabled) {
    logWarning('TypeScript build disabled');
    return;
  }

  logStep('TypeScript', 'Compiling TypeScript...');

  for (const config of BUILD_CONFIG.typescript.configs) {
    const configPath = join(ROOT_DIR, config);
    if (!existsSync(configPath)) {
      logWarning(`Config not found: ${config}`);
      continue;
    }

    await runCommand('npx', ['tsc', '-p', config]);
    logSuccess(`Compiled ${config}`);
  }
}

/**
 * Build native C++ addon using node-gyp
 */
async function buildNative() {
  if (!BUILD_CONFIG.native.enabled) {
    logWarning('Native build disabled');
    return;
  }

  logStep('Native', 'Building C++ native addon...');

  // Check for node-gyp
  if (!commandExists('node-gyp')) {
    logWarning('node-gyp not found, trying npx...');
  }

  const args = ['rebuild'];
  if (BUILD_CONFIG.native.debug) {
    args.push('--debug');
  }

  try {
    await runCommand('npx', ['node-gyp', ...args]);
    logSuccess('Native C++ addon built successfully');
  } catch (error) {
    logError(`Native build failed: ${error.message}`);
    throw error;
  }
}

/**
 * Build Rust components using napi-rs
 */
async function buildRust() {
  if (!BUILD_CONFIG.rust.enabled) {
    logWarning('Rust build disabled');
    return;
  }

  logStep('Rust', 'Building Rust native components...');

  // Check for cargo
  if (!commandExists('cargo')) {
    logWarning('Cargo not found, skipping Rust build');
    return;
  }

  const rustDir = join(ROOT_DIR, 'native-rust');
  if (!existsSync(rustDir)) {
    logWarning('native-rust directory not found');
    return;
  }

  const args = ['build', '--platform'];
  if (BUILD_CONFIG.rust.release) {
    args.push('--release');
  }

  try {
    await runCommand('npx', ['napi', ...args], { cwd: rustDir });
    logSuccess('Rust components built successfully');

    // Copy the built .node file to the expected location
    const platform = process.platform;
    const arch = process.arch;
    const nodeName = `zk-accelerate-rs.${platform}-${arch}.node`;
    const srcPath = join(rustDir, nodeName);
    
    if (existsSync(srcPath)) {
      logSuccess(`Built: ${nodeName}`);
    }
  } catch (error) {
    logError(`Rust build failed: ${error.message}`);
    throw error;
  }
}

/**
 * Compile Metal shaders
 */
async function buildMetalShaders() {
  if (!BUILD_CONFIG.metal.enabled) {
    logWarning('Metal shader compilation disabled (not on macOS)');
    return;
  }

  logStep('Metal', 'Compiling Metal shaders...');

  const shaderDir = join(ROOT_DIR, BUILD_CONFIG.metal.shaderDir);
  const outputDir = join(ROOT_DIR, BUILD_CONFIG.metal.outputDir);

  if (!existsSync(shaderDir)) {
    logWarning('Shader directory not found');
    return;
  }

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Check for Metal compiler
  if (!commandExists('xcrun')) {
    logWarning('xcrun not found, skipping Metal shader compilation');
    return;
  }

  const shaderFiles = ['msm.metal', 'ntt.metal'];

  for (const shaderFile of shaderFiles) {
    const srcPath = join(shaderDir, shaderFile);
    if (!existsSync(srcPath)) {
      logWarning(`Shader not found: ${shaderFile}`);
      continue;
    }

    const baseName = shaderFile.replace('.metal', '');
    const airPath = join(outputDir, `${baseName}.air`);
    const libPath = join(outputDir, `${baseName}.metallib`);

    try {
      // Compile to AIR (Apple Intermediate Representation)
      await runCommand('xcrun', [
        '-sdk', 'macosx',
        'metal',
        '-c', srcPath,
        '-o', airPath,
      ]);

      // Link to metallib
      await runCommand('xcrun', [
        '-sdk', 'macosx',
        'metallib',
        airPath,
        '-o', libPath,
      ]);

      logSuccess(`Compiled ${shaderFile} -> ${baseName}.metallib`);
    } catch (error) {
      logWarning(`Failed to compile ${shaderFile}: ${error.message}`);
    }
  }
}

/**
 * Create prebuilt binary package
 */
async function createPrebuild() {
  logStep('Prebuild', 'Creating prebuilt binary...');

  const platform = process.platform;
  const arch = process.arch;
  const prebuildDir = join(ROOT_DIR, 'prebuilds', `${platform}-${arch}`);

  if (!existsSync(prebuildDir)) {
    mkdirSync(prebuildDir, { recursive: true });
  }

  // Copy native addon
  const nativeAddon = join(ROOT_DIR, 'build', 'Release', 'zk_accelerate.node');
  if (existsSync(nativeAddon)) {
    copyFileSync(nativeAddon, join(prebuildDir, 'zk_accelerate.node'));
    logSuccess('Copied native addon to prebuilds');
  }

  // Copy Rust addon
  const rustAddon = join(ROOT_DIR, 'native-rust', `zk-accelerate-rs.${platform}-${arch}.node`);
  if (existsSync(rustAddon)) {
    copyFileSync(rustAddon, join(prebuildDir, `zk-accelerate-rs.${platform}-${arch}.node`));
    logSuccess('Copied Rust addon to prebuilds');
  }

  // Copy Metal libraries
  const metalLibDir = join(ROOT_DIR, BUILD_CONFIG.metal.outputDir);
  if (existsSync(metalLibDir)) {
    const metalLibs = ['msm.metallib', 'ntt.metallib'];
    for (const lib of metalLibs) {
      const libPath = join(metalLibDir, lib);
      if (existsSync(libPath)) {
        copyFileSync(libPath, join(prebuildDir, lib));
        logSuccess(`Copied ${lib} to prebuilds`);
      }
    }
  }
}

/**
 * Clean build artifacts
 */
async function clean() {
  logStep('Clean', 'Cleaning build artifacts...');

  const dirsToClean = [
    'dist',
    'build',
    'native-rust/target',
    BUILD_CONFIG.metal.outputDir,
  ];

  for (const dir of dirsToClean) {
    const fullPath = join(ROOT_DIR, dir);
    if (existsSync(fullPath)) {
      try {
        await runCommand('rm', ['-rf', fullPath]);
        logSuccess(`Cleaned ${dir}`);
      } catch {
        logWarning(`Failed to clean ${dir}`);
      }
    }
  }
}

/**
 * Main build function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  log(`\n${colors.bright}@digitaldefiance/node-zk-accelerate Build System${colors.reset}`);
  log(`Platform: ${process.platform}, Arch: ${process.arch}\n`);

  try {
    switch (command) {
      case 'all':
        await buildTypeScript();
        await buildNative();
        await buildRust();
        await buildMetalShaders();
        await createPrebuild();
        break;

      case 'ts':
      case 'typescript':
        await buildTypeScript();
        break;

      case 'native':
      case 'cpp':
        await buildNative();
        break;

      case 'rust':
        await buildRust();
        break;

      case 'metal':
      case 'shaders':
        await buildMetalShaders();
        break;

      case 'prebuild':
        await createPrebuild();
        break;

      case 'clean':
        await clean();
        break;

      default:
        log(`Unknown command: ${command}`);
        log('\nAvailable commands:');
        log('  all        - Build everything (default)');
        log('  ts         - Build TypeScript only');
        log('  native     - Build C++ native addon only');
        log('  rust       - Build Rust components only');
        log('  metal      - Compile Metal shaders only');
        log('  prebuild   - Create prebuilt binaries');
        log('  clean      - Clean build artifacts');
        process.exit(1);
    }

    log(`\n${colors.green}${colors.bright}Build completed successfully!${colors.reset}\n`);
  } catch (error) {
    logError(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
