/**
 * Each golfer ticket bundles one adult reception seat for free. Only adult
 * reception headcount beyond the number of golfers is billed separately.
 * Children are always free and never enter this calculation.
 */
export function calculateTotal(
  golferCount: number,
  receptionAdultCount: number,
  golferFee: number,
  receptionFee: number,
): number {
  const billableAdultCount = Math.max(0, receptionAdultCount - golferCount);
  return golferCount * golferFee + billableAdultCount * receptionFee;
}
