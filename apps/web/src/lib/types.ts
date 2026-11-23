export type Role = 'admin' | 'employee';
export type EmploymentType = 'SSF' | 'NON_SSF';
export type RunStatus = 'DRAFT' | 'FINALIZED';

export interface Employee {
  id: string;
  code: string;
  fullName: string;
  department: string;
  designation: string;
  employmentType: EmploymentType;
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

export interface Period {
  id: string;
  fiscalYearId: string;
  fiscalYearLabel: string;
  indexInFy: number;
  seq: number;
  label: string;
  startDate: string;
  endDate: string;
  runId: string | null;
  runStatus: RunStatus | null;
}

export interface TaxSlab {
  id: string;
  ordinal: number;
  upperBoundPaisa: number | null;
  rateBps: number;
}

export interface Policy {
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
  slabs: TaxSlab[];
  createdAt: string;
}

export interface FiscalYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface PolicyBundle {
  fiscalYear: FiscalYear;
  policy: Policy | null;
  policies: Policy[];
  taxSlabSets: Array<{
    id: string;
    fiscalYearId: string;
    name: string;
    createdAt: string;
    slabs: TaxSlab[];
  }>;
}

export interface PayslipSummary {
  id: string;
  employeeId: string;
  code: string;
  fullName: string;
  department: string;
  employmentType: EmploymentType;
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

export interface RunTotals {
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

export interface Run {
  id: string;
  period: Period;
  status: RunStatus;
  policyId: string;
  policyVersion: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  payslips: PayslipSummary[];
  totals: RunTotals;
  warnings: Array<{ code: string; message: string; employeeCount: number }>;
}

export interface PayslipLine {
  kind: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_MEMO';
  code: string;
  label: string;
  amountPaisa: number;
  taxable?: boolean;
}

export interface TaxProjection {
  remainingPeriods: number;
  projectedTaxableCashPaisa: number;
  projectedEmployeeSsfPaisa: number;
  projectedEmployerSsfPaisa: number;
  assessablePaisa: number;
  exemptionPaisa: number;
  taxableIncomePaisa: number;
  annualTaxPaisa: number;
}

export interface Payslip {
  id: string;
  employee: {
    id: string;
    code: string;
    fullName: string;
    department: string;
    designation: string;
    joiningDate: string;
    employmentType: EmploymentType;
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
  run: { id: string; status: RunStatus; finalizedAt: string | null };
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
  warnings: Array<{ code: string; message: string }>;
  taxProjection: TaxProjection;
  generatedAt: string;
}

export interface AdminCostRow {
  payslipId: string;
  employeeId: string;
  code: string;
  fullName: string;
  employmentType: EmploymentType;
  grossPaisa: number;
  employerSsfPaisa: number;
  secretPaisa: number;
  companyCostPaisa: number;
  netPaisa: number;
  paidOutToEmployeePaisa: number;
  secretNote: string | null;
}

export interface AdminCostView {
  runId: string;
  status: RunStatus;
  period: Period;
  rows: AdminCostRow[];
  totals: RunTotals;
}

export interface AllowanceType {
  id: string;
  name: string;
  defaultTaxable: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface Allowance {
  id: string;
  employeeId: string;
  allowanceTypeId: string;
  typeName: string;
  isSystem: boolean;
  amountPaisa: number;
  taxable: boolean;
  fromPeriodId: string;
  fromSeq: number;
  fromPeriodLabel: string;
  stopFromPeriodId: string | null;
  stopFromSeq: number | null;
  stopFromPeriodLabel: string | null;
  createdAt: string;
}

export interface Reimbursement {
  id: string;
  employeeId: string;
  label: string;
  amountPaisa: number;
  kind: 'ONE_TIME' | 'RECURRING';
  periodId: string | null;
  periodLabel: string | null;
  fromPeriodId: string | null;
  fromSeq: number | null;
  fromPeriodLabel: string | null;
  stopFromPeriodId: string | null;
  stopFromSeq: number | null;
  stopFromPeriodLabel: string | null;
  taxable: boolean;
  createdAt: string;
}

export interface Overtime {
  id: string;
  employeeId: string;
  periodId: string;
  hoursHundredths: number;
  multiplierOverrideBps: number | null;
  note: string | null;
  updatedAt: string;
  periodLabel?: string;
}

export interface Advance {
  id: string;
  employeeId: string;
  principalPaisa: number;
  issuedOn: string;
  installmentPaisa: number | null;
  status: 'ACTIVE' | 'SETTLED';
  note: string | null;
  recoveredPaisa: number;
  outstandingPaisa: number;
  createdAt: string;
}

export interface AdvanceLedger {
  advance: Advance;
  entries: Array<{
    recoveryId: string;
    payslipId: string;
    periodId: string;
    periodLabel: string;
    runId: string;
    amountPaisa: number;
    recoveredAt: string;
  }>;
}

export interface EmployeePayslipListItem {
  id: string;
  periodId: string;
  periodLabel: string;
  fiscalYearLabel: string;
  runStatus: RunStatus;
  finalizedAt: string | null;
  grossPaisa: number;
  totalDeductionsPaisa: number;
  netPaisa: number;
  ssfEmployeePaisa: number;
  tdsPaisa: number;
}

export interface SecretComponent {
  id: string;
  employeeId: string;
  periodId: string;
  periodLabel: string;
  periodSeq: number;
  amountPaisa: number;
  note: string | null;
  updatedAt: string;
}
