import {
  PayrollInputError,
  validateTaxSlabs,
  type PayrollPolicy,
  type TaxSlab,
} from '@nepal-payroll/core';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { fiscalYears, payrollPeriods, policies, taxSlabs, taxSlabSets } from '../db/schema.js';
import { badRequest, configError, notFound } from '../errors.js';
import type { PeriodDto, PolicyDto, TaxSlabDto } from '../types.js';
import { nowIso, newId } from '../util.js';

interface PeriodRow {
  id: string;
  fiscal_year_id: string;
  fiscal_year_label: string;
  index_in_fy: number;
  seq: number;
  label: string;
  start_date: string;
  end_date: string;
  run_id: string | null;
  run_status: 'DRAFT' | 'FINALIZED' | null;
}

interface PolicyRow {
  id: string;
  fiscal_year_id: string;
  version: number;
  effective_from_seq: number;
  ssf_employee_bps: number;
  ssf_employer_bps: number;
  retirement_cap_annual_paisa: number;
  retirement_share_den: number;
  ot_multiplier_bps: number;
  ot_divisor_days: number;
  ot_hours_per_day: number;
  security_fund_bps: number;
  advance_max_recovery_bps: number;
  tax_slab_set_id: string;
  created_at: string;
}

interface SlabRow {
  id: string;
  ordinal: number;
  upper_bound_paisa: number | null;
  rate_bps: number;
}

export interface ResolvedPolicy {
  id: string;
  version: number;
  effectiveFromSeq: number;
  taxSlabSetId: string;
  policy: PayrollPolicy;
  slabs: TaxSlabDto[];
}

export interface CreatePolicyInput {
  effectiveFromSeq?: number;
  ssfEmployeeBps: number;
  ssfEmployerBps: number;
  retirementCapAnnualPaisa: number;
  retirementShareDen: number;
  otMultiplierBps: number;
  otDivisorDays: number;
  otHoursPerDay: number;
  securityFundBps: number;
  advanceMaxRecoveryBps: number;
  taxSlabSetId: string;
}

export function listFiscalYears(database: AppDatabase) {
  return database.db.select().from(fiscalYears).orderBy(fiscalYears.label).all();
}

export function getFiscalYearOrThrow(database: AppDatabase, id: string) {
  const row = database.db.select().from(fiscalYears).where(eq(fiscalYears.id, id)).get();
  if (!row) throw notFound(`Fiscal year ${id} was not found.`);
  return row;
}

const PERIOD_SELECT = `
  SELECT p.*, fy.label AS fiscal_year_label, r.id AS run_id, r.status AS run_status
  FROM payroll_periods p
  JOIN fiscal_years fy ON fy.id = p.fiscal_year_id
  LEFT JOIN payroll_runs r ON r.period_id = p.id
`;

export function listPeriods(database: AppDatabase): PeriodDto[] {
  const rows = database.raw
    .prepare(`${PERIOD_SELECT} ORDER BY p.seq ASC`)
    .all() as PeriodRow[];
  return rows.map(toPeriodDto);
}

export function getPeriodOrThrow(database: AppDatabase, id: string): PeriodDto {
  const row = database.raw.prepare(`${PERIOD_SELECT} WHERE p.id = ?`).get(id) as
    | PeriodRow
    | undefined;
  if (!row) throw notFound(`Payroll period ${id} was not found.`);
  return toPeriodDto(row);
}

export function listPolicies(database: AppDatabase, fiscalYearId: string): PolicyDto[] {
  const rows = database.raw
    .prepare('SELECT * FROM policies WHERE fiscal_year_id = ? ORDER BY version DESC')
    .all(fiscalYearId) as PolicyRow[];
  return rows.map((row) => toPolicyDto(database, row));
}

