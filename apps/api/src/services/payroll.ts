import {
  calculatePayslip,
  isEffectiveInPeriod,
  type PayslipResult,
} from '@nepal-payroll/core';
import type { AppDatabase } from '../db/client.js';
import type { CalcAudit } from '../db/schema.js';
import { activeAdvancesForPeriod } from '../repositories/advances.js';
import { listEmployees } from '../repositories/employees.js';
import { getOvertime, listAllowances, listReimbursements } from '../repositories/pay-items.js';
import {
  computeYtd,
  hasEarlierUnfinalizedPeriods,
  type NewPayslipRow,
  type RunRecord,
} from '../repositories/runs.js';
import type { EmployeeDto, PeriodDto } from '../types.js';
import { newId } from '../util.js';

export interface BuiltPayslip {
  employee: EmployeeDto;
  result: PayslipResult;
  row: NewPayslipRow;
}

/**
 * Loads every input the pure engine needs and calls it once per eligible
 * employee. This is the only place that knows how database rows map to payroll
 * concepts; the engine itself never sees a table.
 */
export function buildPayslips(
  database: AppDatabase,
  run: RunRecord,
  period: PeriodDto,
  resolvedPolicy: {
    id: string;
    version: number;
    effectiveFromSeq: number;
    policy: Parameters<typeof calculatePayslip>[1];
  },
): BuiltPayslip[] {
  const ytdIncomplete = hasEarlierUnfinalizedPeriods(
    database,
    period.fiscalYearId,
    period.indexInFy,
  );
  const employees = listEmployees(database, { status: 'ACTIVE' }).filter(
    (employee) => employee.joiningDate <= period.endDate,
  );

  return employees.map((employee) => {
    const allowances = listAllowances(database, employee.id)
      .filter((item) => isEffectiveInPeriod(period.seq, item.fromSeq, item.stopFromSeq))
      .map((item) => ({
        id: item.id,
        label: item.typeName,
        amountPaisa: item.amountPaisa,
        taxable: item.taxable,
        isSystem: item.isSystem,
      }));

    const reimbursements = listReimbursements(database, employee.id)
      .filter((item) => {
        if (item.kind === 'ONE_TIME') return item.periodId === period.id;
        return (
          item.fromSeq !== null &&
          isEffectiveInPeriod(period.seq, item.fromSeq, item.stopFromSeq)
        );
      })
      .map((item) => ({
        id: item.id,
        label: item.label,
        amountPaisa: item.amountPaisa,
        taxable: item.taxable,
        recurring: item.kind === 'RECURRING',
      }));

    const overtime = getOvertime(database, employee.id, period.id);
    const advances = activeAdvancesForPeriod(database, employee.id, period.endDate).map(
      (advance) => ({
        id: advance.id,
        label: advance.note ?? `Advance issued ${advance.issuedOn}`,
        outstandingPaisa: advance.outstandingPaisa,
        installmentPaisa: advance.installmentPaisa,
      }),
    );

    const ytd = computeYtd(database, employee.id, period.fiscalYearId, period.seq);
    const result = calculatePayslip(
      {
        employeeId: employee.id,
        employmentType: employee.employmentType,
        basicPaisa: employee.basicPaisa,
        joiningDate: employee.joiningDate,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        indexInFy: period.indexInFy,
        securityFundEnabled: employee.securityFundEnabled,
        allowances,
        reimbursements,
        overtime: overtime
          ? {
              hoursHundredths: overtime.hoursHundredths,
              multiplierBps: overtime.multiplierOverrideBps,
            }
          : null,
        advances,
        ytd,
        ytdIncomplete,
      },
      resolvedPolicy.policy,
    );

    const calc: CalcAudit = {
      policy: {
        id: resolvedPolicy.id,
        version: resolvedPolicy.version,
        effectiveFromSeq: resolvedPolicy.effectiveFromSeq,
        ssfEmployeeBps: resolvedPolicy.policy.ssfEmployeeBps,
        ssfEmployerBps: resolvedPolicy.policy.ssfEmployerBps,
        securityFundBps: resolvedPolicy.policy.securityFundBps,
        advanceMaxRecoveryBps: resolvedPolicy.policy.advanceMaxRecoveryBps,
      },
      taxProjection: result.tax,
      fixedTaxableMonthlyPaisa: result.fixedTaxableMonthlyPaisa,
      fullMonthEmployeeSsfPaisa: result.fullMonthEmployeeSsfPaisa,
      fullMonthEmployerSsfPaisa: result.fullMonthEmployerSsfPaisa,
      netBeforeAdvancePaisa: result.netBeforeAdvancePaisa,
      advanceCapPaisa: result.advanceCapPaisa,
      ytdIncomplete,
      warnings: result.warnings,
    };

    return {
      employee,
      result,
      row: {
        id: newId(),
        runId: run.id,
        employeeId: employee.id,
        employmentType: employee.employmentType,
        employeeSnapshot: {
          code: employee.code,
          fullName: employee.fullName,
          department: employee.department,
          designation: employee.designation,
          joiningDate: employee.joiningDate,
          employmentType: employee.employmentType,
          ssfNumber: employee.ssfNumber,
          bankName: employee.bankName,
          bankAccountNumber: employee.bankAccountNumber,
        },
        daysEmployed: result.daysEmployed,
        daysInPeriod: result.daysInPeriod,
        grossPaisa: result.grossPaisa,
        taxableCashPaisa: result.taxableCashPaisa,
        fixedTaxableMonthlyPaisa: result.fixedTaxableMonthlyPaisa,
        ssfEmployeePaisa: result.ssfEmployeePaisa,
        ssfEmployerPaisa: result.ssfEmployerPaisa,
        tdsPaisa: result.tdsPaisa,
        securityFundPaisa: result.securityFundPaisa,
        advanceRecoveryPaisa: result.advanceRecoveryPaisa,
        totalDeductionsPaisa: result.totalDeductionsPaisa,
        netPaisa: result.netPaisa,
        advanceBalanceBeforePaisa: result.advanceBalanceBeforePaisa,
        advanceBalanceAfterPaisa: result.advanceBalanceAfterPaisa,
        lines: result.lines,
        calc,
        ytd,
      },
    };
  });
}
