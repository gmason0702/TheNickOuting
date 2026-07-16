import { describe, expect, it } from "vitest";
import { GOLFER_WARNING_THRESHOLD, MAX_GOLFERS, golferCapacityStatus } from "./capacity";

describe("golferCapacityStatus", () => {
  it("is open below the warning threshold", () => {
    expect(golferCapacityStatus(0)).toBe("open");
    expect(golferCapacityStatus(GOLFER_WARNING_THRESHOLD - 1)).toBe("open");
  });

  it("is almost-full at and above the warning threshold, below the max", () => {
    expect(golferCapacityStatus(GOLFER_WARNING_THRESHOLD)).toBe("almost-full");
    expect(golferCapacityStatus(MAX_GOLFERS - 1)).toBe("almost-full");
  });

  it("is full at and above the max", () => {
    expect(golferCapacityStatus(MAX_GOLFERS)).toBe("full");
    expect(golferCapacityStatus(MAX_GOLFERS + 5)).toBe("full");
  });
});
