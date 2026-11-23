import { computeAdminCostFromTotals, type AdminSecretLine } from '@nepal-payroll/core';
import type { AppDatabase } from '../db/client.js';
import {
  getAdminCostSnapshot,
  listAdminPayslipTotals,
  secretsForRun,
} from '../repositories/admin.js';
import { getPeriodOrThrow } from '../repositories/policy.js';
import { getRun, listPayslipSummaries } from '../repositories/runs.js';
import type { AdminCostRowDto, AdminCostViewDto } from '../types.js';
import { filterGroup, summarize, type RunGroup } from './run-service.js';

/**
 * Admin-only cost view. For a finalized run it reads the immutable snapshots in
 * payslip_admin_costs; for a draft it projects from the current secret table.
 */
export function getAdminCostView(
  database: AppDatabase,
  runId: string,
  group: RunGroup,
): AdminCostViewDto {
  const run = getRun(database, runId);
  const period = getPeriodOrThrow(database, run.periodId);
  const totalsRows = listAdminPayslipTotals(database, run.id);
  const secrets = run.status === 'DRAFT' ? secretsForRun(database, run.id) : new Map();

  const rows: AdminCostRowDto[] = totalsRows
    .filter((row) => group === 'ALL' || row.employmentType === group)
    .map((row) => {
      if (run.status === 'FINALIZED') {
        const snapshot = getAdminCostSnapshot(database, row.payslipId);
        return {
          payslipId: row.payslipId,
          employeeId: row.employeeId,
          code: row.code,
          fullName: row.fullName,
          employmentType: row.employmentType,
          grossPaisa: row.grossPaisa,
          employerSsfPaisa: snapshot.employerSsfPaisa,
          secretPaisa: snapshot.secretPaisa,
          companyCostPaisa: snapshot.companyCostPaisa,
          netPaisa: row.netPaisa,
          paidOutToEmployeePaisa: snapshot.paidOutToEmployeePaisa,
          secretNote: null,
        };
      }

      const secret = secrets.get(row.employeeId);
      const secretLines: AdminSecretLine[] = secret
        ? [{ id: secret.id, label: 'Secret compensation', amountPaisa: secret.amountPaisa }]
        : [];
      const admin = computeAdminCostFromTotals(
        {
          grossPaisa: row.grossPaisa,
          employerSsfPaisa: row.employerSsfPaisa,
          netPaisa: row.netPaisa,
        },
        secretLines,
      );
      return {
        payslipId: row.payslipId,
        employeeId: row.employeeId,
        code: row.code,
        fullName: row.fullName,
        employmentType: row.employmentType,
        grossPaisa: row.grossPaisa,
        employerSsfPaisa: admin.employerSsfPaisa,
        secretPaisa: admin.secretPaisa,
        companyCostPaisa: admin.companyCostPaisa,
        netPaisa: row.netPaisa,
        paidOutToEmployeePaisa: admin.paidOutToEmployeePaisa,
        secretNote: secret?.note ?? null,
      };
    });

  const employeeTotals = summarize(
    filterGroup(listPayslipSummaries(database, run.id), group),
  );
  const adminTotals = rows.reduce(
    (accumulator, row) => ({
      secretPaisa: accumulator.secretPaisa + row.secretPaisa,
      companyCostPaisa: accumulator.companyCostPaisa + row.companyCostPaisa,
      paidOutToEmployeePaisa: accumulator.paidOutToEmployeePaisa + row.paidOutToEmployeePaisa,
    }),
    { secretPaisa: 0, companyCostPaisa: 0, paidOutToEmployeePaisa: 0 },
  );

  return {
    runId: run.id,
    status: run.status,
    period,
    rows,
    totals: { ...employeeTotals, ...adminTotals },
  };
}