/** The latest version for display; period calculation uses resolvePolicyForPeriod. */
export function getLatestPolicy(database: AppDatabase, fiscalYearId: string): PolicyDto | null {
  const row = database.raw
    .prepare(
      'SELECT * FROM policies WHERE fiscal_year_id = ? ORDER BY effective_from_seq DESC, version DESC LIMIT 1',
    )
    .get(fiscalYearId) as PolicyRow | undefined;
  return row ? toPolicyDto(database, row) : null;
}

/**
 * Effective-dated lookup: the latest policy version whose effectiveFromSeq is
 * at or before the period's global sequence.
 */
export function resolvePolicyForPeriod(
  database: AppDatabase,
  period: PeriodDto,
): ResolvedPolicy {
  const row = database.raw
    .prepare(
      `SELECT * FROM policies
       WHERE fiscal_year_id = ? AND effective_from_seq <= ?
       ORDER BY effective_from_seq DESC, version DESC, created_at DESC
       LIMIT 1`,
    )
    .get(period.fiscalYearId, period.seq) as PolicyRow | undefined;

  if (!row) {
    throw configError(
      `No payroll policy is effective for ${period.label}. An admin must create a policy version first.`,
      { fiscalYearId: period.fiscalYearId, periodSeq: period.seq },
    );
  }

  const slabs = readSlabs(database, row.tax_slab_set_id);
  try {
    validateTaxSlabs(slabs.map((slab) => ({ upperBoundPaisa: slab.upperBoundPaisa, rateBps: slab.rateBps })));
  } catch (error) {
    if (error instanceof PayrollInputError) {
      throw configError(`The tax slabs attached to policy ${row.id} are invalid: ${error.message}`);
    }
    throw error;
  }

  return {
    id: row.id,
    version: row.version,
    effectiveFromSeq: row.effective_from_seq,
    taxSlabSetId: row.tax_slab_set_id,
    slabs,
    policy: {
      ssfEmployeeBps: row.ssf_employee_bps,
      ssfEmployerBps: row.ssf_employer_bps,
      retirementCapAnnualPaisa: row.retirement_cap_annual_paisa,
      retirementShareDen: row.retirement_share_den,
      otMultiplierBps: row.ot_multiplier_bps,
      otDivisorDays: row.ot_divisor_days,
      otHoursPerDay: row.ot_hours_per_day,
      securityFundBps: row.security_fund_bps,
      advanceMaxRecoveryBps: row.advance_max_recovery_bps,
      taxSlabs: slabs.map((slab) => ({ upperBoundPaisa: slab.upperBoundPaisa, rateBps: slab.rateBps })),
    },
  };
}

export function createPolicy(
  database: AppDatabase,
  fiscalYearId: string,
  input: CreatePolicyInput,
): PolicyDto {
  getFiscalYearOrThrow(database, fiscalYearId);

  const slabSet = database.db
    .select()
    .from(taxSlabSets)
    .where(eq(taxSlabSets.id, input.taxSlabSetId))
    .get();
  if (!slabSet || slabSet.fiscalYearId !== fiscalYearId) {
    throw badRequest('taxSlabSetId must identify a tax slab set in this fiscal year.');
  }

  const effectiveFromSeq = input.effectiveFromSeq ?? 1;
  const period = database.db
    .select({ id: payrollPeriods.id })
    .from(payrollPeriods)
    .where(eq(payrollPeriods.seq, effectiveFromSeq))
    .get();
  if (!period) {
    throw badRequest(`No payroll period with seq ${effectiveFromSeq} exists.`);
  }

  const maxVersion = database.raw
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM policies WHERE fiscal_year_id = ?')
    .get(fiscalYearId) as { version: number };

  const created = database.db
    .insert(policies)
    .values({
      id: newId(),
      fiscalYearId,
      version: maxVersion.version + 1,
      effectiveFromSeq,
      ssfEmployeeBps: input.ssfEmployeeBps,
      ssfEmployerBps: input.ssfEmployerBps,
      retirementCapAnnualPaisa: input.retirementCapAnnualPaisa,
      retirementShareDen: input.retirementShareDen,
      otMultiplierBps: input.otMultiplierBps,
      otDivisorDays: input.otDivisorDays,
      otHoursPerDay: input.otHoursPerDay,
      securityFundBps: input.securityFundBps,
      advanceMaxRecoveryBps: input.advanceMaxRecoveryBps,
      taxSlabSetId: input.taxSlabSetId,
      createdAt: nowIso(),
    })
    .returning()
    .get();

  const row = database.raw
    .prepare('SELECT * FROM policies WHERE id = ?')
    .get(created.id) as PolicyRow;
  return toPolicyDto(database, row);
}

