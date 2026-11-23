import type { Paisa } from './money.js';

/**
 * Formats paisa as NPR with Indian/Nepali digit grouping, e.g. 10,00,000.00.
 * Integer arithmetic only: no floating-point money value is ever created.
 */
export function formatNprPaisa(paisa: Paisa): string {
  if (!Number.isSafeInteger(paisa)) {
    throw new Error('formatNprPaisa expects a safe integer number of paisa');
  }
  const negative = paisa < 0;
  const absolute = Math.abs(paisa);
  const rupees = Math.floor(absolute / 100);
  const paise = absolute % 100;
  return `${negative ? '-' : ''}${groupIndian(rupees)}.${String(paise).padStart(2, '0')}`;
}

/** 1100 -> "11%", 1250 -> "12.5%", 2000 -> "20%". */
export function formatBpsPercent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return `${whole}%`;
  if (fraction % 10 === 0) return `${whole}.${fraction / 10}%`;
  return `${whole}.${String(fraction).padStart(2, '0')}%`;
}

/** 1050 hundredths -> "10.50". Hours are stored as integer hundredths. */
export function formatHoursHundredths(hoursHundredths: number): string {
  const whole = Math.trunc(hoursHundredths / 100);
  const fraction = hoursHundredths % 100;
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function groupIndian(value: number): string {
  const digits = String(value);
  if (digits.length <= 3) return digits;

  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) groups.unshift(rest);
  return `${groups.join(',')},${lastThree}`;
}
