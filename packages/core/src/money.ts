import { PayrollInputError } from './errors.js';

/** Money is always an integer number of paisa. 1 NPR = 100 paisa. */
export type Paisa = number;
/** Rates are integer basis points. 10,000 bps = 100%. */
export type Bps = number;

/**
 * The one rounding primitive for money. Rounds half away from zero (half-up for
 * positive amounts). Intermediate products are BigInt, so no value is ever a
 * floating-point approximation.
 */
export function mulDivRound(a: number | bigint, b: number | bigint, d: number | bigint): number {
  const denominator = toBigInt(d);
  if (denominator <= 0n) {
    throw new PayrollInputError('divisor', 'must be greater than zero');
  }
  const numerator = toBigInt(a) * toBigInt(b);
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return toSafeNumber(negative ? -rounded : rounded);
}

/** Exact integer truncation. Used where the rule says "floor", not "round". */
export function mulDivFloor(a: number | bigint, b: number | bigint, d: number | bigint): number {
  const denominator = toBigInt(d);
  if (denominator <= 0n) {
    throw new PayrollInputError('divisor', 'must be greater than zero');
  }
  const numerator = toBigInt(a) * toBigInt(b);
  // BigInt division truncates toward zero. All payroll quantities here are
  // non-negative, so truncation is floor.
  if (numerator < 0n) {
    throw new PayrollInputError('numerator', 'must be non-negative for mulDivFloor');
  }
  return toSafeNumber(numerator / denominator);
}

export function assertNonNegativeInt(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PayrollInputError(field, 'must be a non-negative safe integer');
  }
}

export function assertPositiveInt(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new PayrollInputError(field, 'must be a positive safe integer');
  }
}

export function assertRateBps(value: unknown, field: string): asserts value is Bps {
  assertNonNegativeInt(value, field);
  if (value > 10_000) {
    throw new PayrollInputError(field, 'must be at most 10,000 bps (100%)');
  }
}

function toBigInt(value: number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (!Number.isSafeInteger(value)) {
    throw new PayrollInputError('amount', 'must be a safe integer number of paisa');
  }
  return BigInt(value);
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new PayrollInputError('amount', 'result exceeds the safe integer range');
  }
  return Number(value);
}
