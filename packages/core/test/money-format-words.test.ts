import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  amountInWords,
  daysInclusive,
  formatBpsPercent,
  formatHoursHundredths,
  formatNprPaisa,
  mulDivFloor,
  mulDivRound,
  PayrollInputError,
  rupeesInWords,
} from '../src/index.js';

describe('mulDivRound', () => {
  it('rounds halves up and never uses floating point intermediates', () => {
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(3, 1, 2)).toBe(2);
    expect(mulDivRound(5, 1, 2)).toBe(3);
    expect(mulDivRound(100, 1, 3)).toBe(33);
    expect(mulDivRound(200, 1, 3)).toBe(67);
    expect(mulDivRound(8_000_000, 1000, 3)).toBe(2_666_666_667);
  });

  it('rounds signed halves away from zero', () => {
    expect(mulDivRound(-1, 1, 2)).toBe(-1);
    expect(mulDivRound(-3, 1, 2)).toBe(-2);
  });

  it('rejects a zero divisor and unsafe inputs', () => {
    expect(() => mulDivRound(1, 1, 0)).toThrow(PayrollInputError);
    expect(() => mulDivRound(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(PayrollInputError);
    expect(() => mulDivRound(1.5, 1, 1)).toThrow(PayrollInputError);
  });
});

describe('mulDivFloor', () => {
  it('truncates rather than rounds', () => {
    expect(mulDivFloor(8_973_833, 5000, 10_000)).toBe(4_486_916);
    expect(mulDivFloor(19, 1, 2)).toBe(9);
  });

  it('rejects negative numerators', () => {
    expect(() => mulDivFloor(-1, 1, 2)).toThrow(PayrollInputError);
  });
});

describe('NPR formatting', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [99, '0.99'],
    [100, '1.00'],
    [100_000, '1,000.00'],
    [10_000_000, '1,00,000.00'],
    [1_000_000_000, '1,00,00,000.00'],
    [-123_456, '-1,234.56'],
  ])('%i paisa -> %s', (paisa, expected) => {
    expect(formatNprPaisa(paisa)).toBe(expected);
  });

  it('formats basis points as percentages', () => {
    expect(formatBpsPercent(1100)).toBe('11%');
    expect(formatBpsPercent(1250)).toBe('12.5%');
    expect(formatBpsPercent(2000)).toBe('20%');
    expect(formatBpsPercent(200)).toBe('2%');
    expect(formatBpsPercent(15_000)).toBe('150%');
  });

  it('formats overtime hours without floats', () => {
    expect(formatHoursHundredths(1000)).toBe('10.00');
    expect(formatHoursHundredths(1055)).toBe('10.55');
    expect(formatHoursHundredths(5)).toBe('0.05');
  });
});

describe('amount in words', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [12_345, 'Rupees One Hundred Twenty-Three and Paise Forty-Five Only'],
    [10_000_000, 'Rupees One Lakh Only'],
    [1_000_000_000, 'Rupees One Crore Only'],
    [8_473_833, 'Rupees Eighty-Four Thousand Seven Hundred Thirty-Eight and Paise Thirty-Three Only'],
  ])('%i paisa -> %s', (paisa, expected) => {
    expect(amountInWords(paisa)).toBe(expected);
  });

  it('handles lakh and crore combinations', () => {
    expect(rupeesInWords(12_34_56_789)).toBe(
      'Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine',
    );
  });

  it('rejects negative amounts', () => {
    expect(() => amountInWords(-1)).toThrow();
    expect(() => rupeesInWords(-1)).toThrow();
  });
});

describe('date arithmetic', () => {
  it('counts calendar days inclusively', () => {
    expect(daysInclusive('2026-07-17', '2026-08-16')).toBe(31);
    expect(daysInclusive('2026-07-17', '2026-08-15')).toBe(30);
    expect(daysInclusive('2024-02-28', '2024-03-01')).toBe(3);
    expect(daysInclusive('2026-01-01', '2026-01-01')).toBe(1);
  });

  it('rejects reversed or invalid dates', () => {
    expect(() => daysInclusive('2026-08-16', '2026-07-17')).toThrow(PayrollInputError);
    expect(() => daysInclusive('2026-02-30', '2026-03-01')).toThrow(PayrollInputError);
  });
});

describe('money paths do not use floating-point rounding', () => {
  it('contains no Math.round or toFixed in the engine sources', () => {
    const sourceDir = fileURLToPath(new URL('../src/', import.meta.url));
    const offenders: string[] = [];
    for (const file of readdirSync(sourceDir)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(join(sourceDir, file), 'utf8');
      if (/Math\.round\(/.test(source) || /\.toFixed\(/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
