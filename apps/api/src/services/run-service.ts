import { computeAdminCostFromTotals } from '@nepal-payroll/core';
import type { AppDatabase } from '../db/client.js';
import { insertRecovery, settleFullyRecoveredAdvances } from '../repositories/advances.js';
import { insertAdminCostSnapshot, secretsForRun } from '../repositories/admin.js';
import { writeAudit } from '../repositories/audit.js';
import {
  deletePayslipsForRun,
  getRun,
  insertPayslip,
  listPayslipSummaries,
  listRunWarnings,
  markRunFinalized,
  upsertDraftRun,
  type RunRecord,
} from '../repositories/runs.js';
import { getPeriodOrThrow, resolvePolicyForPeriod } from '../repositories/policy.js';
import type { PayslipSummaryDto, RunDto, RunTotalsDto, RunWarningDto } from '../types.js';
import { buildPayslips } from './payroll.js';

export type RunGroup = 'ALL' | 'SSF' | 'NON_SSF';

/** Creates or recalculates a DRAFT run. Finalized runs are immutable. */
export function calculateDraft(database: AppDatabase, periodId: string): RunDto {
  const period = getPeriodOrThrow(database, periodId);
  const resolvedPolicy = resolvePolicyForPeriod(database, period);

  const runId = database.raw.transaction(() => {
    const run = upsertDraftRun(database, period.id, resolvedPolicy.id);
    const built = buildPayslips(database, run, period, resolvedPolicy);
    deletePayslipsForRun(database, run.id);
    for (const payslip of built) {
      insertPayslip(database, payslip.row);
    }
    return run.id;
  })();

  return getRunView(database, runId, 'ALL');
}

/**
 * Finalization recomputes every payslip inside one transaction; it never trusts
 * the stored draft. Secret cost snapshots and advance recoveries are written in
 * the same transaction, then the run is marked FINALIZED. Calling it twice is a
 * no-op.
 */
export function finalizeRun(database: AppDatabase, runId: string): RunDto {
  database.raw.transaction(() => {
    const run = getRun(database, runId);
    if (run.status === 'FINALIZED') return;

    const period = getPeriodOrThrow(database, run.periodId);
    const resolvedPolicy = resolvePolicyForPeriod(database, period);
    const built = buildPayslips(database, run, period, resolvedPolicy);
    const secrets = secretsForRun(database, run.id);

    deletePayslipsForRun(database, run.id);

    for (const payslip of built) {
      insertPayslip(database, payslip.row);

      for (const recovery of payslip.result.advanceRecoveries) {
        insertRecovery(database, {
          advanceId: recovery.advanceId,
          payslipId: payslip.row.id,
          amountPaisa: recovery.amountPaisa,
        });
      }

      const secret = secrets.get(payslip.employee.id);
      const secretLines = secret
        ? [
            {
              id: secret.id,
              label: 'Secret compensation',
              amountPaisa: secret.amountPaisa,
            },
          ]
        : [];
      const adminCost = computeAdminCostFromTotals(
        {
          grossPaisa: payslip.result.grossPaisa,
          employerSsfPaisa: payslip.result.ssfEmployerPaisa,
          netPaisa: payslip.result.netPaisa,
        },
        secretLines,
      );
      insertAdminCostSnapshot(database, {
        payslipId: payslip.row.id,
        secretPaisa: adminCost.secretPaisa,
        secretLines: adminCost.secretLines,
        employerSsfPaisa: adminCost.employerSsfPaisa,
        companyCostPaisa: adminCost.companyCostPaisa,
        paidOutToEmployeePaisa: adminCost.paidOutToEmployeePaisa,
      });
    }

    settleFullyRecoveredAdvances(database);
    markRunFinalized(database, run.id);
    writeAudit(database, {
      actorRole: 'admin',
      action: 'RUN_FINALIZED',
      entityType: 'payroll_run',
      entityId: run.id,
      details: { periodId: period.id, payslipCount: built.length },
    });
  })();

  return getRunView(database, runId, 'ALL');
}

export function getRunView(
  database: AppDatabase,
  runId: string,
  group: RunGroup = 'ALL',
): RunDto {
  const run = getRun(database, runId);
  const period = getPeriodOrThrow(database, run.periodId);
  const allPayslips = listPayslipSummaries(database, run.id);
  const payslips = filterGroup(allPayslips, group);

  return {
    id: run.id,
    period,
    status: run.status,
    policyId: run.policyId,
    policyVersion: run.policyVersion,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    finalizedAt: run.finalizedAt,
    payslips,
    totals: summarize(payslips),
    warnings: listRunWarnings(database, run.id),
  };
}

export function getRunSummary(
  database: AppDatabase,
  runId: string,
  group: RunGroup = 'ALL',
): { runId: string; status: RunRecord['status']; totals: RunTotalsDto; warnings: RunWarningDto[] } {
  const run = getRun(database, runId);
  const payslips = filterGroup(listPayslipSummaries(database, run.id), group);
  return {
    runId: run.id,
    status: run.status,
    totals: summarize(payslips),
    warnings: listRunWarnings(database, run.id),
  };
}

export function filterGroup(
  payslips: PayslipSummaryDto[],
  group: RunGroup,
): PayslipSummaryDto[] {
  if (group === 'ALL') return payslips;
  return payslips.filter((payslip) => payslip.employmentType === group);
}

export function summarize(payslips: PayslipSummaryDto[]): RunTotalsDto {
  const totals = payslips.reduce(
    (accumulator, payslip) => ({
      employeeCount: accumulator.employeeCount + 1,
      grossPaisa: accumulator.grossPaisa + payslip.grossPaisa,
      taxableCashPaisa: accumulator.taxableCashPaisa + payslip.taxableCashPaisa,
      ssfEmployeePaisa: accumulator.ssfEmployeePaisa + payslip.ssfEmployeePaisa,
      ssfEmployerPaisa: accumulator.ssfEmployerPaisa + payslip.ssfEmployerPaisa,
      tdsPaisa: accumulator.tdsPaisa + payslip.tdsPaisa,
      securityFundPaisa: accumulator.securityFundPaisa + payslip.securityFundPaisa,
      advanceRecoveryPaisa: accumulator.advanceRecoveryPaisa + payslip.advanceRecoveryPaisa,
      totalDeductionsPaisa: accumulator.totalDeductionsPaisa + payslip.totalDeductionsPaisa,
      netPaisa: accumulator.netPaisa + payslip.netPaisa,
    }),
    {
      employeeCount: 0,
      grossPaisa: 0,
      taxableCashPaisa: 0,
      ssfEmployeePaisa: 0,
      ssfEmployerPaisa: 0,
      tdsPaisa: 0,
      securityFundPaisa: 0,
      advanceRecoveryPaisa: 0,
      totalDeductionsPaisa: 0,
      netPaisa: 0,
    },
  );
  return { ...totals, employerCostPaisa: totals.grossPaisa + totals.ssfEmployerPaisa };
}
