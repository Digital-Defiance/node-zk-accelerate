//! @digitaldefiance/node-zk-accelerate
//! Rust native components for ZK acceleration
//!
//! This module provides Rust-based native bindings for high-performance
//! ZK proof operations, leveraging Apple Silicon hardware acceleration.

use napi_derive::napi;

/// Hardware capabilities structure exposed to JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct RustHardwareCapabilities {
    /// Whether NEON SIMD is available
    pub has_neon: bool,
    // NOTE: no `has_amx`. AMX has no user-space availability query, so it is
    // not reported here. The previous implementation returned `true` for any
    // macOS/aarch64 target, which asserts the coprocessor from the build
    // target alone. The TypeScript layer reports AMX as 'unknown'.
    /// Whether SME (Scalable Matrix Extension) is available (M4+),
    /// as reported by `hw.optional.arm.FEAT_SME`
    pub has_sme: bool,
    /// Number of CPU cores
    pub cpu_cores: u32,
    /// Target architecture
    pub arch: String,
    /// Target OS
    pub os: String,
}

/// Detect hardware capabilities from Rust
///
/// Returns a structure containing information about available
/// hardware acceleration features on the current system.
#[napi]
pub fn detect_rust_capabilities() -> RustHardwareCapabilities {
    RustHardwareCapabilities {
        has_neon: detect_neon(),
        has_sme: detect_sme(),
        cpu_cores: get_cpu_count(),
        arch: get_arch(),
        os: get_os(),
    }
}

/// Detect NEON SIMD support
fn detect_neon() -> bool {
    cfg!(target_arch = "aarch64")
}

/// Detect SME support (M4+)
fn detect_sme() -> bool {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        detect_sme_runtime()
    }
    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    {
        false
    }
}

/// Runtime SME detection for macOS.
///
/// Queries `hw.optional.arm.FEAT_SME` and reports what the kernel says. If the
/// sysctl is unavailable this returns false; it does not fall back to matching
/// the CPU brand string against "M4", because a marketing name is not a
/// feature bit.
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn detect_sme_runtime() -> bool {
    use std::os::raw::{c_char, c_int, c_void};
    
    extern "C" {
        fn sysctlbyname(
            name: *const c_char,
            oldp: *mut c_void,
            oldlenp: *mut usize,
            newp: *mut c_void,
            newlen: usize,
        ) -> c_int;
    }
    
    let name = b"hw.optional.arm.FEAT_SME\0";
    let mut value: i64 = 0;
    let mut size = std::mem::size_of::<i64>();
    
    unsafe {
        let result = sysctlbyname(
            name.as_ptr() as *const c_char,
            &mut value as *mut i64 as *mut c_void,
            &mut size,
            std::ptr::null_mut(),
            0,
        );
        
        if result == 0 {
            return value != 0;
        }
    }

    false
}

/// Get CPU core count
fn get_cpu_count() -> u32 {
    std::thread::available_parallelism()
        .map(|p| p.get() as u32)
        .unwrap_or(1)
}

/// Get target architecture string
fn get_arch() -> String {
    #[cfg(target_arch = "aarch64")]
    { "aarch64".to_string() }
    #[cfg(target_arch = "x86_64")]
    { "x86_64".to_string() }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    { "unknown".to_string() }
}

/// Get target OS string
fn get_os() -> String {
    #[cfg(target_os = "macos")]
    { "macos".to_string() }
    #[cfg(target_os = "linux")]
    { "linux".to_string() }
    #[cfg(target_os = "windows")]
    { "windows".to_string() }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { "unknown".to_string() }
}

/// Get the Rust component version
#[napi]
pub fn rust_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check if running on Apple Silicon
#[napi]
pub fn is_apple_silicon() -> bool {
    cfg!(all(target_os = "macos", target_arch = "aarch64"))
}

/// Native binding status information
#[napi(object)]
#[derive(Debug, Clone)]
pub struct NativeBindingStatus {
    /// Whether the Rust binding is loaded
    pub rust_loaded: bool,
    /// Rust component version
    pub rust_version: String,
    /// Whether running on Apple Silicon
    pub apple_silicon: bool,
    /// Hardware capabilities
    pub capabilities: RustHardwareCapabilities,
}

/// Get the status of native bindings
#[napi]
pub fn get_binding_status() -> NativeBindingStatus {
    NativeBindingStatus {
        rust_loaded: true,
        rust_version: rust_version(),
        apple_silicon: is_apple_silicon(),
        capabilities: detect_rust_capabilities(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_capabilities() {
        let caps = detect_rust_capabilities();
        assert!(caps.cpu_cores >= 1);
        assert!(!caps.arch.is_empty());
        assert!(!caps.os.is_empty());
    }

    #[test]
    fn test_rust_version() {
        let version = rust_version();
        assert!(!version.is_empty());
    }

    #[test]
    fn test_binding_status() {
        let status = get_binding_status();
        assert!(status.rust_loaded);
        assert!(!status.rust_version.is_empty());
    }
}
