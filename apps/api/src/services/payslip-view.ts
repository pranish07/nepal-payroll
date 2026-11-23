import { amountInWords } from '@nepal-payroll/core';
import type { AppDatabase } from '../db/client.js';
import {
  computeYtdExtended,
  getPayslipAdapterRow,
  parsePayslipAudit,
  type EmployeeSnapshot,
} from '../repositories/runs.js';
import type { EmployeePayslipView } from '../types.js';
import { maskBankAccount, nowIso } from '../util.js';

/**
 * The employee-facing payslip DTO. It is assembled only from employee tables
 * and the payslip snapshot; no admin repository is imported here.
 */
export function getEmployeePayslipView(
  database: AppDatabase,
  payslipId: string,
): EmployeePayslipView {
  const row = getPayslipAdapterRow(database, payslipId);
  const parsed = parsePayslipAudit(row);
  const snapshot = JSON.parse(row.employee_snapshot_json) as EmployeeSnapshot;
  const priorYtd = computeYtdExtended(
    database,
    row.employee_id,
    row.fiscal_year_id,
    row.fiscal_year_seq,
  );

  const ytd = {
    taxableCashPaisa: priorYtd.taxableCashPaisa + row.taxable_cash_paisa,
    ssfEmployeePaisa: priorYtd.ssfEmployeePaisa + row.ssf_employee_paisa,
    ssfEmployerPaisa: priorYtd.ssfEmployerPaisa + row.ssf_employer_paisa,
    tdsPaisa: priorYtd.tdsPaisa + row.tds_paisa,
    netPaisa: priorYtd.netPaisa + row.net_paisa,
    grossPaisa: priorYtd.grossPaisa + row.gross_paisa,
  };

  return {
    id: row.id,
    employee: {
      id: row.employee_id,
      code: snapshot.code,
      fullName: snapshot.fullName,
      department: snapshot.department,
      designation: snapshot.designation,
      joiningDate: snapshot.joiningDate,
      employmentType: snapshot.employmentType,
      ssfNumber: snapshot.ssfNumber,
      bankName: snapshot.bankName,
      bankAccountMasked: maskBankAccount(snapshot.bankAccountNumber),
    },
    period: {
      id: row.period_id,
      label: row.period_label,
      startDate: row.period_start,
      endDate: row.period_end,
      indexInFy: row.index_in_fy,
      fiscalYearLabel: row.fiscal_year_label,
    },
    run: {
      id: row.run_id,
      status: row.run_status,
      finalizedAt: row.finalized_at,
    },
    daysEmployed: row.days_employed,
    daysInPeriod: row.days_in_period,
    earnings: parsed.lines.filter((line) => line.kind === 'EARNING'),
    deductions: parsed.lines.filter((line) => line.kind === 'DEDUCTION'),
    employerMemo: parsed.lines.filter((line) => line.kind === 'EMPLOYER_MEMO'),
    grossPaisa: row.gross_paisa,
    totalDeductionsPaisa: row.total_deductions_paisa,
    netPaisa: row.net_paisa,
    netInWords: amountInWords(row.net_paisa),
    ssfEmployeePaisa: row.ssf_employee_paisa,
    ssfEmployerPaisa: row.ssf_employer_paisa,
    tdsPaisa: row.tds_paisa,
    securityFundPaisa: row.security_fund_paisa,
    advanceRecoveryPaisa: row.advance_recovery_paisa,
    advanceBalanceBeforePaisa: row.advance_balance_before_paisa,
    advanceBalanceAfterPaisa: row.advance_balance_after_paisa,
    ytd,
    warnings: parsed.warnings,
    taxProjection: parsed.taxProjection,
    generatedAt: nowIso(),
  };
}
