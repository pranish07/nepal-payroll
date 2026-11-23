import { describe, expect, it } from 'vitest';
import {
  calculatePayslip,
  computeAdminCost,
  isEffectiveInPeriod,
  PayrollInputError,
  slabTax,
  validateTaxSlabs,
  type PayrollPolicy,
} from '../src/index.js';
import { baseInput, policy, shrawan } from './fixtures.js';

describe('edge cases required by the brief', () => {
  it('excludes an employee who joins after the period ends', () => {
    expect(() =>
      calculatePayslip(baseInput({ joiningDate: '2026-08-17' }), policy),
    ).toThrow(PayrollInputError);
  });

  it('handles zero overtime without an overtime line', () => {
    const result = calculatePayslip(baseInput({ overtime: { hoursHundredths: 0, multiplierBps: null } }), policy);
    expect(result.overtimePaisa).toBe(0);
    expect(result.lines.some((line) => line.code === 'OVERTIME')).toBe(false);
  });

  it('handles zero and missing allowances and reimbursements', () => {
    const result = calculatePayslip(
      baseInput({
        allowances: [
          { id: 'zero', label: 'Zero allowance', amountPaisa: 0, taxable: true, isSystem: false },
        ],
        reimbursements: [],
      }),
      policy,
    );
    expect(result.grossPaisa).toBe(result.basicProratedPaisa);
    expect(result.lines.filter((line) => line.code.startsWith('ALLOWANCE:'))).toHaveLength(0);
  });

  it('applies an allowance only inside its effective range', () => {
    expect(isEffectiveInPeriod(3, 2, 4)).toBe(true);
    expect(isEffectiveInPeriod(4, 2, 4)).toBe(false);
    expect(isEffectiveInPeriod(1, 2, null)).toBe(false);
    expect(isEffectiveInPeriod(9, 2, null)).toBe(true);
  });

  it('recovers two advances oldest-first and stops at the cap', () => {
    const result = calculatePayslip(
      baseInput({
        employmentType: 'NON_SSF',
        basicPaisa: 2_000_000,
        advances: [
          {
            id: 'older',
            label: 'ADV-001',
            outstandingPaisa: 600_000,
            installmentPaisa: 300_000,
          },
          {
            id: 'newer',
            label: 'ADV-002',
            outstandingPaisa: 2_000_000,
            installmentPaisa: 1_000_000,
          },
        ],
      }),
      policy,
    );
    expect(result.advanceCapPaisa).toBe(970_000);
    expect(result.advanceRecoveries).toEqual([
      { advanceId: 'older', label: 'ADV-001', amountPaisa: 300_000 },
      { advanceId: 'newer', label: 'ADV-002', amountPaisa: 670_000 },
    ]);
    expect(result.netPaisa).toBe(970_000);
  });

  it('recovers as much as the cap allows when an advance has no installment', () => {
    const result = calculatePayslip(
      baseInput({
        employmentType: 'NON_SSF',
        basicPaisa: 2_000_000,
        advances: [
          {
            id: 'lump',
            label: 'ADV-003',
            outstandingPaisa: 5_000_000,
            installmentPaisa: null,
          },
        ],
      }),
      policy,
    );
    expect(result.advanceRecoveryPaisa).toBe(970_000);
    expect(result.advanceBalanceAfterPaisa).toBe(4_030_000);
  });

  it('limits TDS rather than allowing a negative net in a pathological joining month', () => {
    const result = calculatePayslip(
      baseInput({
        basicPaisa: 15_000_000,
        joiningDate: shrawan.end,
      }),
      policy,
    );
    expect(result.netPaisa).toBeGreaterThanOrEqual(0);
    expect(result.warnings.some((warning) => warning.code === 'TDS_LIMITED')).toBe(true);
    expect(result.tdsPaisa).toBe(result.grossPaisa - result.ssfEmployeePaisa - result.securityFundPaisa);
  });

  it('surfaces incomplete YTD as a warning instead of failing', () => {
    const result = calculatePayslip(baseInput({ ytdIncomplete: true }), policy);
    expect(result.warnings.map((warning) => warning.code)).toContain('YTD_INCOMPLETE');
  });

  it('applies a per-entry overtime multiplier override', () => {
    const standard = calculatePayslip(
      baseInput({ overtime: { hoursHundredths: 1000, multiplierBps: null } }),
      policy,
    );
    const double = calculatePayslip(
      baseInput({ overtime: { hoursHundredths: 1000, multiplierBps: 20_000 } }),
      policy,
    );
    expect(double.overtimePaisa).toBe(666_667); // 10h at 2x on NPR 80,000 basic
    expect(double.overtimePaisa).toBeGreaterThan(standard.overtimePaisa);
  });
});

describe('input validation', () => {
  it.each([
    ['negative basic', { basicPaisa: -1 }],
    ['fractional basic', { basicPaisa: 1.5 }],
    ['index 13', { indexInFy: 13 }],
    ['invalid date', { periodStart: '2026-02-30' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => calculatePayslip(baseInput(overrides), policy)).toThrow(PayrollInputError);
  });

  it('rejects negative allowances and overtime hours', () => {
    expect(() =>
      calculatePayslip(
        baseInput({
          allowances: [
            { id: 'bad', label: 'Bad', amountPaisa: -1, taxable: true, isSystem: false },
          ],
        }),
        policy,
      ),
    ).toThrow(PayrollInputError);
    expect(() =>
      calculatePayslip(baseInput({ overtime: { hoursHundredths: -1, multiplierBps: null } }), policy),
    ).toThrow(PayrollInputError);
  });

  it('rejects a policy without tax slabs', () => {
    const broken: PayrollPolicy = { ...policy, taxSlabs: [] };
    expect(() => calculatePayslip(baseInput(), broken)).toThrow(/tax slab/i);
  });

  it('rejects slabs that are out of order or do not end unbounded', () => {
    expect(() =>
      validateTaxSlabs([
        { upperBoundPaisa: 100, rateBps: 100 },
        { upperBoundPaisa: 50, rateBps: 200 },
        { upperBoundPaisa: null, rateBps: 300 },
      ]),
    ).toThrow(/strictly increasing/);
    expect(() =>
      validateTaxSlabs([{ upperBoundPaisa: 100, rateBps: 100 }]),
    ).toThrow(/final slab must be unbounded/);
    expect(() =>
      validateTaxSlabs([
        { upperBoundPaisa: null, rateBps: 100 },
        { upperBoundPaisa: 200, rateBps: 200 },
      ]),
    ).toThrow(/only the final slab/);
  });
});

describe('admin cost isolation', () => {
  it('rejects a negative secret amount', () => {
    const result = calculatePayslip(baseInput(), policy);
    expect(() =>
      computeAdminCost(result, [{ id: 'x', label: 'Secret', amountPaisa: -1 }]),
    ).toThrow(PayrollInputError);
  });

  it('reports zero secret when there are no secret lines', () => {
    const result = calculatePayslip(baseInput(), policy);
    const admin = computeAdminCost(result, []);
    expect(admin.secretPaisa).toBe(0);
    expect(admin.companyCostPaisa).toBe(result.grossPaisa + result.ssfEmployerPaisa);
    expect(admin.paidOutToEmployeePaisa).toBe(result.netPaisa);
  });
});

describe('tax function edge cases', () => {
  it('charges nothing below the first boundary beyond 1%', () => {
    expect(slabTax(0, policy.taxSlabs)).toBe(0);
    expect(slabTax(100_000_000, policy.taxSlabs)).toBe(1_000_000);
  });
});
