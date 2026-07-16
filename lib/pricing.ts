/**
 * Each golfer ticket bundles one reception seat for free. Only reception
 * headcount beyond the number of golfers is billed separately.
 */
export function calculateTotal(
  golferCount: number,
  receptionCount: number,
  golferFee: number,
  receptionFee: number,
): number {
  const billableReceptionCount = Math.max(0, receptionCount - golferCount);
  return golferCount * golferFee + billableReceptionCount * receptionFee;
}
