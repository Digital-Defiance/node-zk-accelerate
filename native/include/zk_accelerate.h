/**
 * @digitaldefiance/node-zk-accelerate
 * Native acceleration header
 */

#ifndef ZK_ACCELERATE_H
#define ZK_ACCELERATE_H

#include <cstdint>
#include <cstddef>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Hardware capability flags
 */
typedef struct {
    bool has_neon;
    bool has_amx;
    bool has_sme;
    bool has_metal;
    bool unified_memory;
    int cpu_cores;
    int gpu_cores;
    char metal_device_name[256];
    int metal_max_threads_per_group;
} HardwareCapabilities;

/**
 * Detect hardware capabilities
 */
HardwareCapabilities detect_hardware_capabilities(void);

/**
 * Check if running on Apple Silicon
 */
bool is_apple_silicon(void);

/**
 * Check NEON availability
 */
bool has_neon_support(void);

/**
 * Check AMX availability (via Accelerate framework)
 */
bool has_amx_support(void);

/**
 * Check SME availability (M4+)
 */
bool has_sme_support(void);

/**
 * Check Metal GPU availability
 */
bool has_metal_support(void);

#ifdef __cplusplus
}
#endif

#endif /* ZK_ACCELERATE_H */
