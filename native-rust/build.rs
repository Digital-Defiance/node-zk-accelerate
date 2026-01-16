extern crate napi_build;

fn main() {
    napi_build::setup();
    
    // Link Apple frameworks on macOS
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=Accelerate");
        println!("cargo:rustc-link-lib=framework=Metal");
        println!("cargo:rustc-link-lib=framework=MetalKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CoreFoundation");
        
        // Set deployment target for macOS
        println!("cargo:rustc-env=MACOSX_DEPLOYMENT_TARGET=12.0");
    }
    
    // Enable ARM64 optimizations
    #[cfg(target_arch = "aarch64")]
    {
        println!("cargo:rustc-cfg=aarch64");
    }
    
    // Rerun if build script changes
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/lib.rs");
}
