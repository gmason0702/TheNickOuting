export const MAX_GOLFERS = 50;
export const GOLFER_WARNING_THRESHOLD = 40;

export type GolferCapacityStatus = "open" | "almost-full" | "full";

export function golferCapacityStatus(currentTotal: number): GolferCapacityStatus {
  if (currentTotal >= MAX_GOLFERS) return "full";
  if (currentTotal >= GOLFER_WARNING_THRESHOLD) return "almost-full";
  return "open";
}
