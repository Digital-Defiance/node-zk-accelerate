/**
 * Arkworks Compatibility Module
 *
 * This module provides serialization and deserialization functions compatible
 * with the Arkworks Rust library format. This enables interoperability between
 * this library and Rust-based ZK tooling.
 *
 * Arkworks uses little-endian byte order and Montgomery representation for
 * field elements. Curve points are serialized with a flags byte indicating
 * compression and infinity status.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

export * from './serialization.js';
