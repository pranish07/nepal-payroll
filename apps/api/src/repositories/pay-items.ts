import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import {
  allowanceTypes,
  employeeAllowances,
  overtimeEntries,
  reimbursements,
} from '../db/schema.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { nowIso, newId } from '../util.js';

export interface AllowanceTypeDto {
  id: string;
  name: string;
  defaultTaxable: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface AllowanceAssignmentDto {
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

export interface ReimbursementDto {
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

export interface OvertimeDto {
  id: string;
  employeeId: string;
  periodId: string;
  hoursHundredths: number;
  multiplierOverrideBps: number | null;
  note: string | null;
  updatedAt: string;
}

interface AllowanceRow {
  id: string;
  employee_id: string;
  allowance_type_id: string;
  amount_paisa: number;
  taxable: number;
  from_period_id: string;
  from_seq: number;
  from_period_label: string;
  stop_from_period_id: string | null;
  stop_from_seq: number | null;
  stop_from_period_label: string | null;
  created_at: string;
  type_name: string;
  is_system: number;
}

interface ReimbursementRow {
  id: string;
  employee_id: string;
  label: string;
  amount_paisa: number;
  kind: 'ONE_TIME' | 'RECURRING';
  period_id: string | null;
  period_label: string | null;
  from_period_id: string | null;
  from_seq: number | null;
  from_period_label: string | null;
  stop_from_period_id: string | null;
  stop_from_seq: number | null;
  stop_from_period_label: string | null;
  taxable: number;
  created_at: string;
}

export function listAllowanceTypes(database: AppDatabase): AllowanceTypeDto[] {
  return database.db
    .select()
    .from(allowanceTypes)
    .orderBy(allowanceTypes.isSystem, allowanceTypes.name)
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      defaultTaxable: row.defaultTaxable === 1,
      isSystem: row.isSystem === 1,
      createdAt: row.createdAt,
    }));
}

export function createAllowanceType(
  database: AppDatabase,
  input: { name: string; defaultTaxable: boolean },
): AllowanceTypeDto {
  const existing = database.db
    .select({ id: allowanceTypes.id })
    .from(allowanceTypes)
    .where(eq(allowanceTypes.name, input.name))
    .get();
  if (existing) throw conflict(`An allowance type named "${input.name}" already exists.`);

  const row = database.db
    .insert(allowanceTypes)
    .values({
      id: newId(),
      name: input.name,
      defaultTaxable: input.defaultTaxable ? 1 : 0,
      isSystem: 0,
      createdAt: nowIso(),
    })
    .returning()
    .get();
  return {
    id: row.id,
    name: row.name,
    defaultTaxable: row.defaultTaxable === 1,
    isSystem: row.isSystem === 1,
    createdAt: row.createdAt,
  };
}

const ALLOWANCE_SELECT = `
  SELECT ea.*, at.name AS type_name, at.is_system,
         fp.seq AS from_seq, fp.label AS from_period_label,
         sp.seq AS stop_from_seq, sp.label AS stop_from_period_label
  FROM employee_allowances ea
  JOIN allowance_types at ON at.id = ea.allowance_type_id
  JOIN payroll_periods fp ON fp.id = ea.from_period_id
  LEFT JOIN payroll_periods sp ON sp.id = ea.stop_from_period_id
`;

export function listAllowances(database: AppDatabase, employeeId: string): AllowanceAssignmentDto[] {
  const rows = database.raw
    .prepare(`${ALLOWANCE_SELECT} WHERE ea.employee_id = ? ORDER BY fp.seq ASC, at.name ASC`)
    .all(employeeId) as AllowanceRow[];
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    allowanceTypeId: row.allowance_type_id,
    typeName: row.type_name,
    isSystem: row.is_system === 1,
    amountPaisa: row.amount_paisa,
    taxable: row.taxable === 1,
    fromPeriodId: row.from_period_id,
    fromSeq: row.from_seq,
    fromPeriodLabel: row.from_period_label,
    stopFromPeriodId: row.stop_from_period_id,
    stopFromSeq: row.stop_from_seq,
    stopFromPeriodLabel: row.stop_from_period_label,
    createdAt: row.created_at,
  }));
}

