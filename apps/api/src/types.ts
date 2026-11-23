import type { PayslipLine, PayslipWarning, TaxProjection } from '@nepal-payroll/core';

export interface EmployeeDto {
  id: string;
  code: string;
  fullName: string;
  department: string;
  designation: string;
  employmentType: 'SSF' | 'NON_SSF';
  ssfNumber: string | null;
  basicPaisa: number;
  joiningDate: string;
  status: 'ACTIVE' | 'INACTIVE';
  securityFundEnabled: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface PeriodDto {
  id: string;
  fiscalYearId: string;
  fiscalYearLabel: string;
  indexInFy: number;
  seq: number;
  label: string;
  startDate: string;
  endDate: string;
  runId: string | null;
  runStatus: 'DRAFT' | 'FINALIZED' | null;
}

export interface TaxSlabDto {
  id: string;
  ordinal: number;
  upperBoundPaisa: number | null;
  rateBps: number;
}

export interface PolicyDto {
  id: string;
  fiscalYearId: string;
  version: number;
  effectiveFromSeq: number;
  ssfEmployeeBps: number;
  ssfEmployerBps: number;
  retirementCapAnnualPaisa: number;
  retirementShareDen: number;
  otMultiplierBps: number;
  otDivisorDays: number;
  otHoursPerDay: number;
  securityFundBps: number;
  advanceMaxRecoveryBps: number;
  taxSlabSetId: string;
  slabs: TaxSlabDto[];
  createdAt: string;
}

export interface PayslipSummaryDto {
  id: string;
  employeeId: string;
  code: string;
  fullName: string;
  department: string;
  employmentType: 'SSF' | 'NON_SSF';
  grossPaisa: number;
  taxableCashPaisa: number;
  ssfEmployeePaisa: number;
  ssfEmployerPaisa: number;
  tdsPaisa: number;
  securityFundPaisa: number;
  advanceRecoveryPaisa: number;
  totalDeductionsPaisa: number;
  netPaisa: number;
  daysEmployed: number;
  daysInPeriod: number;
}

export interface RunTotalsDto {
  employeeCount: number;
  grossPaisa: number;
  taxableCashPaisa: number;
  ssfEmployeePaisa: number;
  ssfEmployerPaisa: number;
  tdsPaisa: number;
  securityFundPaisa: number;
  advanceRecoveryPaisa: number;
  totalDeductionsPaisa: number;
  netPaisa: number;
  employerCostPaisa: number;
  secretPaisa?: number;
  companyCostPaisa?: number;
  paidOutToEmployeePaisa?: number;
}

export interface RunWarningDto {
  code: string;
  message: string;
  employeeCount: number;
}

export interface RunDto {
  id: string;
  period: PeriodDto;
  status: 'DRAFT' | 'FINALIZED';
  policyId: string;
  policyVersion: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  payslips: PayslipSummaryDto[];
  totals: RunTotalsDto;
  warnings: RunWarningDto[];
}

export interface CalculateAudit {
  taxProjection: TaxProjection;
  fixedTaxableMonthlyPaisa: number;
  fullMonthEmployeeSsfPaisa: number;
  fullMonthEmployerSsfPaisa: number;
  netBeforeAdvancePaisa: number;
  advanceCapPaisa: number;
  warnings: PayslipWarning[];
}

/** Employee-facing payslip. There is intentionally no secret field. */
export interface EmployeePayslipView {
  id: string;
  employee: {
    id: string;
    code: string;
    fullName: string;
    department: string;
    designation: string;
    joiningDate: string;
    employmentType: 'SSF' | 'NON_SSF';
    ssfNumber: string | null;
    bankName: string;
    bankAccountMasked: string;
  };
  period: {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    indexInFy: number;
    fiscalYearLabel: string;
  };
  run: { id: string; status: 'DRAFT' | 'FINALIZED'; finalizedAt: string | null };
  daysEmployed: number;
  daysInPeriod: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  employerMemo: PayslipLine[];
  grossPaisa: number;
  totalDeductionsPaisa: number;
  netPaisa: number;
  netInWords: string;
  ssfEmployeePaisa: number;
  ssfEmployerPaisa: number;
  tdsPaisa: number;
  securityFundPaisa: number;
  advanceRecoveryPaisa: number;
  advanceBalanceBeforePaisa: number;
  advanceBalanceAfterPaisa: number;
  ytd: {
    taxableCashPaisa: number;
    ssfEmployeePaisa: number;
    ssfEmployerPaisa: number;
    tdsPaisa: number;
    netPaisa: number;
    grossPaisa: number;
  };
  warnings: PayslipWarning[];
  taxProjection: TaxProjection;
  generatedAt: string;
}

export interface AdminCostRowDto {
  payslipId: string;
  employeeId: string;
  code: string;
  fullName: string;
  employmentType: 'SSF' | 'NON_SSF';
  grossPaisa: number;
  employerSsfPaisa: number;
  secretPaisa: number;
  companyCostPaisa: number;
  netPaisa: number;
  paidOutToEmployeePaisa: number;
  secretNote: string | null;
}

export interface AdminCostViewDto {
  runId: string;
  status: 'DRAFT' | 'FINALIZED';
  period: PeriodDto;
  rows: AdminCostRowDto[];
  totals: RunTotalsDto;
}
