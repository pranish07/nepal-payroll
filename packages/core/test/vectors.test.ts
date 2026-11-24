import { describe, expect, it } from 'vitest';
import {
  calculatePayslip,
  computeAdminCost,
  formatNprPaisa,
  slabTax,
} from '../src/index.js';
import { baseInput, policy, ytdAfter, zeroYtd } from './fixtures.js';

const npr = (rupees: number): number => rupees * 100;

describe('golden vector A: SSF employee with everything switched on', () => {
  const input = baseInput({
    basicPaisa: npr(80_000),
    allowances: [
      { id: 'da', label: 'Dearness Allowance', amountPaisa: npr(5_000), taxable: true, isSystem: true },
      { id: 'conv', label: 'Conveyance', amountPaisa: npr(3_000), taxable: true, isSystem: true },
      {
        id: 'transport',
        label: 'Transport Allowance',
        amountPaisa: npr(4_000),
        taxable: true,
        isSystem: false,
      },
    ],
    reimbursements: [
      { id: 'phone', label: 'Phone', amountPaisa: npr(1_500), taxable: false, recurring: true },
      { id: 'one-time', label: 'One-time reimbursement', amountPaisa: npr(2_500), taxable: false, recurring: false },
    ],
    overtime: { hoursHundredths: 1000, multiplierBps: null },
    advances: [
      {
        id: 'adv-1',
        label: 'ADV-001',
        outstandingPaisa: npr(20_000),
        installmentPaisa: npr(5_000),
      },
    ],
  });

  const result = calculatePayslip(input, policy);

  it('matches every derived figure in the golden vectors', () => {
    expect(result.overtimePaisa).toBe(npr(5_000));
    expect(result.grossPaisa).toBe(npr(101_000));
    expect(result.taxableCashPaisa).toBe(npr(97_000));
    expect(result.fixedTaxableMonthlyPaisa).toBe(npr(92_000));
    expect(result.ssfEmployeePaisa).toBe(npr(8_800));
    expect(result.ssfEmployerPaisa).toBe(npr(16_000));
    expect(result.securityFundPaisa).toBe(npr(1_600));
    expect(result.tax.taxableIncomePaisa).toBe(npr(1_003_400));
    expect(result.tax.annualTaxPaisa).toBe(npr(10_340));
    expect(result.tdsPaisa).toBe(86_167);
    expect(result.netBeforeAdvancePaisa).toBe(8_973_833);
    expect(result.advanceCapPaisa).toBe(4_486_916);
    expect(result.advanceRecoveryPaisa).toBe(npr(5_000));
    expect(result.totalDeductionsPaisa).toBe(1_626_167);
    expect(result.netPaisa).toBe(8_473_833);
    expect(result.advanceBalanceBeforePaisa).toBe(npr(20_000));
    expect(result.advanceBalanceAfterPaisa).toBe(npr(15_000));
    expect(formatNprPaisa(result.netPaisa)).toBe('84,738.33');
  });

  it('keeps the secret entirely in the admin view', () => {
    const admin = computeAdminCost(result, [
      { id: 'secret-1', label: 'Secret compensation', amountPaisa: npr(15_000) },
    ]);
    expect(admin.companyCostPaisa).toBe(npr(132_000));
    expect(admin.paidOutToEmployeePaisa).toBe(9_973_833);
    expect(admin.secretPaisa).toBe(npr(15_000));
    expect(result.netPaisa).toBe(8_473_833);
  });
});

describe('golden vector B: non-SSF employee', () => {
  const result = calculatePayslip(
    baseInput({
      employmentType: 'NON_SSF',
      basicPaisa: npr(120_000),
      allowances: [
        { id: 'conv', label: 'Conveyance', amountPaisa: npr(5_000), taxable: true, isSystem: true },
      ],
    }),
    policy,
  );

  it('has no SSF and no SSF-linked exemption', () => {
    expect(result.grossPaisa).toBe(npr(125_000));
    expect(result.ssfEmployeePaisa).toBe(0);
    expect(result.ssfEmployerPaisa).toBe(0);
    expect(result.tax.exemptionPaisa).toBe(0);
    expect(result.securityFundPaisa).toBe(npr(2_400));
    expect(result.tax.annualTaxPaisa).toBe(npr(60_000));
    expect(result.tdsPaisa).toBe(npr(5_000));
    expect(result.netPaisa).toBe(npr(117_600));
  });

  it('adds the secret only to the admin cost view', () => {
    const admin = computeAdminCost(result, [
      { id: 's', label: 'Secret compensation', amountPaisa: npr(20_000) },
    ]);
    expect(admin.companyCostPaisa).toBe(npr(145_000));
    expect(result.netPaisa).toBe(npr(117_600));
  });
});

