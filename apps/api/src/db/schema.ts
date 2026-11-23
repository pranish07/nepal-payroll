import type { PayslipResult, TaxProjection } from '@nepal-payroll/core';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle schema = typed shape of the committed SQL migrations. Constraints
 * that Drizzle cannot express clearly (CHECK constraints, partial indexes) live
 * in migrations/0001_init.sql and are tested directly against SQLite.
 */

export const fiscalYears = sqliteTable('fiscal_years', {
  id: text('id').primaryKey(),
  label: text('label').notNull().unique(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
});

export const payrollPeriods = sqliteTable(
  'payroll_periods',
  {
    id: text('id').primaryKey(),
    fiscalYearId: text('fiscal_year_id')
      .notNull()
      .references(() => fiscalYears.id),
    indexInFy: integer('index_in_fy').notNull(),
    seq: integer('seq').notNull().unique(),
    label: text('label').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
  },
  (table) => [
    uniqueIndex('payroll_periods_fy_index_uq').on(table.fiscalYearId, table.indexInFy),
    index('payroll_periods_fy_idx').on(table.fiscalYearId),
  ],
);

export const taxSlabSets = sqliteTable('tax_slab_sets', {
  id: text('id').primaryKey(),
  fiscalYearId: text('fiscal_year_id')
    .notNull()
    .references(() => fiscalYears.id),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

export const taxSlabs = sqliteTable(
  'tax_slabs',
  {
    id: text('id').primaryKey(),
    slabSetId: text('slab_set_id')
      .notNull()
      .references(() => taxSlabSets.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    upperBoundPaisa: integer('upper_bound_paisa'),
    rateBps: integer('rate_bps').notNull(),
  },
  (table) => [uniqueIndex('tax_slabs_set_ordinal_uq').on(table.slabSetId, table.ordinal)],
);

export const policies = sqliteTable(
  'policies',
  {
    id: text('id').primaryKey(),
    fiscalYearId: text('fiscal_year_id')
      .notNull()
      .references(() => fiscalYears.id),
    version: integer('version').notNull(),
    effectiveFromSeq: integer('effective_from_seq').notNull(),
    ssfEmployeeBps: integer('ssf_employee_bps').notNull(),
    ssfEmployerBps: integer('ssf_employer_bps').notNull(),
    retirementCapAnnualPaisa: integer('retirement_cap_annual_paisa').notNull(),
    retirementShareDen: integer('retirement_share_den').notNull(),
    otMultiplierBps: integer('ot_multiplier_bps').notNull(),
    otDivisorDays: integer('ot_divisor_days').notNull(),
    otHoursPerDay: integer('ot_hours_per_day').notNull(),
    securityFundBps: integer('security_fund_bps').notNull(),
    advanceMaxRecoveryBps: integer('advance_max_recovery_bps').notNull(),
    taxSlabSetId: text('tax_slab_set_id')
      .notNull()
      .references(() => taxSlabSets.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('policies_fy_version_uq').on(table.fiscalYearId, table.version),
    index('policies_effective_idx').on(table.fiscalYearId, table.effectiveFromSeq),
  ],
);

export const employees = sqliteTable(
  'employees',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    fullName: text('full_name').notNull(),
    department: text('department').notNull(),
    designation: text('designation').notNull(),
    employmentType: text('employment_type').notNull(),
    ssfNumber: text('ssf_number'),
    basicPaisa: integer('basic_paisa').notNull(),
    joiningDate: text('joining_date').notNull(),
    status: text('status').notNull(),
    securityFundEnabled: integer('security_fund_enabled').notNull(),
    bankName: text('bank_name').notNull(),
    bankAccountName: text('bank_account_name').notNull(),
    bankAccountNumber: text('bank_account_number').notNull(),
    bankBranch: text('bank_branch').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('employees_status_idx').on(table.status),
    index('employees_type_idx').on(table.employmentType),
  ],
);

export const allowanceTypes = sqliteTable('allowance_types', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  defaultTaxable: integer('default_taxable').notNull(),
  isSystem: integer('is_system').notNull(),
  createdAt: text('created_at').notNull(),
});

export const employeeAllowances = sqliteTable(
  'employee_allowances',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    allowanceTypeId: text('allowance_type_id')
      .notNull()
      .references(() => allowanceTypes.id),
    amountPaisa: integer('amount_paisa').notNull(),
    taxable: integer('taxable').notNull(),
    fromPeriodId: text('from_period_id')
      .notNull()
      .references(() => payrollPeriods.id),
    stopFromPeriodId: text('stop_from_period_id').references(() => payrollPeriods.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('employee_allowances_employee_idx').on(table.employeeId),
    index('employee_allowances_period_idx').on(table.fromPeriodId),
  ],
);

export const reimbursements = sqliteTable(
  'reimbursements',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    label: text('label').notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    kind: text('kind').notNull(),
    periodId: text('period_id').references(() => payrollPeriods.id),
    fromPeriodId: text('from_period_id').references(() => payrollPeriods.id),
    stopFromPeriodId: text('stop_from_period_id').references(() => payrollPeriods.id),
    taxable: integer('taxable').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('reimbursements_employee_idx').on(table.employeeId),
    index('reimbursements_period_idx').on(table.periodId),
  ],
);

export const overtimeEntries = sqliteTable(
  'overtime_entries',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    periodId: text('period_id')
      .notNull()
      .references(() => payrollPeriods.id),
    hoursHundredths: integer('hours_hundredths').notNull(),
    multiplierOverrideBps: integer('multiplier_override_bps'),
    note: text('note'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('overtime_employee_period_uq').on(table.employeeId, table.periodId)],
);

export const advances = sqliteTable(
  'advances',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    principalPaisa: integer('principal_paisa').notNull(),
    issuedOn: text('issued_on').notNull(),
    installmentPaisa: integer('installment_paisa'),
    status: text('status').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('advances_employee_status_idx').on(table.employeeId, table.status)],
);

export const payrollRuns = sqliteTable(
  'payroll_runs',
  {
    id: text('id').primaryKey(),
    periodId: text('period_id')
      .notNull()
      .unique()
      .references(() => payrollPeriods.id),
    status: text('status').notNull(),
    policyId: text('policy_id')
      .notNull()
      .references(() => policies.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    finalizedAt: text('finalized_at'),
  },
  (table) => [index('payroll_runs_status_idx').on(table.status)],
);

export interface CalcAudit {
  policy: {
    id: string;
    version: number;
    effectiveFromSeq: number;
    ssfEmployeeBps: number;
    ssfEmployerBps: number;
    securityFundBps: number;
    advanceMaxRecoveryBps: number;
  };
  taxProjection: TaxProjection;
  fixedTaxableMonthlyPaisa: number;
  fullMonthEmployeeSsfPaisa: number;
  fullMonthEmployerSsfPaisa: number;
  netBeforeAdvancePaisa: number;
  advanceCapPaisa: number;
  ytdIncomplete: boolean;
  warnings: PayslipResult['warnings'];
}

export const payslips = sqliteTable(
  'payslips',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => payrollRuns.id),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    employmentType: text('employment_type').notNull(),
    employeeSnapshotJson: text('employee_snapshot_json').notNull(),
    daysEmployed: integer('days_employed').notNull(),
    daysInPeriod: integer('days_in_period').notNull(),
    grossPaisa: integer('gross_paisa').notNull(),
    taxableCashPaisa: integer('taxable_cash_paisa').notNull(),
    fixedTaxableMonthlyPaisa: integer('fixed_taxable_monthly_paisa').notNull(),
    ssfEmployeePaisa: integer('ssf_employee_paisa').notNull(),
    ssfEmployerPaisa: integer('ssf_employer_paisa').notNull(),
    tdsPaisa: integer('tds_paisa').notNull(),
    securityFundPaisa: integer('security_fund_paisa').notNull(),
    advanceRecoveryPaisa: integer('advance_recovery_paisa').notNull(),
    totalDeductionsPaisa: integer('total_deductions_paisa').notNull(),
    netPaisa: integer('net_paisa').notNull(),
    advanceBalanceBeforePaisa: integer('advance_balance_before_paisa').notNull(),
    advanceBalanceAfterPaisa: integer('advance_balance_after_paisa').notNull(),
    linesJson: text('lines_json').notNull(),
    calcJson: text('calc_json').notNull(),
    ytdJson: text('ytd_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('payslips_run_employee_uq').on(table.runId, table.employeeId),
    index('payslips_employee_idx').on(table.employeeId),
  ],
);

export const advanceRecoveries = sqliteTable(
  'advance_recoveries',
  {
    id: text('id').primaryKey(),
    advanceId: text('advance_id')
      .notNull()
      .references(() => advances.id),
    payslipId: text('payslip_id')
      .notNull()
      .references(() => payslips.id, { onDelete: 'cascade' }),
    amountPaisa: integer('amount_paisa').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('advance_recoveries_advance_payslip_uq').on(table.advanceId, table.payslipId),
    index('advance_recoveries_payslip_idx').on(table.payslipId),
  ],
);

// Admin-only table. Only repositories/admin.ts may touch it.
export const secretComponents = sqliteTable(
  'secret_components',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    periodId: text('period_id')
      .notNull()
      .references(() => payrollPeriods.id),
    amountPaisa: integer('amount_paisa').notNull(),
    note: text('note'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('secret_components_employee_period_uq').on(table.employeeId, table.periodId)],
);

// Admin-only table. Only repositories/admin.ts may touch it.
export const payslipAdminCosts = sqliteTable('payslip_admin_costs', {
  payslipId: text('payslip_id')
    .primaryKey()
    .references(() => payslips.id, { onDelete: 'cascade' }),
  secretPaisa: integer('secret_paisa').notNull(),
  secretLinesJson: text('secret_lines_json').notNull(),
  employerSsfPaisa: integer('employer_ssf_paisa').notNull(),
  companyCostPaisa: integer('company_cost_paisa').notNull(),
  paidOutToEmployeePaisa: integer('paid_out_to_employee_paisa').notNull(),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    detailJson: text('detail_json'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('audit_log_created_idx').on(table.createdAt)],
);
