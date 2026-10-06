import { describe, expect, it } from "vitest";
import { applyRate, powInt, roundHalfAwayFromZero, toCents, usd } from "../money";

describe("money primitives", () => {
  it("rounds half away from zero symmetrically", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(0.49)).toBe(0);
    expect(Object.is(roundHalfAwayFromZero(-0.2), 0)).toBe(true);
  });

  it("converts dollars to integer cents", () => {
    expect(usd(1234.56)).toBe(123_456);
    expect(Number.isInteger(usd(0.1 + 0.2))).toBe(true);
    expect(toCents(99.5)).toBe(100);
  });

  it("applies a rate and returns whole cents", () => {
    expect(applyRate(usd(1_000), 0.065)).toBe(usd(65));
    expect(Number.isInteger(applyRate(12_345, 0.0333))).toBe(true);
  });

  it("computes integer powers with multiplication only", () => {
    expect(powInt(2, 10)).toBe(1024);
    expect(powInt(1.005, 0)).toBe(1);
    expect(() => powInt(2, -1)).toThrow(RangeError);
    expect(() => powInt(2, 1.5)).toThrow(RangeError);
  });
});