export function listTaxSlabSets(database: AppDatabase, fiscalYearId: string) {
  const sets = database.db
    .select()
    .from(taxSlabSets)
    .where(eq(taxSlabSets.fiscalYearId, fiscalYearId))
    .all();
  return sets.map((set) => ({
    id: set.id,
    fiscalYearId: set.fiscalYearId,
    name: set.name,
    createdAt: set.createdAt,
    slabs: readSlabs(database, set.id),
  }));
}

export function createTaxSlabSet(
  database: AppDatabase,
  fiscalYearId: string,
  input: { name: string; slabs: TaxSlab[] },
) {
  getFiscalYearOrThrow(database, fiscalYearId);
  try {
    validateTaxSlabs(input.slabs);
  } catch (error) {
    if (error instanceof PayrollInputError) throw badRequest(error.message, { field: error.field });
    throw error;
  }

  const setId = newId();
  const createdAt = nowIso();
  database.raw.transaction(() => {
    database.db.insert(taxSlabSets).values({ id: setId, fiscalYearId, name: input.name, createdAt }).run();
    input.slabs.forEach((slab, index) => {
      database.db
        .insert(taxSlabs)
        .values({
          id: newId(),
          slabSetId: setId,
          ordinal: index + 1,
          upperBoundPaisa: slab.upperBoundPaisa,
          rateBps: slab.rateBps,
        })
        .run();
    });
  })();

  return {
    id: setId,
    fiscalYearId,
    name: input.name,
    createdAt,
    slabs: readSlabs(database, setId),
  };
}

function readSlabs(database: AppDatabase, slabSetId: string): TaxSlabDto[] {
  const rows = database.raw
    .prepare('SELECT * FROM tax_slabs WHERE slab_set_id = ? ORDER BY ordinal ASC')
    .all(slabSetId) as SlabRow[];
  return rows.map((row) => ({
    id: row.id,
    ordinal: row.ordinal,
    upperBoundPaisa: row.upper_bound_paisa,
    rateBps: row.rate_bps,
  }));
}

function toPolicyDto(database: AppDatabase, row: PolicyRow): PolicyDto {
  return {
    id: row.id,
    fiscalYearId: row.fiscal_year_id,
    version: row.version,
    effectiveFromSeq: row.effective_from_seq,
    ssfEmployeeBps: row.ssf_employee_bps,
    ssfEmployerBps: row.ssf_employer_bps,
    retirementCapAnnualPaisa: row.retirement_cap_annual_paisa,
    retirementShareDen: row.retirement_share_den,
    otMultiplierBps: row.ot_multiplier_bps,
    otDivisorDays: row.ot_divisor_days,
    otHoursPerDay: row.ot_hours_per_day,
    securityFundBps: row.security_fund_bps,
    advanceMaxRecoveryBps: row.advance_max_recovery_bps,
    taxSlabSetId: row.tax_slab_set_id,
    slabs: readSlabs(database, row.tax_slab_set_id),
    createdAt: row.created_at,
  };
}

function toPeriodDto(row: PeriodRow): PeriodDto {
  return {
    id: row.id,
    fiscalYearId: row.fiscal_year_id,
    fiscalYearLabel: row.fiscal_year_label,
    indexInFy: row.index_in_fy,
    seq: row.seq,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    runId: row.run_id,
    runStatus: row.run_status,
  };
}
