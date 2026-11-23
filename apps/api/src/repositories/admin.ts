import type { AdminSecretLine } from '@nepal-payroll/core';
import { and, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { secretComponents } from '../db/schema.js';
import { notFound } from '../errors.js';
import { nowIso, newId } from '../util.js';

/**
 * ADMIN-ONLY MODULE.
 *
 * Nothing that builds an employee-facing response or payslip may import this
 * file (enforced by ESLint no-restricted-imports). All reads and writes of the
 * secret component and the admin cost snapshots live here.
 */

export interface SecretComponentDto {
  id: string;
  employeeId: string;
  periodId: string;
  periodLabel: string;
  periodSeq: number;
  amountPaisa: number;
  note: string | null;
  updatedAt: string;
}

export interface AdminPayslipTotals {
  payslipId: string;
  employeeId: string;
  code: string;
  fullName: string;
  employmentType: 'SSF' | 'NON_SSF';
  grossPaisa: number;
  employerSsfPaisa: number;
  netPaisa: number;
}

export interface AdminCostSnapshot {
  payslipId: string;
  secretPaisa: number;
  secretLines: AdminSecretLine[];
  employerSsfPaisa: number;
  companyCostPaisa: number;
  paidOutToEmployeePaisa: number;
}

export function listSecretComponents(
  database: AppDatabase,
  employeeId: string,
): SecretComponentDto[] {
  const rows = database.raw
    .prepare(
      `SELECT sc.*, p.label AS period_label, p.seq AS period_seq
       FROM secret_components sc
       JOIN payroll_periods p ON p.id = sc.period_id
       WHERE sc.employee_id = ?
       ORDER BY p.seq ASC`,
    )
    .all(employeeId) as Array<{
    id: string;
    employee_id: string;
    period_id: string;
    amount_paisa: number;
    note: string | null;
    updated_at: string;
    period_label: string;
    period_seq: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    periodId: row.period_id,
    periodLabel: row.period_label,
    periodSeq: row.period_seq,
    amountPaisa: row.amount_paisa,
    note: row.note,
    updatedAt: row.updated_at,
  }));
}

export function getSecretComponent(
  database: AppDatabase,
  employeeId: string,
  periodId: string,
): SecretComponentDto | null {
  return (
    listSecretComponents(database, employeeId).find((item) => item.periodId === periodId) ?? null
  );
}

export function setSecretComponent(
  database: AppDatabase,
  employeeId: string,
  periodId: string,
  amountPaisa: number,
  note: string | null,
): SecretComponentDto | null {
  if (amountPaisa === 0) {
    database.db
      .delete(secretComponents)
      .where(
        and(eq(secretComponents.employeeId, employeeId), eq(secretComponents.periodId, periodId)),
      )
      .run();
    return null;
  }

  const existing = database.db
    .select()
    .from(secretComponents)
    .where(
      and(eq(secretComponents.employeeId, employeeId), eq(secretComponents.periodId, periodId)),
    )
    .get();

  if (existing) {
    database.db
      .update(secretComponents)
      .set({ amountPaisa, note, updatedAt: nowIso() })
      .where(eq(secretComponents.id, existing.id))
      .run();
  } else {
    database.db
      .insert(secretComponents)
      .values({
        id: newId(),
        employeeId,
        periodId,
        amountPaisa,
        note,
        updatedAt: nowIso(),
      })
      .run();
  }

  return getSecretComponent(database, employeeId, periodId);
}

export function secretsForRun(
  database: AppDatabase,
  runId: string,
): Map<string, SecretComponentDto> {
  const rows = database.raw
    .prepare(
      `SELECT sc.*, p.label AS period_label, p.seq AS period_seq
       FROM secret_components sc
       JOIN payroll_periods p ON p.id = sc.period_id
       JOIN payroll_runs r ON r.period_id = sc.period_id
       WHERE r.id = ?`,
    )
    .all(runId) as Array<{
    id: string;
    employee_id: string;
    period_id: string;
    amount_paisa: number;
    note: string | null;
    updated_at: string;
    period_label: string;
    period_seq: number;
  }>;
  return new Map(
    rows.map((row) => [
      row.employee_id,
      {
        id: row.id,
        employeeId: row.employee_id,
        periodId: row.period_id,
        periodLabel: row.period_label,
        periodSeq: row.period_seq,
        amountPaisa: row.amount_paisa,
        note: row.note,
        updatedAt: row.updated_at,
      },
    ]),
  );
}

export function listAdminPayslipTotals(
  database: AppDatabase,
  runId: string,
): AdminPayslipTotals[] {
  const rows = database.raw
    .prepare(
      `SELECT ps.id AS payslip_id, ps.employee_id, e.code, e.full_name, ps.employment_type,
              ps.gross_paisa, ps.ssf_employer_paisa, ps.net_paisa
       FROM payslips ps
       JOIN employees e ON e.id = ps.employee_id
       WHERE ps.run_id = ?
       ORDER BY e.code ASC`,
    )
    .all(runId) as Array<{
    payslip_id: string;
    employee_id: string;
    code: string;
    full_name: string;
    employment_type: 'SSF' | 'NON_SSF';
    gross_paisa: number;
    ssf_employer_paisa: number;
    net_paisa: number;
  }>;
  return rows.map((row) => ({
    payslipId: row.payslip_id,
    employeeId: row.employee_id,
    code: row.code,
    fullName: row.full_name,
    employmentType: row.employment_type,
    grossPaisa: row.gross_paisa,
    employerSsfPaisa: row.ssf_employer_paisa,
    netPaisa: row.net_paisa,
  }));
}

export function insertAdminCostSnapshot(
  database: AppDatabase,
  snapshot: AdminCostSnapshot,
): void {
  database.raw
    .prepare(
      `INSERT INTO payslip_admin_costs
         (payslip_id, secret_paisa, secret_lines_json, employer_ssf_paisa,
          company_cost_paisa, paid_out_to_employee_paisa)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      snapshot.payslipId,
      snapshot.secretPaisa,
      JSON.stringify(snapshot.secretLines),
      snapshot.employerSsfPaisa,
      snapshot.companyCostPaisa,
      snapshot.paidOutToEmployeePaisa,
    );
}

export function getAdminCostSnapshot(
  database: AppDatabase,
  payslipId: string,
): AdminCostSnapshot {
  const row = database.raw
    .prepare('SELECT * FROM payslip_admin_costs WHERE payslip_id = ?')
    .get(payslipId) as
    | {
        payslip_id: string;
        secret_paisa: number;
        secret_lines_json: string;
        employer_ssf_paisa: number;
        company_cost_paisa: number;
        paid_out_to_employee_paisa: number;
      }
    | undefined;
  if (!row) throw notFound(`Admin cost snapshot for payslip ${payslipId} was not found.`);
  return {
    payslipId: row.payslip_id,
    secretPaisa: row.secret_paisa,
    secretLines: JSON.parse(row.secret_lines_json) as AdminSecretLine[],
    employerSsfPaisa: row.employer_ssf_paisa,
    companyCostPaisa: row.company_cost_paisa,
    paidOutToEmployeePaisa: row.paid_out_to_employee_paisa,
  };
}
