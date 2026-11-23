import type { PayslipLine, PayslipWarning, TaxProjection, YtdTotals } from '@nepal-payroll/core';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { payrollRuns, payslips } from '../db/schema.js';
import { conflict, notFound } from '../errors.js';
import type { PayslipSummaryDto } from '../types.js';
import { nowIso, newId } from '../util.js';

export interface RunRecord {
  id: string;
  periodId: string;
  status: 'DRAFT' | 'FINALIZED';
  policyId: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  policyVersion: number;
}

export interface EmployeeSnapshot {
  code: string;
  fullName: string;
  department: string;
  designation: string;
  joiningDate: string;
  employmentType: 'SSF' | 'NON_SSF';
  ssfNumber: string | null;
  bankName: string;
  bankAccountNumber: string;
}

export interface PayslipAdapterRow {
  id: string;
  run_id: string;
  employee_id: string;
  employment_type: 'SSF' | 'NON_SSF';
  days_employed: number;
  days_in_period: number;
  gross_paisa: number;
  taxable_cash_paisa: number;
  fixed_taxable_monthly_paisa: number;
  ssf_employee_paisa: number;
  ssf_employer_paisa: number;
  tds_paisa: number;
  security_fund_paisa: number;
  advance_recovery_paisa: number;
  total_deductions_paisa: number;
  net_paisa: number;
  advance_balance_before_paisa: number;
  advance_balance_after_paisa: number;
  lines_json: string;
  calc_json: string;
  ytd_json: string;
  created_at: string;
  code: string;
  full_name: string;
  department: string;
  designation: string;
  joining_date: string;
  ssf_number: string | null;
  bank_name: string;
  bank_account_number: string;
  employment_type_snapshot: 'SSF' | 'NON_SSF';
  employee_snapshot_json: string;
  fiscal_year_id: string;
  fiscal_year_seq: number;
  period_id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  index_in_fy: number;
  fiscal_year_label: string;
  run_status: 'DRAFT' | 'FINALIZED';
  finalized_at: string | null;
  policy_version: number;
}

export interface PayslipListItem {
  id: string;
  periodId: string;
  periodLabel: string;
  fiscalYearLabel: string;
  runStatus: 'DRAFT' | 'FINALIZED';
  finalizedAt: string | null;
  grossPaisa: number;
  totalDeductionsPaisa: number;
  netPaisa: number;
  ssfEmployeePaisa: number;
  tdsPaisa: number;
}

export interface NewPayslipRow {
  id: string;
  runId: string;
  employeeId: string;
  employmentType: 'SSF' | 'NON_SSF';
  employeeSnapshot: EmployeeSnapshot;
  daysEmployed: number;
  daysInPeriod: number;
  grossPaisa: number;
  taxableCashPaisa: number;
  fixedTaxableMonthlyPaisa: number;
  ssfEmployeePaisa: number;
  ssfEmployerPaisa: number;
  tdsPaisa: number;
  securityFundPaisa: number;
  advanceRecoveryPaisa: number;
  totalDeductionsPaisa: number;
  netPaisa: number;
  advanceBalanceBeforePaisa: number;
  advanceBalanceAfterPaisa: number;
  lines: PayslipLine[];
  calc: unknown;
  ytd: YtdTotals;
}

export function getRun(database: AppDatabase, runId: string): RunRecord {
  const row = database.raw
    .prepare(
      `SELECT r.*, pol.version AS policy_version
       FROM payroll_runs r JOIN policies pol ON pol.id = r.policy_id
       WHERE r.id = ?`,
    )
    .get(runId) as
    | {
        id: string;
        period_id: string;
        status: 'DRAFT' | 'FINALIZED';
        policy_id: string;
        created_at: string;
        updated_at: string;
        finalized_at: string | null;
        policy_version: number;
      }
    | undefined;
  if (!row) throw notFound(`Payroll run ${runId} was not found.`);
  return {
    id: row.id,
    periodId: row.period_id,
    status: row.status,
    policyId: row.policy_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finalizedAt: row.finalized_at,
    policyVersion: row.policy_version,
  };
}

