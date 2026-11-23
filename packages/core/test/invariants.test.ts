import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  calculatePayslip,
  computeAdminCost,
  formatNprPaisa,
  slabTax,
  type PayslipInput,
} from '../src/index.js';
import { baseInput, policy, shrawan, ytdAfter, zeroYtd } from './fixtures.js';

const money = fc.integer({ min: 0, max: 100_000_000 });

const inputArbitrary: fc.Arbitrary<PayslipInput> = fc
  .record({
    employmentType: fc.constantFrom('SSF' as const, 'NON_SSF' as const),
    basicPaisa: fc.integer({ min: 0, max: 50_000_000 }),
    indexInFy: fc.integer({ min: 1, max: 12 }),
    joiningDate: fc.constantFrom(shrawan.start, '2026-07-25', '2026-08-01', '2026-08-10', shrawan.end),
    securityFundEnabled: fc.boolean(),
    allowances: fc.array(
      fc.record({
        id: fc.uuid(),
        label: fc.constant('Allowance'),
        amountPaisa: money,
        taxable: fc.boolean(),
        isSystem: fc.boolean(),
      }),
      { maxLength: 3 },
    ),
    reimbursements: fc.array(
      fc.record({
        id: fc.uuid(),
        label: fc.constant('Reimbursement'),
        amountPaisa: money,
        taxable: fc.boolean(),
        recurring: fc.boolean(),
      }),
      { maxLength: 3 },
    ),
    overtimeHours: fc.integer({ min: 0, max: 2000 }),
    advances: fc.array(
      fc.record({
        id: fc.uuid(),
        label: fc.constant('Advance'),
        outstandingPaisa: money,
        installmentPaisa: fc.option(money, { nil: null }),
      }),
      { maxLength: 3 },
    ),
    ytd: fc.record({
      taxableCashPaisa: fc.integer({ min: 0, max: 200_000_000 }),
      ssfEmployeePaisa: fc.integer({ min: 0, max: 20_000_000 }),
      ssfEmployerPaisa: fc.integer({ min: 0, max: 40_000_000 }),
      tdsPaisa: fc.integer({ min: 0, max: 40_000_000 }),
    }),
    ytdIncomplete: fc.boolean(),
  })
  .map((raw) => ({
    ...baseInput({
      employmentType: raw.employmentType,
      basicPaisa: raw.basicPaisa,
      indexInFy: raw.indexInFy,
      joiningDate: raw.joiningDate,
      securityFundEnabled: raw.securityFundEnabled,
      allowances: raw.allowances,
      reimbursements: raw.reimbursements,
      overtime: { hoursHundredths: raw.overtimeHours, multiplierBps: null },
      advances: raw.advances,
      ytd: raw.ytd,
      ytdIncomplete: raw.ytdIncomplete,
    }),
  }));

describe('payroll invariants', () => {
  it('net pay and total deductions are exactly the itemized values', () => {
    fc.assert(
      fc.property(inputArbitrary, (input) => {
        const result = calculatePayslip(input, policy);
        const earningLines = result.lines.filter((line) => line.kind === 'EARNING');
        const deductionLines = result.lines.filter((line) => line.kind === 'DEDUCTION');
        const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

        expect(result.grossPaisa).toBe(sum(earningLines.map((line) => line.amountPaisa)));
        expect(result.totalDeductionsPaisa).toBe(
          sum(deductionLines.map((line) => line.amountPaisa)),
        );
        expect(result.totalDeductionsPaisa).toBe(
          result.ssfEmployeePaisa +
            result.tdsPaisa +
            result.securityFundPaisa +
            result.advanceRecoveryPaisa,
        );
        expect(result.netPaisa).toBe(result.grossPaisa - result.totalDeductionsPaisa);
        expect(result.netPaisa).toBeGreaterThanOrEqual(0);
        expect(result.grossPaisa).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('non-SSF employees never have SSF or an SSF exemption', () => {
    fc.assert(
      fc.property(inputArbitrary, (input) => {
        const result = calculatePayslip({ ...input, employmentType: 'NON_SSF' }, policy);
        expect(result.ssfEmployeePaisa).toBe(0);
        expect(result.ssfEmployerPaisa).toBe(0);
        expect(result.tax.projectedEmployeeSsfPaisa).toBe(0);
        expect(result.tax.projectedEmployerSsfPaisa).toBe(0);
        expect(result.tax.exemptionPaisa).toBe(0);
      }),
    );
  });

  it('the secret changes only the admin cost view', () => {
    fc.assert(
      fc.property(inputArbitrary, fc.integer({ min: 0, max: 100_000_000 }), (input, secret) => {
        const result = calculatePayslip(input, policy);
        const before = JSON.stringify(result);
        const admin = computeAdminCost(result, [
          { id: 'secret', label: 'Secret compensation', amountPaisa: secret },
        ]);
        expect(JSON.stringify(result)).toBe(before);
        expect(admin.companyCostPaisa).toBe(
          result.grossPaisa + result.ssfEmployerPaisa + secret,
        );
        expect(admin.paidOutToEmployeePaisa).toBe(result.netPaisa + secret);
        expect(admin.secretPaisa).toBe(secret);
      }),
    );
  });

  it('with constant full-month pay, twelve monthly TDS amounts settle the annual tax', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100_000, max: 60_000_000 }),
        fc.constantFrom('SSF' as const, 'NON_SSF' as const),
        (basicPaisa, employmentType) => {
          let ytd = { ...zeroYtd };
          let totalTds = 0;
          let annualTax = 0;
          for (let indexInFy = 1; indexInFy <= 12; indexInFy += 1) {
            const result = calculatePayslip(
              baseInput({ basicPaisa, employmentType, indexInFy, ytd }),
              policy,
            );
            totalTds += result.tdsPaisa;
            annualTax = result.tax.annualTaxPaisa;
            ytd = ytdAfter(ytd, result);
          }
          expect(totalTds).toBe(annualTax);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('advance recovery respects the cap and the outstanding balance', () => {
    fc.assert(
      fc.property(inputArbitrary, (input) => {
        const result = calculatePayslip(input, policy);
        const outstanding = input.advances.reduce(
          (total, advance) => total + advance.outstandingPaisa,
          0,
        );
        expect(result.advanceRecoveryPaisa).toBeLessThanOrEqual(result.advanceCapPaisa);
        expect(result.advanceRecoveryPaisa).toBeLessThanOrEqual(outstanding);
        expect(result.advanceBalanceAfterPaisa).toBe(outstanding - result.advanceRecoveryPaisa);
        expect(result.advanceBalanceAfterPaisa).toBeGreaterThanOrEqual(0);
        expect(result.tdsPaisa).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('is deterministic: the same input yields the same output', () => {
    fc.assert(
      fc.property(inputArbitrary, (input) => {
        const first = calculatePayslip(input, policy);
        const second = calculatePayslip(input, policy);
        expect(second).toEqual(first);
        expect(formatNprPaisa(first.netPaisa)).toBe(formatNprPaisa(second.netPaisa));
      }),
    );
  });

  it('annual tax is monotonic and continuous', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (income, delta) => {
          const lowerTax = slabTax(income, policy.taxSlabs);
          const higherTax = slabTax(income + delta, policy.taxSlabs);
          expect(higherTax).toBeGreaterThanOrEqual(lowerTax);
          const withoutStep = slabTax(income + 1, policy.taxSlabs);
          expect(withoutStep - lowerTax).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});
