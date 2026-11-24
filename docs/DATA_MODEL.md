# Data model

Source of truth: `apps/api/migrations/0001_init.sql`. Drizzle definitions in `apps/api/src/db/schema.ts` mirror the tables for typed repository code. All money columns are `INTEGER` paisa; rates are `INTEGER` basis points; `hours_hundredths` is an integer.

## Tables

| Table | Purpose | Notable constraints |
| --- | --- | --- |
| `fiscal_years` | Fiscal year label and date span | unique label, start ≤ end |
| `payroll_periods` | 12 monthly periods per FY | unique `(fiscal_year_id, index_in_fy)`, unique global `seq` |
| `tax_slab_sets` | Immutable slab sets | unique `(fiscal_year_id, name)` |
| `tax_slabs` | Marginal slabs | ordinal ≥ 1, `rate_bps` 0–10,000, final `upper_bound_paisa` may be NULL, unique `(slab_set_id, ordinal)` |
| `policies` | Append-only versioned configuration | unique `(fiscal_year_id, version)`, all rates validated by CHECK |
| `employees` | Employee master and bank details | unique code; `ssf_number` is optional for SSF employees and absent for non-SSF; money non-negative |
| `allowance_types` | Catalog (Dearness/Conveyance seeded as system) | unique name; `is_system` flag |
| `employee_allowances` | Effective-dated allowance assignments | stop period must differ from start period |
| `reimbursements` | One-time (period-bound) or recurring (effective-dated, stoppable) | CHECK enforces the kind/period shape |
| `overtime_entries` | Per employee+period hours and optional multiplier override | unique `(employee_id, period_id)` |
| `advances` | Principal, issue date, optional installment, status | principal > 0; status ACTIVE/SETTLED |
| `payroll_runs` | One run per period | unique `period_id`; status DRAFT/FINALIZED |
| `payslips` | Per run+employee result plus JSON snapshots | unique `(run_id, employee_id)`; all totals non-negative; stores `employee_snapshot_json`, `lines_json`, `calc_json`, `ytd_json` |
| `advance_recoveries` | Ledger of finalized recoveries | unique `(advance_id, payslip_id)`; amount > 0; cascades with payslips |
| `secret_components` | **Admin-only** secret per employee+period | unique `(employee_id, period_id)` |
| `payslip_admin_costs` | **Admin-only** frozen cost snapshot per payslip | one row per payslip; secret/company/paid-out amounts non-negative |
| `audit_log` | Append-only audit of admin actions | role, action, entity, optional detail JSON |

## Effective dating

- Allowances: `from_period_id` → `from_seq`; optional `stop_from_period_id` → `stop_from_seq`. Effective when `from_seq <= period.seq < stop_seq` (or no stop).
- Recurring reimbursements: same model.
- One-time reimbursements: exact `period_id` match.
- Policies: latest row with `effective_from_seq <= period.seq` wins.

The pure helper `isEffectiveInPeriod()` in `packages/core/src/effective.ts` implements the interval rule and is used by the API adapter.

## Derived state

- Advance outstanding = `principal − SUM(advance_recoveries.amount_paisa)`, computed by `listAdvances()`.
- YTD totals are summed from **finalized** payslips in earlier periods of the same fiscal year; payslips of the current run are added by the view layer.
- Run totals are summed from payslip rows by `summarize()`; employer cost = gross + employer SSF (secret is never included in employee totals).

## Immutability rules

- Policy/tax-slab rows: no update or delete endpoints in the API.
- Finalized runs: no recalculation (409); finalize is idempotent.
- Finalized admin cost snapshots: written once at finalization; later secret edits do not affect them.
- Employee deletion: soft (status INACTIVE).

## Indexes

Foreign keys and lookups are indexed for the access paths actually used: employee status/type, allowance employee/period, reimbursement employee/period, advance employee/status, run status, payslip employee/period, recovery payslip, audit timestamp, and policy effective lookup.