export function createAllowance(
  database: AppDatabase,
  employeeId: string,
  input: {
    allowanceTypeId: string;
    amountPaisa: number;
    taxable: boolean;
    fromPeriodId: string;
  },
): AllowanceAssignmentDto {
  const type = database.db
    .select()
    .from(allowanceTypes)
    .where(eq(allowanceTypes.id, input.allowanceTypeId))
    .get();
  if (!type) throw notFound(`Allowance type ${input.allowanceTypeId} was not found.`);

  const row = database.db
    .insert(employeeAllowances)
    .values({
      id: newId(),
      employeeId,
      allowanceTypeId: input.allowanceTypeId,
      amountPaisa: input.amountPaisa,
      taxable: input.taxable ? 1 : 0,
      fromPeriodId: input.fromPeriodId,
      stopFromPeriodId: null,
      createdAt: nowIso(),
    })
    .returning()
    .get();
  return listAllowances(database, employeeId).find((item) => item.id === row.id) as AllowanceAssignmentDto;
}

export function stopAllowance(
  database: AppDatabase,
  assignmentId: string,
  stopFromPeriodId: string,
): AllowanceAssignmentDto {
  const assignment = database.raw
    .prepare(`${ALLOWANCE_SELECT} WHERE ea.id = ?`)
    .get(assignmentId) as AllowanceRow | undefined;
  if (!assignment) throw notFound(`Allowance assignment ${assignmentId} was not found.`);
  if (assignment.stop_from_period_id) {
    throw conflict('This allowance has already been stopped.');
  }

  const stopPeriod = database.raw
    .prepare('SELECT seq FROM payroll_periods WHERE id = ?')
    .get(stopFromPeriodId) as { seq: number } | undefined;
  if (!stopPeriod) throw notFound(`Payroll period ${stopFromPeriodId} was not found.`);
  if (stopPeriod.seq <= assignment.from_seq) {
    throw badRequest('An allowance must stop in a period after the period it starts.');
  }

  database.db
    .update(employeeAllowances)
    .set({ stopFromPeriodId })
    .where(eq(employeeAllowances.id, assignmentId))
    .run();
  return listAllowances(database, assignment.employee_id).find(
    (item) => item.id === assignmentId,
  ) as AllowanceAssignmentDto;
}

const REIMBURSEMENT_SELECT = `
  SELECT r.*, p.label AS period_label, fp.seq AS from_seq, fp.label AS from_period_label,
         sp.seq AS stop_from_seq, sp.label AS stop_from_period_label
  FROM reimbursements r
  LEFT JOIN payroll_periods p ON p.id = r.period_id
  LEFT JOIN payroll_periods fp ON fp.id = r.from_period_id
  LEFT JOIN payroll_periods sp ON sp.id = r.stop_from_period_id
`;

export function listReimbursements(
  database: AppDatabase,
  employeeId: string,
): ReimbursementDto[] {
  const rows = database.raw
    .prepare(`${REIMBURSEMENT_SELECT} WHERE r.employee_id = ? ORDER BY r.created_at ASC`)
    .all(employeeId) as ReimbursementRow[];
  return rows.map(toReimbursementDto);
}

export type CreateReimbursementInput =
  | {
      kind: 'ONE_TIME';
      label: string;
      amountPaisa: number;
      taxable: boolean;
      periodId: string;
    }
  | {
      kind: 'RECURRING';
      label: string;
      amountPaisa: number;
      taxable: boolean;
      fromPeriodId: string;
    };

export function createReimbursement(
  database: AppDatabase,
  employeeId: string,
  input: CreateReimbursementInput,
): ReimbursementDto {
  const row = database.db
    .insert(reimbursements)
    .values({
      id: newId(),
      employeeId,
      label: input.label,
      amountPaisa: input.amountPaisa,
      kind: input.kind,
      periodId: input.kind === 'ONE_TIME' ? input.periodId : null,
      fromPeriodId: input.kind === 'RECURRING' ? input.fromPeriodId : null,
      stopFromPeriodId: null,
      taxable: input.taxable ? 1 : 0,
      createdAt: nowIso(),
    })
    .returning()
    .get();
  return listReimbursements(database, employeeId).find((item) => item.id === row.id) as ReimbursementDto;
}

