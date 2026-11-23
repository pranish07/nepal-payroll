import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { advances } from '../db/schema.js';
import { notFound } from '../errors.js';
import { nowIso, newId } from '../util.js';

export interface AdvanceDto {
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

export interface AdvanceLedgerEntry {
  recoveryId: string;
  payslipId: string;
  periodId: string;
  periodLabel: string;
  runId: string;
  amountPaisa: number;
  recoveredAt: string;
}

export interface AdvanceLedger {
  advance: AdvanceDto;
  entries: AdvanceLedgerEntry[];
}

interface AdvanceRow {
  id: string;
  employee_id: string;
  principal_paisa: number;
  issued_on: string;
  installment_paisa: number | null;
  status: 'ACTIVE' | 'SETTLED';
  note: string | null;
  created_at: string;
  recovered_paisa: number;
}

const ADVANCE_SELECT = `
  SELECT a.*, COALESCE(SUM(ar.amount_paisa), 0) AS recovered_paisa
  FROM advances a
  LEFT JOIN advance_recoveries ar ON ar.advance_id = a.id
`;

export function listAdvances(database: AppDatabase, employeeId: string): AdvanceDto[] {
  const rows = database.raw
    .prepare(
      `${ADVANCE_SELECT}
       WHERE a.employee_id = ?
       GROUP BY a.id
       ORDER BY a.issued_on ASC, a.created_at ASC, a.id ASC`,
    )
    .all(employeeId) as AdvanceRow[];
  return rows.map(toAdvanceDto);
}

export function getAdvance(database: AppDatabase, id: string): AdvanceDto {
  const row = database.raw
    .prepare(`${ADVANCE_SELECT} WHERE a.id = ? GROUP BY a.id`)
    .get(id) as AdvanceRow | undefined;
  if (!row) throw notFound(`Advance ${id} was not found.`);
  return toAdvanceDto(row);
}

/** Advances available for recovery in a period: issued on or before its end. */
export function activeAdvancesForPeriod(
  database: AppDatabase,
  employeeId: string,
  periodEnd: string,
): AdvanceDto[] {
  return listAdvances(database, employeeId).filter(
    (advance) =>
      advance.status === 'ACTIVE' &&
      advance.issuedOn <= periodEnd &&
      advance.outstandingPaisa > 0,
  );
}

export function createAdvance(
  database: AppDatabase,
  employeeId: string,
  input: {
    principalPaisa: number;
    issuedOn: string;
    installmentPaisa?: number | null;
    note?: string | null;
  },
): AdvanceDto {
  const row = database.db
    .insert(advances)
    .values({
      id: newId(),
      employeeId,
      principalPaisa: input.principalPaisa,
      issuedOn: input.issuedOn,
      installmentPaisa: input.installmentPaisa ?? null,
      status: 'ACTIVE',
      note: input.note ?? null,
      createdAt: nowIso(),
    })
    .returning()
    .get();
  return getAdvance(database, row.id);
}

export function updateAdvanceInstallment(
  database: AppDatabase,
  id: string,
  installmentPaisa: number | null,
): AdvanceDto {
  getAdvance(database, id);
  database.db
    .update(advances)
    .set({ installmentPaisa })
    .where(eq(advances.id, id))
    .run();
  return getAdvance(database, id);
}

export function getAdvanceLedger(database: AppDatabase, id: string): AdvanceLedger {
  const advance = getAdvance(database, id);
  const rows = database.raw
    .prepare(
      `SELECT ar.id AS recovery_id, ar.payslip_id, ar.amount_paisa, ar.created_at,
              ps.run_id, p.id AS period_id, p.label AS period_label
       FROM advance_recoveries ar
       JOIN payslips ps ON ps.id = ar.payslip_id
       JOIN payroll_runs r ON r.id = ps.run_id
       JOIN payroll_periods p ON p.id = r.period_id
       WHERE ar.advance_id = ?
       ORDER BY p.seq ASC`,
    )
    .all(id) as Array<{
    recovery_id: string;
    payslip_id: string;
    amount_paisa: number;
    created_at: string;
    run_id: string;
    period_id: string;
    period_label: string;
  }>;
  return {
    advance,
    entries: rows.map((row) => ({
      recoveryId: row.recovery_id,
      payslipId: row.payslip_id,
      periodId: row.period_id,
      periodLabel: row.period_label,
      runId: row.run_id,
      amountPaisa: row.amount_paisa,
      recoveredAt: row.created_at,
    })),
  };
}

export function insertRecovery(
  database: AppDatabase,
  input: { advanceId: string; payslipId: string; amountPaisa: number },
): void {
  database.raw
    .prepare(
      `INSERT INTO advance_recoveries (id, advance_id, payslip_id, amount_paisa, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(newId(), input.advanceId, input.payslipId, input.amountPaisa, nowIso());
}

/** Called inside the finalize transaction, after new recoveries are inserted. */
export function settleFullyRecoveredAdvances(database: AppDatabase): void {
  database.raw
    .prepare(
      `UPDATE advances
       SET status = 'SETTLED'
       WHERE status = 'ACTIVE'
         AND principal_paisa <= (
           SELECT COALESCE(SUM(amount_paisa), 0)
           FROM advance_recoveries
           WHERE advance_id = advances.id
         )`,
    )
    .run();
}

function toAdvanceDto(row: AdvanceRow): AdvanceDto {
  const outstanding = row.principal_paisa - row.recovered_paisa;
  return {
    id: row.id,
    employeeId: row.employee_id,
    principalPaisa: row.principal_paisa,
    issuedOn: row.issued_on,
    installmentPaisa: row.installment_paisa,
    status: row.status,
    note: row.note,
    recoveredPaisa: row.recovered_paisa,
    outstandingPaisa: outstanding,
    createdAt: row.created_at,
  };
}
