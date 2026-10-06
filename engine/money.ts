/**
 * Money primitives.
 *
 * All currency in the engine is an integer number of cents (`Cents`). Rates are decimal fractions
 * (0.045 = 4.5%). Whenever a rate is applied to a money amount we round to the nearest cent
 * immediately, so rounding never accumulates as a floating-point residue.
 */

/** Integer number of cents. Never a fractional dollar amount. */
export type Cents = number;
/** Decimal fraction: 0.05 means 5%. */
export type Rate = number;

/** Round half away from zero. `Math.round` rounds -2.5 to -2, which would be asymmetric for losses. */
export function roundHalfAwayFromZero(x: number): number {
  const r = Math.round(Math.abs(x));
  if (r === 0) return 0; // normalises -0
  return x < 0 ? -r : r;
}

/** Convert a floating value of cents into an integer cents value. */
export function toCents(x: number): Cents {
  return roundHalfAwayFromZero(x);
}

/** Whole-dollar helper for readable data files: `usd(250_000)` is 25,000,000 cents. */
export function usd(dollars: number): Cents {
  return roundHalfAwayFromZero(dollars * 100);
}

/** Apply a rate to an amount of money and round to the nearest cent. */
export function applyRate(amount: Cents, rate: Rate): Cents {
  return roundHalfAwayFromZero(amount * rate);
}

/** Sum a list of integer cents values. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export const maxCents = (a: Cents, b: Cents): Cents => (a > b ? a : b);
export const minCents = (a: Cents, b: Cents): Cents => (a < b ? a : b);
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * Integer power by repeated squaring. Uses only IEEE-754 multiplications (which are exactly
 * specified), unlike `Math.pow`, whose last-bit result may differ across JavaScript engines.
 * This keeps compounding results bit-for-bit reproducible everywhere.
 */
export function powInt(base: number, exponent: number): number {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new RangeError(`powInt requires a non-negative integer exponent, got ${exponent}`);
  }
  let result = 1;
  let b = base;
  let e = exponent;
  while (e > 0) {
    if (e & 1) result *= b;
    b *= b;
    e = Math.floor(e / 2);
  }
  return result;
}

/** Compound a cents amount by `years` whole years at `rate`, rounding each year to the cent. */
export function compoundCents(amount: Cents, rate: Rate, years: number): Cents {
  let v = amount;
  for (let i = 0; i < years; i++) v = applyRate(v, 1) + applyRate(v, rate);
  return v;
}
