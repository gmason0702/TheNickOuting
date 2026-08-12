function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** Shared by every RSVP submission path (existing invites and walk-ins alike). */
export function assertValidHeadcounts(
  golferCount: number,
  receptionAdultCount: number,
  receptionChildCount: number,
): void {
  if (
    !isNonNegativeInteger(golferCount) ||
    !isNonNegativeInteger(receptionAdultCount) ||
    !isNonNegativeInteger(receptionChildCount)
  ) {
    throw new Error("Headcounts must be non-negative integers");
  }
  if (golferCount > 1) {
    throw new Error("Only one golf ticket is allowed per email.");
  }
}
