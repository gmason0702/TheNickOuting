import { describe, expect, it } from "vitest";
import { calculateTotal } from "./pricing";

describe("calculateTotal", () => {
  it("charges nothing for 0 golfers and 0 reception", () => {
    expect(calculateTotal(0, 0, 50, 20)).toBe(0);
  });

  it("1 golfer + 1 reception costs just the golfer fee (reception seat bundled free)", () => {
    expect(calculateTotal(1, 1, 50, 20)).toBe(50);
  });

  it("1 golfer + 2 reception bills the extra reception seat beyond the golfer", () => {
    expect(calculateTotal(1, 2, 50, 20)).toBe(70);
  });

  it("reception-only (0 golfers) bills every reception seat at the standalone fee", () => {
    expect(calculateTotal(0, 3, 50, 20)).toBe(60);
  });

  it("more golfers than reception attendees bills only the golfer fee, no negative credit", () => {
    expect(calculateTotal(2, 1, 50, 20)).toBe(100);
  });

  it("multiple golfers each bundle their own free reception seat", () => {
    expect(calculateTotal(2, 3, 50, 20)).toBe(120);
  });
});