export function findRunByPeriod(database: AppDatabase, periodId: string): RunRecord | null {
  const row = database.db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(eq(payrollRuns.periodId, periodId))
    .get();
  return row ? getRun(database, row.id) : null;
}

export function upsertDraftRun(
  database: AppDatabase,
  periodId: string,
  policyId: string,
): RunRecord {
  const existing = findRunByPeriod(database, periodId);
  if (existing) {
    if (existing.status === 'FINALIZED') {
      throw conflict('This period is finalized and can no longer be recalculated.');
    }
    database.db
      .update(payrollRuns)
      .set({ policyId, updatedAt: nowIso() })
      .where(eq(payrollRuns.id, existing.id))
      .run();
    return getRun(database, existing.id);
  }

  const timestamp = nowIso();
  const row = database.db
    .insert(payrollRuns)
    .values({
      id: newId(),
      periodId,
      status: 'DRAFT',
      policyId,
      createdAt: timestamp,
      updatedAt: timestamp,
      finalizedAt: null,
    })
    .returning()
    .get();
  return getRun(database, row.id);
}

export function markRunFinalized(database: AppDatabase, runId: string): void {
  const timestamp = nowIso();
  database.db
    .update(payrollRuns)
    .set({ status: 'FINALIZED', finalizedAt: timestamp, updatedAt: timestamp })
    .where(eq(payrollRuns.id, runId))
    .run();
}

export function deletePayslipsForRun(database: AppDatabase, runId: string): void {
  database.db.delete(payslips).where(eq(payslips.runId, runId)).run();
}

export function insertPayslip(database: AppDatabase, row: NewPayslipRow): void {
  database.db
    .insert(payslips)
    .values({
      id: row.id,
      runId: row.runId,
      employeeId: row.employeeId,
      employmentType: row.employmentType,
      employeeSnapshotJson: JSON.stringify(row.employeeSnapshot),
      daysEmployed: row.daysEmployed,
      daysInPeriod: row.daysInPeriod,
      grossPaisa: row.grossPaisa,
      taxableCashPaisa: row.taxableCashPaisa,
      fixedTaxableMonthlyPaisa: row.fixedTaxableMonthlyPaisa,
      ssfEmployeePaisa: row.ssfEmployeePaisa,
      ssfEmployerPaisa: row.ssfEmployerPaisa,
      tdsPaisa: row.tdsPaisa,
      securityFundPaisa: row.securityFundPaisa,
      advanceRecoveryPaisa: row.advanceRecoveryPaisa,
      totalDeductionsPaisa: row.totalDeductionsPaisa,
      netPaisa: row.netPaisa,
      advanceBalanceBeforePaisa: row.advanceBalanceBeforePaisa,
      advanceBalanceAfterPaisa: row.advanceBalanceAfterPaisa,
      linesJson: JSON.stringify(row.lines),
      calcJson: JSON.stringify(row.calc),
      ytdJson: JSON.stringify(row.ytd),
      createdAt: nowIso(),
    })
    .run();
}

export function listPayslipSummaries(
  database: AppDatabase,
  runId: string,
): PayslipSummaryDto[] {
  const rows = database.raw
    .prepare(
      `SELECT ps.id, ps.employee_id, e.code, e.full_name, e.department, ps.employment_type,
              ps.gross_paisa, ps.taxable_cash_paisa, ps.ssf_employee_paisa, ps.ssf_employer_paisa,
              ps.tds_paisa, ps.security_fund_paisa, ps.advance_recovery_paisa,
              ps.total_deductions_paisa, ps.net_paisa, ps.days_employed, ps.days_in_period
       FROM payslips ps
       JOIN employees e ON e.id = ps.employee_id
       WHERE ps.run_id = ?
       ORDER BY e.code ASC`,
    )
    .all(runId) as Array<{
    id: string;
    employee_id: string;
    code: string;
    full_name: string;
    department: string;
    employment_type: 'SSF' | 'NON_SSF';
    gross_paisa: number;
    taxable_cash_paisa: number;
    ssf_employee_paisa: number;
    ssf_employer_paisa: number;
    tds_paisa: number;
    security_fund_paisa: number;
    advance_recovery_paisa: number;
    total_deductions_paisa: number;
    net_paisa: number;
    days_employed: number;
    days_in_period: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    code: row.code,
    fullName: row.full_name,
    department: row.department,
    employmentType: row.employment_type,
    grossPaisa: row.gross_paisa,
    taxableCashPaisa: row.taxable_cash_paisa,
    ssfEmployeePaisa: row.ssf_employee_paisa,
    ssfEmployerPaisa: row.ssf_employer_paisa,
    tdsPaisa: row.tds_paisa,
    securityFundPaisa: row.security_fund_paisa,
    advanceRecoveryPaisa: row.advance_recovery_paisa,
    totalDeductionsPaisa: row.total_deductions_paisa,
    netPaisa: row.net_paisa,
    daysEmployed: row.days_employed,
    daysInPeriod: row.days_in_period,
  }));
}

