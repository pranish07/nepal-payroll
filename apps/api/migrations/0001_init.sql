-- Nepal mini payroll: initial schema.
-- Money is INTEGER paisa, non-negative. Rates are INTEGER basis points.

CREATE TABLE fiscal_years (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  CHECK (start_date <= end_date)
);

CREATE TABLE payroll_periods (
  id TEXT PRIMARY KEY,
  fiscal_year_id TEXT NOT NULL REFERENCES fiscal_years(id),
  index_in_fy INTEGER NOT NULL CHECK (index_in_fy BETWEEN 1 AND 12),
  seq INTEGER NOT NULL UNIQUE CHECK (seq > 0),
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  UNIQUE (fiscal_year_id, index_in_fy),
  CHECK (start_date <= end_date)
);

CREATE TABLE tax_slab_sets (
  id TEXT PRIMARY KEY,
  fiscal_year_id TEXT NOT NULL REFERENCES fiscal_years(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (fiscal_year_id, name)
);

CREATE TABLE tax_slabs (
  id TEXT PRIMARY KEY,
  slab_set_id TEXT NOT NULL REFERENCES tax_slab_sets(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
  upper_bound_paisa INTEGER CHECK (upper_bound_paisa IS NULL OR upper_bound_paisa > 0),
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  UNIQUE (slab_set_id, ordinal)
);

CREATE TABLE policies (
  id TEXT PRIMARY KEY,
  fiscal_year_id TEXT NOT NULL REFERENCES fiscal_years(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  effective_from_seq INTEGER NOT NULL CHECK (effective_from_seq > 0),
  ssf_employee_bps INTEGER NOT NULL CHECK (ssf_employee_bps BETWEEN 0 AND 10000),
  ssf_employer_bps INTEGER NOT NULL CHECK (ssf_employer_bps BETWEEN 0 AND 10000),
  retirement_cap_annual_paisa INTEGER NOT NULL CHECK (retirement_cap_annual_paisa >= 0),
  retirement_share_den INTEGER NOT NULL CHECK (retirement_share_den > 0),
  ot_multiplier_bps INTEGER NOT NULL CHECK (ot_multiplier_bps > 0),
  ot_divisor_days INTEGER NOT NULL CHECK (ot_divisor_days > 0),
  ot_hours_per_day INTEGER NOT NULL CHECK (ot_hours_per_day > 0),
  security_fund_bps INTEGER NOT NULL CHECK (security_fund_bps BETWEEN 0 AND 10000),
  advance_max_recovery_bps INTEGER NOT NULL CHECK (advance_max_recovery_bps BETWEEN 0 AND 10000),
  tax_slab_set_id TEXT NOT NULL REFERENCES tax_slab_sets(id),
  created_at TEXT NOT NULL,
  UNIQUE (fiscal_year_id, version)
);

CREATE INDEX policies_effective_idx ON policies(fiscal_year_id, effective_from_seq);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL,
  designation TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('SSF', 'NON_SSF')),
  ssf_number TEXT,
  basic_paisa INTEGER NOT NULL CHECK (basic_paisa >= 0),
  joining_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  security_fund_enabled INTEGER NOT NULL DEFAULT 1 CHECK (security_fund_enabled IN (0, 1)),
  bank_name TEXT NOT NULL,
  bank_account_name TEXT NOT NULL,
  bank_account_number TEXT NOT NULL,
  bank_branch TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX employees_status_idx ON employees(status);
CREATE INDEX employees_type_idx ON employees(employment_type);

CREATE TABLE allowance_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  default_taxable INTEGER NOT NULL CHECK (default_taxable IN (0, 1)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE employee_allowances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  allowance_type_id TEXT NOT NULL REFERENCES allowance_types(id),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa >= 0),
  taxable INTEGER NOT NULL CHECK (taxable IN (0, 1)),
  from_period_id TEXT NOT NULL REFERENCES payroll_periods(id),
  stop_from_period_id TEXT REFERENCES payroll_periods(id),
  created_at TEXT NOT NULL,
  CHECK (stop_from_period_id IS NULL OR stop_from_period_id <> from_period_id)
);

CREATE INDEX employee_allowances_employee_idx ON employee_allowances(employee_id);
CREATE INDEX employee_allowances_period_idx ON employee_allowances(from_period_id);

CREATE TABLE reimbursements (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  label TEXT NOT NULL,
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('ONE_TIME', 'RECURRING')),
  period_id TEXT REFERENCES payroll_periods(id),
  from_period_id TEXT REFERENCES payroll_periods(id),
  stop_from_period_id TEXT REFERENCES payroll_periods(id),
  taxable INTEGER NOT NULL DEFAULT 0 CHECK (taxable IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK (
    (kind = 'ONE_TIME' AND period_id IS NOT NULL AND from_period_id IS NULL AND stop_from_period_id IS NULL)
    OR
    (kind = 'RECURRING' AND period_id IS NULL AND from_period_id IS NOT NULL)
  ),
  CHECK (stop_from_period_id IS NULL OR from_period_id IS NULL OR stop_from_period_id <> from_period_id)
);

CREATE INDEX reimbursements_employee_idx ON reimbursements(employee_id);
CREATE INDEX reimbursements_period_idx ON reimbursements(period_id);

CREATE TABLE overtime_entries (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  period_id TEXT NOT NULL REFERENCES payroll_periods(id),
  hours_hundredths INTEGER NOT NULL CHECK (hours_hundredths >= 0),
  multiplier_override_bps INTEGER CHECK (multiplier_override_bps IS NULL OR multiplier_override_bps > 0),
  note TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, period_id)
);

