import type { PayslipInput, PayrollPolicy, YtdTotals } from '../src/index.js';

export const policy: PayrollPolicy = {
  ssfEmployeeBps: 1100,
  ssfEmployerBps: 2000,
  retirementCapAnnualPaisa: 50_000_000, // NPR 5,00,000
  retirementShareDen: 3,
  otMultiplierBps: 15_000,
  otDivisorDays: 30,
  otHoursPerDay: 8,
  securityFundBps: 200,
  advanceMaxRecoveryBps: 5000,
  taxSlabs: [
    { upperBoundPaisa: 100_000_000, rateBps: 100 }, // first NPR 10,00,000 @ 1%
    { upperBoundPaisa: 150_000_000, rateBps: 1000 }, // next NPR 5,00,000 @ 10%
    { upperBoundPaisa: 250_000_000, rateBps: 2000 }, // next NPR 10,00,000 @ 20%
    { upperBoundPaisa: 400_000_000, rateBps: 2700 }, // next NPR 15,00,000 @ 27%
    { upperBoundPaisa: null, rateBps: 2900 }, // above NPR 40,00,000 @ 29%
  ],
};

export const zeroYtd: YtdTotals = {
  taxableCashPaisa: 0,
  ssfEmployeePaisa: 0,
  ssfEmployerPaisa: 0,
  tdsPaisa: 0,
};

export const shrawan = { start: '2026-07-17', end: '2026-08-16' };

export function baseInput(overrides: Partial<PayslipInput> = {}): PayslipInput {
  return {
    employeeId: 'emp-test',
    employmentType: 'SSF',
    basicPaisa: 8_000_000,
    joiningDate: '2020-01-01',
    periodStart: shrawan.start,
    periodEnd: shrawan.end,
    indexInFy: 1,
    securityFundEnabled: true,
    allowances: [],
    reimbursements: [],
    overtime: null,
    advances: [],
    ytd: { ...zeroYtd },
    ...overrides,
  };
}

export function ytdAfter(previous: YtdTotals, result: {
  taxableCashPaisa: number;
  ssfEmployeePaisa: number;
  ssfEmployerPaisa: number;
  tdsPaisa: number;
}): YtdTotals {
  return {
    taxableCashPaisa: previous.taxableCashPaisa + result.taxableCashPaisa,
    ssfEmployeePaisa: previous.ssfEmployeePaisa + result.ssfEmployeePaisa,
    ssfEmployerPaisa: previous.ssfEmployerPaisa + result.ssfEmployerPaisa,
    tdsPaisa: previous.tdsPaisa + result.tdsPaisa,
  };
}