export function getPayslipAdapterRow(database: AppDatabase, payslipId: string): PayslipAdapterRow {
  const row = database.raw
    .prepare(
      `SELECT ps.*, ps.employment_type AS employment_type_snapshot,
              e.code, e.full_name, e.department, e.designation, e.joining_date, e.ssf_number,
              e.bank_name, e.bank_account_number,
              p.id AS period_id, p.label AS period_label, p.start_date AS period_start,
              p.end_date AS period_end, p.index_in_fy, p.seq AS fiscal_year_seq,
              fy.id AS fiscal_year_id, fy.label AS fiscal_year_label,
              r.status AS run_status, r.finalized_at,
              pol.version AS policy_version
       FROM payslips ps
       JOIN employees e ON e.id = ps.employee_id
       JOIN payroll_runs r ON r.id = ps.run_id
       JOIN payroll_periods p ON p.id = r.period_id
       JOIN fiscal_years fy ON fy.id = p.fiscal_year_id
       JOIN policies pol ON pol.id = r.policy_id
       WHERE ps.id = ?`,
    )
    .get(payslipId) as PayslipAdapterRow | undefined;
  if (!row) throw notFound(`Payslip ${payslipId} was not found.`);
  return row;
}

export function listPayslipsForEmployee(
  database: AppDatabase,
  employeeId: string,
): PayslipListItem[] {
  const rows = database.raw
    .prepare(
      `SELECT ps.id, p.id AS period_id, p.label AS period_label, fy.label AS fiscal_year_label,
              r.status AS run_status, r.finalized_at, ps.gross_paisa, ps.total_deductions_paisa,
              ps.net_paisa, ps.ssf_employee_paisa, ps.tds_paisa
       FROM payslips ps
       JOIN payroll_runs r ON r.id = ps.run_id
       JOIN payroll_periods p ON p.id = r.period_id
       JOIN fiscal_years fy ON fy.id = p.fiscal_year_id
       WHERE ps.employee_id = ?
       ORDER BY p.seq DESC`,
    )
    .all(employeeId) as Array<{
    id: string;
    period_id: string;
    period_label: string;
    fiscal_year_label: string;
    run_status: 'DRAFT' | 'FINALIZED';
    finalized_at: string | null;
    gross_paisa: number;
    total_deductions_paisa: number;
    net_paisa: number;
    ssf_employee_paisa: number;
    tds_paisa: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    periodId: row.period_id,
    periodLabel: row.period_label,
    fiscalYearLabel: row.fiscal_year_label,
    runStatus: row.run_status,
    finalizedAt: row.finalized_at,
    grossPaisa: row.gross_paisa,
    totalDeductionsPaisa: row.total_deductions_paisa,
    netPaisa: row.net_paisa,
    ssfEmployeePaisa: row.ssf_employee_paisa,
    tdsPaisa: row.tds_paisa,
  }));
}

