/**
 * @digitaldefiance/node-zk-accelerate
 * Metal GPU compute infrastructure
 */

#ifdef __APPLE__

#import <Metal/Metal.h>
#import <Foundation/Foundation.h>
#include "../include/zk_accelerate.h"
#include <cstring>

// Global Metal device reference
static id<MTLDevice> g_metal_device = nil;
static id<MTLCommandQueue> g_command_queue = nil;

/**
 * Initialize Metal device
 */
bool init_metal_device(void) {
    if (g_metal_device != nil) {
        return true;
    }
    
    @autoreleasepool {
        g_metal_device = MTLCreateSystemDefaultDevice();
        if (g_metal_device == nil) {
            return false;
        }
        
        g_command_queue = [g_metal_device newCommandQueue];
        if (g_command_queue == nil) {
            g_metal_device = nil;
            return false;
        }
    }
    
    return true;
}

/**
 * Get Metal device name
 */
const char* get_metal_device_name(void) {
    static char device_name[256] = "";
    
    if (!init_metal_device()) {
        return "";
    }
    
    @autoreleasepool {
        NSString* name = [g_metal_device name];
        if (name != nil) {
            strncpy(device_name, [name UTF8String], sizeof(device_name) - 1);
            device_name[sizeof(device_name) - 1] = '\0';
        }
    }
    
    return device_name;
}

/**
 * Get max threads per threadgroup
 */
int get_metal_max_threads_per_group(void) {
    if (!init_metal_device()) {
        return 0;
    }
    
    @autoreleasepool {
        NSUInteger maxThreads = [g_metal_device maxThreadsPerThreadgroup].width;
        return (int)maxThreads;
    }
}

/**
 * Check if Metal has unified memory
 */
bool metal_has_unified_memory(void) {
    if (!init_metal_device()) {
        return false;
    }
    
    @autoreleasepool {
        return [g_metal_device hasUnifiedMemory];
    }
}

/**
 * Get GPU core count estimate
 * Note: Apple doesn't expose exact GPU core count, this is an estimate
 */
int get_gpu_core_estimate(void) {
    if (!init_metal_device()) {
        return 0;
    }
    
    @autoreleasepool {
        // Use recommended max working set size as a proxy for GPU capability
        // This is a rough estimate based on typical Apple Silicon configurations
        NSUInteger maxWorkingSet = [g_metal_device recommendedMaxWorkingSetSize];
        
        // Rough mapping based on known configurations
        // M1: ~8 cores, M1 Pro: ~14-16, M1 Max: ~24-32, M4 Max: ~40
        if (maxWorkingSet >= 96ULL * 1024 * 1024 * 1024) {
            return 40; // M4 Max class
        } else if (maxWorkingSet >= 48ULL * 1024 * 1024 * 1024) {
            return 32; // M1/M2/M3 Max class
        } else if (maxWorkingSet >= 24ULL * 1024 * 1024 * 1024) {
            return 16; // Pro class
        } else {
            return 8; // Base class
        }
    }
}

/**
 * Update hardware capabilities with Metal info
 */
extern "C" void update_metal_capabilities(HardwareCapabilities* caps) {
    if (caps == NULL) return;
    
    if (init_metal_device()) {
        caps->has_metal = true;
        caps->unified_memory = metal_has_unified_memory();
        caps->gpu_cores = get_gpu_core_estimate();
        caps->metal_max_threads_per_group = get_metal_max_threads_per_group();
        
        const char* name = get_metal_device_name();
        strncpy(caps->metal_device_name, name, sizeof(caps->metal_device_name) - 1);
        caps->metal_device_name[sizeof(caps->metal_device_name) - 1] = '\0';
    } else {
        caps->has_metal = false;
    }
}

#endif /* __APPLE__ */
