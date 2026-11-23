import { PayrollInputError } from './errors.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Inclusive calendar-day count between two ISO dates. Uses UTC arithmetic so the
 * result cannot depend on the machine's timezone or daylight-saving rules.
 */
export function daysInclusive(startDate: string, endDate: string): number {
  const start = isoDateToEpochDay(startDate);
  const end = isoDateToEpochDay(endDate);
  if (end < start) {
    throw new PayrollInputError('dateRange', `${startDate} is after ${endDate}`);
  }
  return end - start + 1;
}

export function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value)) {
    throw new PayrollInputError(field, 'must be an ISO date (YYYY-MM-DD)');
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const epoch = Date.UTC(year, month - 1, day);
  const check = new Date(epoch);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new PayrollInputError(field, `${value} is not a real calendar date`);
  }
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function isoDateToEpochDay(value: string): number {
  assertIsoDate(value, 'date');
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
