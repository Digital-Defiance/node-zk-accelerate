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
// Metal availability is answered by metal_gpu.mm, which is the only place that
// creates a device. This header is extern "C", so a C++ translation unit can
// call into the Objective-C++ one. has_metal_support() delegates rather than
// reimplementing, so there is exactly one Metal check in the addon.
#include "../include/metal_gpu.h"
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

// AMX (the Apple matrix coprocessor) is deliberately NOT detected here.
//
// There is no supported user-space query for it: no sysctl, no hwcap bit, no
// documented instruction-availability check. The previous implementation
// returned true whenever "machdep.cpu.brand_string" contained "Apple", which
// asserts a capability from the vendor name alone. AMX is also not directly
// programmable from user space; code reaches it, if at all, only as an
// implementation detail of the Accelerate framework, which this addon cannot
// observe. So the capability has been removed from HardwareCapabilities and
// from the addon's exports rather than reported as a guess. The TypeScript
// layer reports AMX as 'unknown'.

bool has_sme_support(void) {
#ifdef __APPLE__
#if TARGET_CPU_ARM64
    // SME (Scalable Matrix Extension) is queryable: the kernel publishes the
    // feature bit. This is a real check, and it is the only one performed --
    // if the sysctl is absent we report false rather than guessing from the
    // CPU brand string.
    int64_t sme_available = 0;
    size_t size = sizeof(sme_available);

    if (sysctlbyname("hw.optional.arm.FEAT_SME", &sme_available, &size, NULL, 0) == 0) {
        return sme_available != 0;
    }
#endif
#endif
    return false;
}

bool has_metal_support(void) {
    // This used to `return true` for every __APPLE__ build without ever asking
    // Metal anything, with a comment saying it "will be verified by Metal
    // initialization". Nothing verified it. Every Mac reported Metal support,
    // including ones where device creation would fail, and the answer was
    // indistinguishable from a real check to any caller.
    //
    // It now delegates to metal_gpu_is_available(), which lazily performs the
    // real sequence -- MTLCreateSystemDefaultDevice(), then newCommandQueue --
    // and reports whether it succeeded. So a true result means Metal was
    // actually reached on THIS machine, not that the code was compiled for a
    // Mac.
    //
    // Two properties of that delegation worth knowing. First, it is not free:
    // the first call initialises the device, the command queue and the default
    // shader library. Detection therefore has a one-time cost, which is the
    // price of the answer being real. Second, it reports usability rather than
    // mere presence -- if a device exists but the command queue cannot be
    // created, metal_gpu.mm nulls the device and this returns false. For a
    // library deciding whether to dispatch GPU work, usable is the question
    // worth answering.
#ifdef __APPLE__
    return metal_gpu_is_available();
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