describe('golden vector C: SSF exemption cap bites', () => {
  it('caps the retirement exemption at NPR 5,00,000', () => {
    const result = calculatePayslip(baseInput({ basicPaisa: npr(150_000) }), policy);
    expect(result.ssfEmployeePaisa).toBe(npr(16_500));
    expect(result.ssfEmployerPaisa).toBe(npr(30_000));
    expect(result.tax.exemptionPaisa).toBe(npr(500_000));
    expect(result.tax.taxableIncomePaisa).toBe(npr(1_660_000));
    expect(result.tax.annualTaxPaisa).toBe(npr(92_000));
    expect(result.tdsPaisa).toBe(766_667);
    expect(result.securityFundPaisa).toBe(npr(3_000));
    expect(result.netPaisa).toBe(12_283_333);
  });

  it('collects exactly the annual tax over twelve constant months', () => {
    let ytd = { ...zeroYtd };
    let totalTds = 0;
    const monthly: number[] = [];
    for (let indexInFy = 1; indexInFy <= 12; indexInFy += 1) {
      const result = calculatePayslip(
        baseInput({ basicPaisa: npr(150_000), indexInFy, ytd }),
        policy,
      );
      totalTds += result.tdsPaisa;
      monthly.push(result.tdsPaisa);
      ytd = ytdAfter(ytd, result);
    }
    expect(totalTds).toBe(npr(92_000));
    expect(monthly[5]).toBe(766_666); // month 6
    expect(monthly[7]).toBe(766_666); // month 8
    expect(monthly[9]).toBe(766_666); // month 10
    expect(monthly[11]).toBe(766_666); // month 12
  });
});

describe('golden vector D: advance recovery is capped', () => {
  it('recovers only half of net-before-advance', () => {
    const result = calculatePayslip(
      baseInput({
        employmentType: 'NON_SSF',
        basicPaisa: npr(20_000),
        advances: [
          {
            id: 'adv-1',
            label: 'ADV-001',
            outstandingPaisa: npr(40_000),
            installmentPaisa: npr(25_000),
          },
        ],
      }),
      policy,
    );
    expect(result.securityFundPaisa).toBe(npr(400));
    expect(result.tdsPaisa).toBe(npr(200));
    expect(result.netBeforeAdvancePaisa).toBe(npr(19_400));
    expect(result.advanceCapPaisa).toBe(npr(9_700));
    expect(result.advanceRecoveryPaisa).toBe(npr(9_700));
    expect(result.netPaisa).toBe(npr(9_700));
    expect(result.advanceBalanceAfterPaisa).toBe(npr(30_300));
  });
});

describe('golden vector E: cumulative TDS with a one-off taxable item', () => {
  it('re-projects in month 4 and settles exactly over the year', () => {
    let ytd = { ...zeroYtd };
    const monthly: number[] = [];
    for (let indexInFy = 1; indexInFy <= 12; indexInFy += 1) {
      const oneTime =
        indexInFy === 4
          ? [
              {
                id: 'bonus',
                label: 'One-off taxable reimbursement',
                amountPaisa: npr(60_000),
                taxable: true,
                recurring: false,
              },
            ]
          : [];
      const result = calculatePayslip(
        baseInput({
          employmentType: 'NON_SSF',
          basicPaisa: npr(100_000),
          indexInFy,
          ytd,
          reimbursements: oneTime,
        }),
        policy,
      );
      monthly.push(result.tdsPaisa);
      ytd = ytdAfter(ytd, result);
    }

    expect(monthly.slice(0, 3)).toEqual([250_000, 250_000, 250_000]);
    expect(monthly[3]).toBe(316_667);
    expect(monthly[7]).toBe(316_666);
    expect(monthly[9]).toBe(316_666);
    expect(monthly[11]).toBe(316_666);
    expect(monthly.reduce((sum, amount) => sum + amount, 0)).toBe(npr(36_000));
  });
});

describe('golden vector F: joining mid-period', () => {
  it('prorates basic, SSF, and security but not the annual projection base', () => {
    const result = calculatePayslip(
      baseInput({
        basicPaisa: npr(60_000),
        periodStart: '2026-07-17',
        periodEnd: '2026-08-15',
        joiningDate: '2026-08-01',
        indexInFy: 1,
      }),
      policy,
    );
    expect(result.daysEmployed).toBe(15);
    expect(result.daysInPeriod).toBe(30);
    expect(result.basicProratedPaisa).toBe(npr(30_000));
    expect(result.ssfEmployeePaisa).toBe(npr(3_300));
    expect(result.ssfEmployerPaisa).toBe(npr(6_000));
    expect(result.securityFundPaisa).toBe(npr(600));
    expect(result.fixedTaxableMonthlyPaisa).toBe(npr(60_000));
    expect(result.tax.taxableIncomePaisa).toBe(npr(614_100));
    expect(result.tax.annualTaxPaisa).toBe(npr(6_141));
    expect(result.tdsPaisa).toBe(51_175);
    expect(result.netPaisa).toBe(2_558_825);
  });
});

describe('golden vector G: slab boundaries', () => {
  it.each([
    [10_00_000, 10_000],
    [15_00_000, 60_000],
    [25_00_000, 2_60_000],
    [40_00_000, 6_65_000],
    [50_00_000, 9_55_000],
  ])('NPR %i annual income -> NPR %i annual tax', (incomeNpr, taxNpr) => {
    expect(slabTax(npr(incomeNpr), policy.taxSlabs)).toBe(npr(taxNpr));
  });

  it('is continuous at each slab boundary', () => {
    for (const slab of policy.taxSlabs) {
      if (slab.upperBoundPaisa === null) continue;
      const atBoundary = slabTax(slab.upperBoundPaisa, policy.taxSlabs);
      const justBelow = slabTax(slab.upperBoundPaisa - 1, policy.taxSlabs);
      expect(atBoundary - justBelow).toBeLessThanOrEqual(1);
      expect(atBoundary).toBeGreaterThanOrEqual(justBelow);
    }
  });

  it('is monotonic across the whole range', () => {
    let previous = 0;
    for (let income = 0; income <= 500_000_000; income += 1_000_000) {
      const tax = slabTax(income, policy.taxSlabs);
      expect(tax).toBeGreaterThanOrEqual(previous);
      previous = tax;
    }
  });
});