CREATE TABLE advances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  principal_paisa INTEGER NOT NULL CHECK (principal_paisa > 0),
  issued_on TEXT NOT NULL,
  installment_paisa INTEGER CHECK (installment_paisa IS NULL OR installment_paisa > 0),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SETTLED')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX advances_employee_status_idx ON advances(employee_id, status);

CREATE TABLE payroll_runs (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL UNIQUE REFERENCES payroll_periods(id),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'FINALIZED')),
  policy_id TEXT NOT NULL REFERENCES policies(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT
);

CREATE INDEX payroll_runs_status_idx ON payroll_runs(status);

CREATE TABLE payslips (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES payroll_runs(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  employment_type TEXT NOT NULL CHECK (employment_type IN ('SSF', 'NON_SSF')),
  employee_snapshot_json TEXT NOT NULL,
  days_employed INTEGER NOT NULL CHECK (days_employed >= 0),
  days_in_period INTEGER NOT NULL CHECK (days_in_period > 0),
  gross_paisa INTEGER NOT NULL CHECK (gross_paisa >= 0),
  taxable_cash_paisa INTEGER NOT NULL CHECK (taxable_cash_paisa >= 0),
  fixed_taxable_monthly_paisa INTEGER NOT NULL CHECK (fixed_taxable_monthly_paisa >= 0),
  ssf_employee_paisa INTEGER NOT NULL CHECK (ssf_employee_paisa >= 0),
  ssf_employer_paisa INTEGER NOT NULL CHECK (ssf_employer_paisa >= 0),
  tds_paisa INTEGER NOT NULL CHECK (tds_paisa >= 0),
  security_fund_paisa INTEGER NOT NULL CHECK (security_fund_paisa >= 0),
  advance_recovery_paisa INTEGER NOT NULL CHECK (advance_recovery_paisa >= 0),
  total_deductions_paisa INTEGER NOT NULL CHECK (total_deductions_paisa >= 0),
  net_paisa INTEGER NOT NULL CHECK (net_paisa >= 0),
  advance_balance_before_paisa INTEGER NOT NULL CHECK (advance_balance_before_paisa >= 0),
  advance_balance_after_paisa INTEGER NOT NULL CHECK (advance_balance_after_paisa >= 0),
  lines_json TEXT NOT NULL,
  calc_json TEXT NOT NULL,
  ytd_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, employee_id)
);

CREATE INDEX payslips_employee_idx ON payslips(employee_id);

CREATE TABLE advance_recoveries (
  id TEXT PRIMARY KEY,
  advance_id TEXT NOT NULL REFERENCES advances(id),
  payslip_id TEXT NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  created_at TEXT NOT NULL,
  UNIQUE (advance_id, payslip_id)
);

CREATE INDEX advance_recoveries_payslip_idx ON advance_recoveries(payslip_id);

-- Admin-only: reachable only through repositories/admin.ts.
CREATE TABLE secret_components (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  period_id TEXT NOT NULL REFERENCES payroll_periods(id),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa >= 0),
  note TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, period_id)
);

-- Admin-only: reachable only through repositories/admin.ts.
CREATE TABLE payslip_admin_costs (
  payslip_id TEXT PRIMARY KEY REFERENCES payslips(id) ON DELETE CASCADE,
  secret_paisa INTEGER NOT NULL CHECK (secret_paisa >= 0),
  secret_lines_json TEXT NOT NULL,
  employer_ssf_paisa INTEGER NOT NULL CHECK (employer_ssf_paisa >= 0),
  company_cost_paisa INTEGER NOT NULL CHECK (company_cost_paisa >= 0),
  paid_out_to_employee_paisa INTEGER NOT NULL CHECK (paid_out_to_employee_paisa >= 0)
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX audit_log_created_idx ON audit_log(created_at);
