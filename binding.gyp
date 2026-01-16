{
  "targets": [
    {
      "target_name": "zk_accelerate",
      "sources": [
        "native/src/addon.cc",
        "native/src/hardware_detect.cc",
        "native/src/field_ops.cc",
        "native/src/vdsp_ops.cc",
        "native/src/blas_ops.cc",
        "native/src/neon_montgomery.cc",
        "native/src/sme_ops.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/include"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NODE_ADDON_API_DISABLE_DEPRECATED"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": [
        "-std=c++17",
        "-fexceptions"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "12.0",
            "OTHER_CFLAGS": [
              "-arch arm64",
              "-mmacosx-version-min=12.0",
              "-fvisibility=hidden"
            ],
            "OTHER_CPLUSPLUSFLAGS": [
              "-arch arm64",
              "-mmacosx-version-min=12.0",
              "-fvisibility=hidden",
              "-std=c++17"
            ],
            "OTHER_LDFLAGS": [
              "-framework Accelerate",
              "-framework Metal",
              "-framework MetalKit",
              "-framework Foundation",
              "-framework CoreFoundation"
            ],
            "ARCHS": ["arm64"],
            "VALID_ARCHS": ["arm64"],
            "ONLY_ACTIVE_ARCH": "YES"
          },
          "defines": [
            "APPLE_SILICON=1",
            "TARGET_OS_MAC=1"
          ],
          "sources": [
            "native/src/metal_compute.mm",
            "native/src/metal_gpu.mm",
            "native/src/metal_msm.mm",
            "native/src/metal_ntt.mm"
          ],
          "actions": [
            {
              "action_name": "compile_metal_shaders",
              "inputs": [
                "native/shaders/msm.metal",
                "native/shaders/ntt.metal"
              ],
              "outputs": [
                "native/compiled-shaders/zk_accelerate.metallib"
              ],
              "action": [
                "bash",
                "-c",
                "mkdir -p native/compiled-shaders && xcrun -sdk macosx metal -c native/shaders/msm.metal -o native/compiled-shaders/msm.air -std=metal3.0 -O3 2>/dev/null && xcrun -sdk macosx metal -c native/shaders/ntt.metal -o native/compiled-shaders/ntt.air -std=metal3.0 -O3 2>/dev/null && xcrun -sdk macosx metallib native/compiled-shaders/msm.air native/compiled-shaders/ntt.air -o native/compiled-shaders/zk_accelerate.metallib 2>/dev/null && rm -f native/compiled-shaders/*.air || echo 'Metal shader compilation skipped'"
              ],
              "message": "Compiling Metal shaders..."
            }
          ]
        }],
        ["OS=='linux'", {
          "cflags": [
            "-march=native",
            "-O3",
            "-fPIC"
          ],
          "cflags_cc": [
            "-std=c++17",
            "-march=native",
            "-O3",
            "-fPIC"
          ],
          "defines": [
            "LINUX_BUILD=1"
          ],
          "ldflags": [
            "-Wl,-z,now",
            "-Wl,-z,relro"
          ]
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          },
          "defines": [
            "WINDOWS_BUILD=1"
          ]
        }]
      ]
    }
  ]
}