export function stopReimbursement(
  database: AppDatabase,
  reimbursementId: string,
  stopFromPeriodId: string,
): ReimbursementDto {
  const reimbursement = database.db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.id, reimbursementId))
    .get();
  if (!reimbursement) throw notFound(`Reimbursement ${reimbursementId} was not found.`);
  if (reimbursement.kind !== 'RECURRING') {
    throw badRequest('Only recurring reimbursements can be stopped; one-time items are period-bound.');
  }
  if (reimbursement.stopFromPeriodId) throw conflict('This reimbursement has already been stopped.');
  if (!reimbursement.fromPeriodId) throw badRequest('Recurring reimbursement has no start period.');

  const start = database.raw
    .prepare('SELECT seq FROM payroll_periods WHERE id = ?')
    .get(reimbursement.fromPeriodId) as { seq: number } | undefined;
  const stop = database.raw
    .prepare('SELECT seq FROM payroll_periods WHERE id = ?')
    .get(stopFromPeriodId) as { seq: number } | undefined;
  if (!start || !stop) throw notFound('The start or stop period was not found.');
  if (stop.seq <= start.seq) {
    throw badRequest('A reimbursement must stop in a period after the period it starts.');
  }

  database.db
    .update(reimbursements)
    .set({ stopFromPeriodId })
    .where(eq(reimbursements.id, reimbursementId))
    .run();
  return listReimbursements(database, reimbursement.employeeId).find(
    (item) => item.id === reimbursementId,
  ) as ReimbursementDto;
}

export function getOvertime(
  database: AppDatabase,
  employeeId: string,
  periodId: string,
): OvertimeDto | null {
  const row = database.db
    .select()
    .from(overtimeEntries)
    .where(eq(overtimeEntries.employeeId, employeeId))
    .all()
    .find((entry) => entry.periodId === periodId);
  return row ? toOvertimeDto(row) : null;
}

export function upsertOvertime(
  database: AppDatabase,
  employeeId: string,
  periodId: string,
  input: { hoursHundredths: number; multiplierOverrideBps?: number | null; note?: string | null },
): OvertimeDto {
  const id = newId();
  const updatedAt = nowIso();
  const row = database.raw
    .prepare(
      `INSERT INTO overtime_entries
         (id, employee_id, period_id, hours_hundredths, multiplier_override_bps, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, period_id) DO UPDATE SET
         hours_hundredths = excluded.hours_hundredths,
         multiplier_override_bps = excluded.multiplier_override_bps,
         note = excluded.note,
         updated_at = excluded.updated_at
       RETURNING *`,
    )
    .get(
      id,
      employeeId,
      periodId,
      input.hoursHundredths,
      input.multiplierOverrideBps ?? null,
      input.note ?? null,
      updatedAt,
    ) as {
    id: string;
    employee_id: string;
    period_id: string;
    hours_hundredths: number;
    multiplier_override_bps: number | null;
    note: string | null;
    updated_at: string;
  };
  return {
    id: row.id,
    employeeId: row.employee_id,
    periodId: row.period_id,
    hoursHundredths: row.hours_hundredths,
    multiplierOverrideBps: row.multiplier_override_bps,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export function listOvertimeForEmployee(
  database: AppDatabase,
  employeeId: string,
): Array<OvertimeDto & { periodLabel: string }> {
  const rows = database.raw
    .prepare(
      `SELECT o.*, p.label AS period_label
       FROM overtime_entries o
       JOIN payroll_periods p ON p.id = o.period_id
       WHERE o.employee_id = ?
       ORDER BY p.seq ASC`,
    )
    .all(employeeId) as Array<{
    id: string;
    employee_id: string;
    period_id: string;
    hours_hundredths: number;
    multiplier_override_bps: number | null;
    note: string | null;
    updated_at: string;
    period_label: string;
  }>;
  return rows.map((row) => ({
    ...toOvertimeDto({
      id: row.id,
      employeeId: row.employee_id,
      periodId: row.period_id,
      hoursHundredths: row.hours_hundredths,
      multiplierOverrideBps: row.multiplier_override_bps,
      note: row.note,
      updatedAt: row.updated_at,
    }),
    periodLabel: row.period_label,
  }));
}

function toReimbursementDto(row: ReimbursementRow): ReimbursementDto {
  return {
    id: row.id,
    employeeId: row.employee_id,
    label: row.label,
    amountPaisa: row.amount_paisa,
    kind: row.kind,
    periodId: row.period_id,
    periodLabel: row.period_label,
    fromPeriodId: row.from_period_id,
    fromSeq: row.from_seq,
    fromPeriodLabel: row.from_period_label,
    stopFromPeriodId: row.stop_from_period_id,
    stopFromSeq: row.stop_from_seq,
    stopFromPeriodLabel: row.stop_from_period_label,
    taxable: row.taxable === 1,
    createdAt: row.created_at,
  };
}

function toOvertimeDto(row: {
  id: string;
  employeeId: string;
  periodId: string;
  hoursHundredths: number;
  multiplierOverrideBps: number | null;
  note: string | null;
  updatedAt: string;
}): OvertimeDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    periodId: row.periodId,
    hoursHundredths: row.hoursHundredths,
    multiplierOverrideBps: row.multiplierOverrideBps,
    note: row.note,
    updatedAt: row.updatedAt,
  };
}
