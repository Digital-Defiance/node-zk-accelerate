/**
 * @digitaldefiance/node-zk-accelerate
 * Hardware capability detection
 */

#include "../include/zk_accelerate.h"
#include <cstring>

#ifdef __APPLE__
#include <sys/sysctl.h>
#include <sys/types.h>
#include <mach/machine.h>
#include <TargetConditionals.h>
#endif

#ifdef __linux__
#include <unistd.h>
#include <fstream>
#include <string>
#endif

bool is_apple_silicon(void) {
#ifdef __APPLE__
#if TARGET_CPU_ARM64
    return true;
#else
    return false;
#endif
#else
    return false;
#endif
}

bool has_neon_support(void) {
#ifdef __APPLE__
#if TARGET_CPU_ARM64
    // All Apple Silicon has NEON
    return true;
#endif
#endif

#ifdef __linux__
#if defined(__aarch64__)
    // Check for NEON on Linux ARM64
    std::ifstream cpuinfo("/proc/cpuinfo");
    std::string line;
    while (std::getline(cpuinfo, line)) {
        if (line.find("asimd") != std::string::npos ||
            line.find("neon") != std::string::npos) {
            return true;
        }
    }
#endif
#endif
    return false;
}

bool has_amx_support(void) {
#ifdef __APPLE__
#if TARGET_CPU_ARM64
    // AMX is available on all Apple Silicon via Accelerate framework
    // We detect it by checking for M1 or later
    char brand[256];
    size_t size = sizeof(brand);
    if (sysctlbyname("machdep.cpu.brand_string", &brand, &size, NULL, 0) == 0) {
        // All Apple Silicon Macs have AMX
        if (strstr(brand, "Apple") != NULL) {
            return true;
        }
    }
#endif
#endif
    return false;
}

bool has_sme_support(void) {
#ifdef __APPLE__
#if TARGET_CPU_ARM64
    // SME is available on M4 and later
    // Check for SME feature flag
    int64_t sme_available = 0;
    size_t size = sizeof(sme_available);
    
    // Try to detect M4 by checking CPU features
    // SME detection via hw.optional.arm.FEAT_SME
    if (sysctlbyname("hw.optional.arm.FEAT_SME", &sme_available, &size, NULL, 0) == 0) {
        return sme_available != 0;
    }
    
    // Fallback: check CPU brand for M4
    char brand[256];
    size = sizeof(brand);
    if (sysctlbyname("machdep.cpu.brand_string", &brand, &size, NULL, 0) == 0) {
        if (strstr(brand, "M4") != NULL) {
            return true;
        }
    }
#endif
#endif
    return false;
}

bool has_metal_support(void) {
    // Metal support is checked in metal_compute.mm for macOS
    // This is a placeholder that returns false on non-Apple platforms
#ifdef __APPLE__
    return true; // Will be verified by Metal initialization
#else
    return false;
#endif
}

int get_cpu_cores(void) {
#ifdef __APPLE__
    int cores;
    size_t size = sizeof(cores);
    if (sysctlbyname("hw.ncpu", &cores, &size, NULL, 0) == 0) {
        return cores;
    }
#endif

#ifdef __linux__
    return sysconf(_SC_NPROCESSORS_ONLN);
#endif

    return 1;
}

HardwareCapabilities detect_hardware_capabilities(void) {
    HardwareCapabilities caps;
    memset(&caps, 0, sizeof(caps));
    
    caps.has_neon = has_neon_support();
    caps.has_amx = has_amx_support();
    caps.has_sme = has_sme_support();
    caps.has_metal = has_metal_support();
    caps.cpu_cores = get_cpu_cores();
    
#ifdef __APPLE__
    caps.unified_memory = is_apple_silicon();
#else
    caps.unified_memory = false;
#endif
    
    // Metal device info is populated by metal_compute.mm
    caps.gpu_cores = 0;
    caps.metal_max_threads_per_group = 0;
    strcpy(caps.metal_device_name, "");
    
    return caps;
}
