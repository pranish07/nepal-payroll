import type { Bps, Paisa } from './money.js';

export type EmploymentType = 'SSF' | 'NON_SSF';

export interface TaxSlab {
  /** Cumulative annual income upper bound; null marks the top, unbounded slab. */
  upperBoundPaisa: Paisa | null;
  rateBps: Bps;
}

/**
 * Every rate and slab the calculation needs. The service loads this from the
 * versioned policy tables; the engine contains no statutory literals.
 */
export interface PayrollPolicy {
  ssfEmployeeBps: Bps;
  ssfEmployerBps: Bps;
  retirementCapAnnualPaisa: Paisa;
  retirementShareDen: number;
  otMultiplierBps: Bps;
  otDivisorDays: number;
  otHoursPerDay: number;
  securityFundBps: Bps;
  advanceMaxRecoveryBps: Bps;
  taxSlabs: TaxSlab[];
}

export interface AllowanceInput {
  id: string;
  label: string;
  /** Full-month amount, before joining-period proration. */
  amountPaisa: Paisa;
  taxable: boolean;
  isSystem: boolean;
}

export interface ReimbursementInput {
  id: string;
  label: string;
  amountPaisa: Paisa;
  taxable: boolean;
  /** Recurring items count toward fixedTaxableMonthly; one-time items do not. */
  recurring: boolean;
}

export interface OvertimeInput {
  hoursHundredths: number;
  multiplierBps: Bps | null;
}

export interface AdvanceInput {
  id: string;
  label: string;
  outstandingPaisa: Paisa;
  installmentPaisa: Paisa | null;
}

export interface YtdTotals {
  taxableCashPaisa: Paisa;
  ssfEmployeePaisa: Paisa;
  ssfEmployerPaisa: Paisa;
  tdsPaisa: Paisa;
}

export interface PayslipInput {
  employeeId: string;
  employmentType: EmploymentType;
  basicPaisa: Paisa;
  joiningDate: string;
  periodStart: string;
  periodEnd: string;
  indexInFy: number;
  securityFundEnabled: boolean;
  allowances: AllowanceInput[];
  reimbursements: ReimbursementInput[];
  overtime: OvertimeInput | null;
  advances: AdvanceInput[];
  ytd: YtdTotals;
  /** Set by the service when earlier periods in the FY have no finalized run. */
  ytdIncomplete?: boolean;
}

export type PayslipLineKind = 'EARNING' | 'DEDUCTION' | 'EMPLOYER_MEMO';

export interface PayslipLine {
  kind: PayslipLineKind;
  code: string;
  label: string;
  amountPaisa: Paisa;
  taxable?: boolean;
  detail?: string;
}

export interface AdvanceRecoveryAllocation {
  advanceId: string;
  label: string;
  amountPaisa: Paisa;
}

export interface TaxProjection {
  /** 13 - indexInFy: periods remaining including the current one. */
  remainingPeriods: number;
  projectedTaxableCashPaisa: Paisa;
  projectedEmployeeSsfPaisa: Paisa;
  projectedEmployerSsfPaisa: Paisa;
  assessablePaisa: Paisa;
  exemptionPaisa: Paisa;
  taxableIncomePaisa: Paisa;
  annualTaxPaisa: Paisa;
}

export interface PayslipWarning {
  code: string;
  message: string;
}

export interface PayslipResult {
  employeeId: string;
  employmentType: EmploymentType;
  indexInFy: number;
  daysEmployed: number;
  daysInPeriod: number;
  basicProratedPaisa: Paisa;
  fullMonthBasicPaisa: Paisa;
  overtimePaisa: Paisa;
  overtimeHoursHundredths: number;
  overtimeMultiplierBps: Bps;
  grossPaisa: Paisa;
  taxableCashPaisa: Paisa;
  fixedTaxableMonthlyPaisa: Paisa;
  ssfEmployeePaisa: Paisa;
  ssfEmployerPaisa: Paisa;
  fullMonthEmployeeSsfPaisa: Paisa;
  fullMonthEmployerSsfPaisa: Paisa;
  securityFundPaisa: Paisa;
  tdsPaisa: Paisa;
  advanceRecoveryPaisa: Paisa;
  totalDeductionsPaisa: Paisa;
  netPaisa: Paisa;
  netBeforeAdvancePaisa: Paisa;
  advanceCapPaisa: Paisa;
  advanceBalanceBeforePaisa: Paisa;
  advanceBalanceAfterPaisa: Paisa;
  advanceRecoveries: AdvanceRecoveryAllocation[];
  tax: TaxProjection;
  ytd: YtdTotals;
  lines: PayslipLine[];
  warnings: PayslipWarning[];
}
