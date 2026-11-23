import { and, asc, eq, like, or } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { employees } from '../db/schema.js';
import { conflict, notFound } from '../errors.js';
import type { EmployeeDto } from '../types.js';
import { nowIso, newId } from '../util.js';

export interface EmployeeFilters {
  type?: 'SSF' | 'NON_SSF';
  status?: 'ACTIVE' | 'INACTIVE';
  q?: string;
}

export interface CreateEmployeeInput {
  code: string;
  fullName: string;
  department: string;
  designation: string;
  employmentType: 'SSF' | 'NON_SSF';
  ssfNumber?: string | null;
  basicPaisa: number;
  joiningDate: string;
  status?: 'ACTIVE' | 'INACTIVE';
  securityFundEnabled?: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

export function listEmployees(database: AppDatabase, filters: EmployeeFilters = {}): EmployeeDto[] {
  const conditions = [];
  if (filters.type) conditions.push(eq(employees.employmentType, filters.type));
  if (filters.status) conditions.push(eq(employees.status, filters.status));
  if (filters.q) {
    const search = `%${filters.q}%`;
    conditions.push(or(like(employees.fullName, search), like(employees.code, search)));
  }

  const rows = database.db
    .select()
    .from(employees)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(employees.code))
    .all();
  return rows.map(toEmployeeDto);
}

export function getEmployee(database: AppDatabase, id: string): EmployeeDto {
  const row = database.db.select().from(employees).where(eq(employees.id, id)).get();
  if (!row) throw notFound(`Employee ${id} was not found.`);
  return toEmployeeDto(row);
}

export function findEmployeeById(database: AppDatabase, id: string): EmployeeDto | null {
  const row = database.db.select().from(employees).where(eq(employees.id, id)).get();
  return row ? toEmployeeDto(row) : null;
}

export function createEmployee(database: AppDatabase, input: CreateEmployeeInput): EmployeeDto {
  const existing = database.db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.code, input.code))
    .get();
  if (existing) throw conflict(`Employee code ${input.code} is already in use.`);

  const timestamp = nowIso();
  const row = database.db
    .insert(employees)
    .values({
      id: newId(),
      code: input.code,
      fullName: input.fullName,
      department: input.department,
      designation: input.designation,
      employmentType: input.employmentType,
      ssfNumber: input.ssfNumber ?? null,
      basicPaisa: input.basicPaisa,
      joiningDate: input.joiningDate,
      status: input.status ?? 'ACTIVE',
      securityFundEnabled: input.securityFundEnabled === false ? 0 : 1,
      bankName: input.bankName,
      bankAccountName: input.bankAccountName,
      bankAccountNumber: input.bankAccountNumber,
      bankBranch: input.bankBranch,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
    .get();
  return toEmployeeDto(row);
}

export function updateEmployee(
  database: AppDatabase,
  id: string,
  input: UpdateEmployeeInput,
): EmployeeDto {
  getEmployee(database, id);

  if (input.code) {
    const existing = database.db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.code, input.code))
      .get();
    if (existing && existing.id !== id) {
      throw conflict(`Employee code ${input.code} is already in use.`);
    }
  }

  const patch: Partial<typeof employees.$inferInsert> = { updatedAt: nowIso() };
  if (input.code !== undefined) patch.code = input.code;
  if (input.fullName !== undefined) patch.fullName = input.fullName;
  if (input.department !== undefined) patch.department = input.department;
  if (input.designation !== undefined) patch.designation = input.designation;
  if (input.employmentType !== undefined) patch.employmentType = input.employmentType;
  if (input.ssfNumber !== undefined) patch.ssfNumber = input.ssfNumber;
  if (input.basicPaisa !== undefined) patch.basicPaisa = input.basicPaisa;
  if (input.joiningDate !== undefined) patch.joiningDate = input.joiningDate;
  if (input.status !== undefined) patch.status = input.status;
  if (input.securityFundEnabled !== undefined) {
    patch.securityFundEnabled = input.securityFundEnabled ? 1 : 0;
  }
  if (input.bankName !== undefined) patch.bankName = input.bankName;
  if (input.bankAccountName !== undefined) patch.bankAccountName = input.bankAccountName;
  if (input.bankAccountNumber !== undefined) patch.bankAccountNumber = input.bankAccountNumber;
  if (input.bankBranch !== undefined) patch.bankBranch = input.bankBranch;

  const row = database.db.update(employees).set(patch).where(eq(employees.id, id)).returning().get();
  return toEmployeeDto(row);
}

/** Soft delete: payroll history references this employee forever. */
export function deactivateEmployee(database: AppDatabase, id: string): EmployeeDto {
  getEmployee(database, id);
  const row = database.db
    .update(employees)
    .set({ status: 'INACTIVE', updatedAt: nowIso() })
    .where(eq(employees.id, id))
    .returning()
    .get();
  return toEmployeeDto(row);
}

export function toEmployeeDto(row: typeof employees.$inferSelect): EmployeeDto {
  return {
    id: row.id,
    code: row.code,
    fullName: row.fullName,
    department: row.department,
    designation: row.designation,
    employmentType: row.employmentType as 'SSF' | 'NON_SSF',
    ssfNumber: row.ssfNumber,
    basicPaisa: row.basicPaisa,
    joiningDate: row.joiningDate,
    status: row.status as 'ACTIVE' | 'INACTIVE',
    securityFundEnabled: row.securityFundEnabled === 1,
    bankName: row.bankName,
    bankAccountName: row.bankAccountName,
    bankAccountNumber: row.bankAccountNumber,
    bankBranch: row.bankBranch,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
