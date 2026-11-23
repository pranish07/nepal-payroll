/**
 * Effective-dating rule shared by allowances and recurring reimbursements:
 * an item is active in a period when it has started and has not been stopped.
 * The stop period itself is already inactive.
 */
export function isEffectiveInPeriod(
  periodSeq: number,
  fromPeriodSeq: number,
  stopFromPeriodSeq: number | null,
): boolean {
  if (periodSeq < fromPeriodSeq) return false;
  return stopFromPeriodSeq === null || periodSeq < stopFromPeriodSeq;
}