export function computeYtd(
  database: AppDatabase,
  employeeId: string,
  fiscalYearId: string,
  beforeSeq: number,
): YtdTotals {
  const row = database.raw
    .prepare(
      `SELECT COALESCE(SUM(ps.taxable_cash_paisa), 0) AS taxable_cash,
              COALESCE(SUM(ps.ssf_employee_paisa), 0) AS ssf_employee,
              COALESCE(SUM(ps.ssf_employer_paisa), 0) AS ssf_employer,
              COALESCE(SUM(ps.tds_paisa), 0) AS tds
       FROM payslips ps
       JOIN payroll_runs r ON r.id = ps.run_id
       JOIN payroll_periods p ON p.id = r.period_id
       WHERE ps.employee_id = ? AND r.status = 'FINALIZED'
         AND p.fiscal_year_id = ? AND p.seq < ?`,
    )
    .get(employeeId, fiscalYearId, beforeSeq) as {
    taxable_cash: number;
    ssf_employee: number;
    ssf_employer: number;
    tds: number;
  };
  return {
    taxableCashPaisa: row.taxable_cash,
    ssfEmployeePaisa: row.ssf_employee,
    ssfEmployerPaisa: row.ssf_employer,
    tdsPaisa: row.tds,
  };
}

export function computeYtdExtended(
  database: AppDatabase,
  employeeId: string,
  fiscalYearId: string,
  beforeSeq: number,
): YtdTotals & { netPaisa: number; grossPaisa: number } {
  const base = computeYtd(database, employeeId, fiscalYearId, beforeSeq);
  const row = database.raw
    .prepare(
      `SELECT COALESCE(SUM(ps.net_paisa), 0) AS net_paisa,
              COALESCE(SUM(ps.gross_paisa), 0) AS gross_paisa
       FROM payslips ps
       JOIN payroll_runs r ON r.id = ps.run_id
       JOIN payroll_periods p ON p.id = r.period_id
       WHERE ps.employee_id = ? AND r.status = 'FINALIZED'
         AND p.fiscal_year_id = ? AND p.seq < ?`,
    )
    .get(employeeId, fiscalYearId, beforeSeq) as { net_paisa: number; gross_paisa: number };
  return { ...base, netPaisa: row.net_paisa, grossPaisa: row.gross_paisa };
}

export function hasEarlierUnfinalizedPeriods(
  database: AppDatabase,
  fiscalYearId: string,
  indexInFy: number,
): boolean {
  const row = database.raw
    .prepare(
      `SELECT COUNT(*) AS count
       FROM payroll_periods p
       LEFT JOIN payroll_runs r ON r.period_id = p.id
       WHERE p.fiscal_year_id = ? AND p.index_in_fy < ?
         AND (r.id IS NULL OR r.status <> 'FINALIZED')`,
    )
    .get(fiscalYearId, indexInFy) as { count: number };
  return row.count > 0;
}

export function listRunWarnings(
  database: AppDatabase,
  runId: string,
): Array<{ code: string; message: string; employeeCount: number }> {
  const rows = database.raw
    .prepare('SELECT calc_json FROM payslips WHERE run_id = ?')
    .all(runId) as Array<{ calc_json: string }>;

  const byCode = new Map<string, { message: string; employeeCount: number }>();
  for (const row of rows) {
    const calc = JSON.parse(row.calc_json) as { warnings?: PayslipWarning[] };
    for (const warning of calc.warnings ?? []) {
      const current = byCode.get(warning.code);
      if (current) current.employeeCount += 1;
      else byCode.set(warning.code, { message: warning.message, employeeCount: 1 });
    }
  }
  return [...byCode.entries()].map(([code, value]) => ({ code, ...value }));
}

export function parsePayslipAudit(row: PayslipAdapterRow): {
  lines: PayslipLine[];
  taxProjection: TaxProjection;
  warnings: PayslipWarning[];
  ytd: YtdTotals;
} {
  const calc = JSON.parse(row.calc_json) as {
    taxProjection: TaxProjection;
    warnings?: PayslipWarning[];
  };
  return {
    lines: JSON.parse(row.lines_json) as PayslipLine[],
    taxProjection: calc.taxProjection,
    warnings: calc.warnings ?? [],
    ytd: JSON.parse(row.ytd_json) as YtdTotals,
  };
}
