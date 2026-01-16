/**
 * MSM Input Validation
 *
 * This module provides validation functions for MSM inputs including:
 * - Array length matching
 * - Curve point validation
 * - Scalar range validation
 *
 * Requirements: 2.10, 15.4
 */

import type { CurvePoint, CurveConfig, Scalar } from '../types.js';
import { ZkAccelerateError, ErrorCode } from '../errors.js';
import { isOnCurve } from '../curve/operations.js';
import { toAffine } from '../curve/point.js';
import { getFieldElementValue } from '../field/element.js';

/**
 * Validate that scalars and points arrays have the same length
 *
 * @param scalars - Array of scalars
 * @param points - Array of curve points
 * @throws ZkAccelerateError if lengths don't match
 */
export function validateArrayLengths(
  scalars: bigint[] | Scalar[],
  points: CurvePoint[]
): void {
  if (scalars.length !== points.length) {
    throw new ZkAccelerateError(
      'Scalar and point arrays must have the same length',
      ErrorCode.ARRAY_LENGTH_MISMATCH,
      {
        scalarsLength: scalars.length,
        pointsLength: points.length,
      }
    );
  }
}

/**
 * Validate that a scalar is within the valid range for the curve
 *
 * @param scalar - The scalar value
 * @param curveOrder - The curve's group order
 * @param index - Index in the array (for error reporting)
 * @throws ZkAccelerateError if scalar is out of range
 */
export function validateScalar(scalar: bigint, curveOrder: bigint, index?: number): void {
  if (scalar < 0n) {
    throw new ZkAccelerateError(
      'Scalar must be non-negative',
      ErrorCode.INVALID_SCALAR,
      {
        value: scalar.toString(),
        index,
      }
    );
  }

  if (scalar >= curveOrder) {
    throw new ZkAccelerateError(
      'Scalar exceeds curve order',
      ErrorCode.INVALID_SCALAR,
      {
        value: scalar.toString(),
        curveOrder: curveOrder.toString(),
        index,
      }
    );
  }
}

/**
 * Validate that a point is on the curve
 *
 * @param point - The curve point to validate
 * @param curve - The curve configuration
 * @param index - Index in the array (for error reporting)
 * @throws ZkAccelerateError if point is not on the curve
 */
export function validatePoint(point: CurvePoint, curve: CurveConfig, index?: number): void {
  if (!isOnCurve(point, curve)) {
    const affine = toAffine(point, curve);
    throw new ZkAccelerateError(
      'Point is not on the curve',
      ErrorCode.INVALID_CURVE_POINT,
      {
        x: getFieldElementValue(affine.x).toString(),
        y: getFieldElementValue(affine.y).toString(),
        curve: curve.name,
        index,
      }
    );
  }
}

/**
 * Validate all MSM inputs
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - The curve configuration
 * @param validatePoints - Whether to validate that points are on the curve
 * @throws ZkAccelerateError if any validation fails
 */
export function validateMsmInputs(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig,
  validatePoints: boolean = true
): void {
  // Validate array lengths match
  validateArrayLengths(scalars, points);

  // Validate each scalar
  for (let i = 0; i < scalars.length; i++) {
    validateScalar(scalars[i]!, curve.order, i);
  }

  // Validate each point is on the curve (if enabled)
  if (validatePoints) {
    for (let i = 0; i < points.length; i++) {
      validatePoint(points[i]!, curve, i);
    }
  }
}

/**
 * Extract scalar values from Scalar objects
 *
 * @param scalars - Array of Scalar objects or bigint values
 * @returns Array of bigint scalar values
 */
export function extractScalarValues(scalars: (bigint | Scalar)[]): bigint[] {
  return scalars.map((s) => {
    if (typeof s === 'bigint') {
      return s;
    }
    return s.value;
  });
}

/**
 * Check if MSM inputs are valid without throwing
 *
 * @param scalars - Array of scalar values
 * @param points - Array of curve points
 * @param curve - The curve configuration
 * @param validatePoints - Whether to validate that points are on the curve
 * @returns Object with isValid flag and optional error
 */
export function checkMsmInputs(
  scalars: bigint[],
  points: CurvePoint[],
  curve: CurveConfig,
  validatePoints: boolean = true
): { isValid: boolean; error?: ZkAccelerateError } {
  try {
    validateMsmInputs(scalars, points, curve, validatePoints);
    return { isValid: true };
  } catch (error) {
    if (error instanceof ZkAccelerateError) {
      return { isValid: false, error };
    }
    throw error;
  }
}
