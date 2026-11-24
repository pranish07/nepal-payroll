# Decisions (ADRs)

Design choices and ambiguous requirements are recorded as Architecture Decision Records. Newer records include alternatives explicitly; all are status = accepted unless noted.

## ADR-001 — Integer paisa, basis points, hundredths; one rounding primitive

**Context.** Payroll math must be exact and reproducible. Floating point cannot represent paisa reliably.

**Decision.** Store money as integer paisa (non-negative), rates as integer basis points, hours as integer hundredths. Use `BigInt` intermediates inside `mulDivRound(a, b, den)` (half-up) and `mulDivFloor()`. No other rounding primitive is used. ESLint bans `Math.round` and `toFixed()`.

**Consequences.** All APIs take integer paisa. UI converts rupee strings to paisa by string parsing. All golden vectors are exact.

## ADR-002 — Pure core engine with explicit inputs

**Context.** The engine must be testable in isolation and reusable outside HTTP/SQLite.

**Decision.** `calculatePayslip(input, policy)` receives policy, YTD, and all period context as arguments. No clock, database, randomness, or secret parameter.

**Consequences.** Deterministic golden vectors and fast-check invariants; API is the only adapter layer.

## ADR-003 — No TypeScript compilation for core/API

**Context.** Node 20+ can run TypeScript via `tsx`; a separate emit step would add complexity without changing behavior.

**Decision.** Run core/API from `.ts` with `tsx`; use Vitest and `tsc --noEmit` for verification. Only `apps/web` has a Vite production build.

**Consequences.** `npm start` needs no pre-build except the web bundle. `dist` directories are never committed for code.

## ADR-004 — npm workspaces, committed SQL migrations, Drizzle repositories

**Context.** Need one install, reproducible schema, and typed DB access.

**Decision.** npm workspaces for `packages/*` and `apps/*`; a single committed migration `0001_init.sql` applied on startup; Drizzle schema mirrors it; repositories use Drizzle plus a few explicit SQL queries for reporting views.

**Consequences.** Schema constraints (CHECK, UNIQUE) are enforced by SQLite and tested directly, not only by zod.

## ADR-005 — All configuration from versioned FY policy tables

**Context.** SSF, slabs, OT, security fund, and advance cap must not be hard-coded.

**Decision.** Policies are append-only versioned rows selected by `effective_from_seq <= period.seq`; tax slab sets are immutable once referenced. No update/delete endpoint for policies.

**Consequences.** A new version only affects periods from its effective sequence. Historical drafts keep the policy id recorded on the run.

## ADR-006 — Structurally isolated secret component

**Context.** A secret component must never reach employee-facing JSON, HTML, PDF, or logs, yet admins need total company cost.

**Decision.** No secret parameter in the engine; no secret field in employee DTOs; all secret access in `repositories/admin.ts`; ESLint blocks employee-facing modules from importing admin modules; finalize snapshots cost into `payslip_admin_costs`. A sentinel test scans employee responses, HTML, logs, and every DB table.

**Consequences.** Adding a new employee-facing field cannot accidentally include the secret without changing the DTO and failing tests. Admin cost history is frozen at finalization. Because a finalized run never re-reads the secret table, the admin write route refuses secret changes for a finalized period with `409 PERIOD_FINALIZED`; this prevents storing an amount that the system would never use. Draft periods and periods with no run still accept writes.

## ADR-007 — One-transaction recomputing finalize, idempotent and immutable

**Context.** Drafts may be recalculated repeatedly; finalized results must never change.

**Decision.** Finalize recomputes from source data inside one SQLite transaction and writes payslips, recoveries, and admin snapshots atomically. A second finalize is a no-op; recalculation of a finalized period returns 409.

**Consequences.** No stale stored draft numbers are trusted. Partial finalization cannot be observed.

## ADR-008 — Advance balances derived from the recovery ledger

**Context.** Advance outstanding amounts must be reproducible and auditable.

**Decision.** Outstanding = principal − sum(ledger recoveries). Recoveries are written only at finalize, capped by `advanceMaxRecoveryBps × netBeforeAdvance`, and further limited by installment and outstanding. The seeded policy sets `advanceMaxRecoveryBps` to 5000, i.e. a 50% default cap. Advances are marked SETTLED when principal is fully recovered.

**Consequences.** Drafts show projected recoveries without mutating the ledger. The ledger is an exact audit trail.

## ADR-009 — Non-negative-net TDS guard (deviation)

**Context.** A literal TDS projection could exceed gross minus statutory deductions in pathological prorated months, violating the explicit invariant that net pay is never negative.

**Decision.** Cap withheld tax at `max(0, gross − employee SSF − security fund)` and emit a `TDS_LIMITED` warning. This is a deviation from a pure-formula implementation but leaves all golden vectors unchanged.

**Consequences.** The net-non-negative invariant is total. Risk: if a real jurisdiction requires carrying the shortfall differently, the warning carries the information but the recovery schedule would need a rule change.

## ADR-010 — Approximate Gregorian dates, no BS library

**Context.** The requirements list Nepali month labels but do not require a Bikram Sambat conversion algorithm.

**Decision.** Store explicit approximate ISO Gregorian boundaries for the 12 periods. No BS conversion dependency.

**Consequences.** Calculations use inclusive Gregorian day counts. A future BS library can populate `start_date`/`end_date` without touching the engine. **Risky assumption:** the approximate dates may not match official calendars for a given year.

## ADR-011 — Demo `X-Role` header authorization

**Context.** Need role separation for the demo without building an identity system.

**Decision.** `X-Role: admin|employee` (default employee); all mutations and admin reads require admin. The UI exposes a role switcher.

**Consequences.** Clear isolation demo, but this is **not authentication**. Risky assumption: acceptable for this deliverable; a production deployment must replace it with verified identity.

## ADR-012 — Soft-delete employees

**Context.** Historical payslips must keep working after someone leaves.

**Decision.** `DELETE /api/employees/:id` sets status INACTIVE. Payroll runs include ACTIVE employees only.

**Consequences.** No foreign keys break; past runs remain readable.

## ADR-013 — Basic pay is first-class; DA/Conveyance are system allowances

**Context.** The requirements distinguish fixed allowances and dynamic catalog allowances.

**Decision.** Basic pay is a column on the employee. Dearness Allowance and Conveyance are seeded `is_system = 1` allowance types with assignments. Other allowance types are admin-created and assignments are effective-dated with optional stop.

**Consequences.** System types are not deletable through the API (no delete route exists); all allowances share the same proration and taxability machinery.

## ADR-014 — Server-rendered A4 payslip HTML; opportunistic PDF

**Context.** Payslips must be printable and saveable as PDF.

**Decision.** Render deterministic HTML with A4 print CSS on the server from the employee-facing DTO. Generate sample PDFs with headless Chrome/Edge when available; no PDF library dependency.

**Consequences.** A browser's "Save as PDF" is the production path; PDF samples are committed artifacts, regenerated by `npm run samples`.

## ADR-015 — Test strategy: strong core/API, no web component tests

**Context.** Time and dependency budget.

**Decision.** Golden vectors, properties, invariants, and edge cases in `packages/core`; HTTP integration tests in `apps/api` including sentinel leak detection; web gets typecheck + production build only. Coverage thresholds apply to `packages/core/src`.

**Consequences.** Calculation correctness is heavily tested; UI regressions would be caught by typecheck/build, not component assertions. Documented as a cut.

## ADR-016 — Employee snapshot on every payslip

**Context.** A finalized payslip must display the employee identity as it was at run time even if the employee record later changes.

**Decision.** Persist `employee_snapshot_json` on `payslips` and render the employee-facing view from it; bank account is masked at render time.

**Consequences.** Finalized documents are self-contained; the admin cost view joins current employee codes for convenience but amounts come from snapshots.

## ADR-017 — Disable npm install scripts for bundled native prebuilds

**Context.** `better-sqlite3@13` ships prebuilt `.node` binaries in its npm tarball for Linux, macOS, and Windows. npm 11 nevertheless auto-runs `node-gyp rebuild` for any package with `binding.gyp` and no `install` script. On machines without Visual Studio / a C++ toolchain, a clean `npm install` or `npm ci` then fails even though the working binary is already present.

**Decision.** Commit a root `.npmrc` with `ignore-scripts=true`. No dependency in this project needs a lifecycle script: esbuild/Vite use optional platform packages, and better-sqlite3 loads its bundled prebuild at require time.

**Consequences.** Clean installs work on a bare Node installation. Risk: a future dependency that genuinely needs a postinstall step would need an explicit exception or an ADR revision.

## ADR-018 — React web app instead of React Native

**Status.** Accepted.

**Context.** The payslip is a print/PDF-oriented document, and the demo needs a role toggle plus SSF/Non-SSF filters that reviewers can exercise quickly. A native app would add emulator, SDK, and platform-tooling requirements to the setup path, which works against the goal of running locally from one command. React Native was listed only as a preference in the company's email.

**Decision.** Build the client as a React + TypeScript single-page app with Vite, Chakra UI, React Router, and TanStack Query. The Fastify process serves both the API and the built bundle.

**Alternatives considered.** React Native/Expo; server-rendered pages with no client router; a separate frontend host.

**Consequences.** Setup stays to `npm install && npm start`, and the browser's print dialog produces the PDF. The deliverable is not a mobile app, and the web app is covered by typecheck/build rather than component tests (ADR-015).

## ADR-019 — Cumulative projected-annual TDS instead of flat monthly tax

**Status.** Accepted.

**Context.** Monthly withholding must respond to mid-year salary changes, one-off taxable items, joining mid-year, and earlier months already withheld. A flat monthly slab lookup is simpler but does not settle the annual liability correctly.

**Decision.** Project the full-year taxable cash and SSF from finalized year-to-date totals, the current month, and the remaining months at their full-month fixed amounts. Apply the configured slabs to the projected annual taxable income, then withhold `(projectedAnnualTax − ytdTds) / remainingPeriods` (half-up), floored at zero. Earlier finalized periods supply YTD; missing earlier periods emit `YTD_INCOMPLETE`.

**Alternatives considered.** Flat monthly slab lookup; annual-only settlement in the last month; per-period marginal withholding with no projection.

**Consequences.** The last period of the year settles to the annual liability exactly, and bonuses or joining dates flow through the projection. Withholding varies month to month, so a single payslip cannot be audited without the YTD context the engine also records.

## ADR-020 — SSF-linked tax exemption model

**Status.** Accepted, with an assumption that needs external verification.

**Context.** The reference rates pair SSF contributions with a retirement-fund-style deduction, but the exact statutory interaction is not spelled out. The engine needs a deterministic, configurable rule.

**Decision.** For SSF employees, assessable income is projected taxable cash plus the employer SSF contribution. The exemption is `min(projected employee + employer SSF, one-third of assessable income, NPR 5,00,000 annual cap)`. Non-SSF employees receive no exemption. All three inputs live in the fiscal-year policy row, so a Finance Act change is a configuration change rather than an engine change. This is an explicit assumption modeled on the retirement-fund deduction and should be verified against the current Finance Act and an accountant before production use. A different reading — a 1% social security tax waiver on the first slab for SSF contributors — is not implemented.

**Alternatives considered.** Treat employee SSF only as the deduction base; ignore employer SSF in assessable income; implement the first-slab 1% waiver.

**Consequences.** Employer SSF affects tax twice (it raises assessable income and the exemption), and the one-third and NPR 5,00,000 floors bound the benefit. The seeded policy encodes the assumed values; golden vectors C and F pin them.

## ADR-021 — Overtime rate derived from basic pay

**Status.** Accepted.

**Context.** Overtime pay needs an hourly rate, but employees have a monthly basic rather than a stored hourly rate.

**Decision.** Derive the hourly rate as `basic ÷ otDivisorDays ÷ otHoursPerDay`, then multiply by hours and the OT multiplier: `basic × hours × multiplierBps / (otDivisorDays × otHoursPerDay × 100 × 10_000)`. Defaults are 30 divisor days, 8 hours per day, and a 1.5× multiplier (`otMultiplierBps = 15000`). A per-entry multiplier override is allowed for special cases.

**Alternatives considered.** Store an explicit hourly rate per employee; use 26 working days; use a fixed OT rate.

**Consequences.** All three parameters are versioned policy values. Overtime is calculated on full basic pay even in a joining month, because OT itself is not prorated (ADR-023).

## ADR-022 — Reimbursements default to non-taxable

**Status.** Accepted.

**Context.** Reimbursements often repay business expenses rather than pay for work, but some can be disguised remuneration.

**Decision.** Every reimbursement carries a `taxable` flag that defaults to `false`. Taxable reimbursements enter taxable cash and the full-month tax projection like taxable allowances; non-taxable ones still increase gross and net. The API accepts the flag per item; the demo form creates non-taxable items by default.

**Alternatives considered.** Treat all reimbursements as taxable; treat all as exempt; infer taxability from the label.

**Consequences.** The default keeps ordinary expense claims out of TDS while leaving a per-item path for taxable amounts. Reviewers should set the flag deliberately when the payment is really compensation.

## ADR-023 — Joining-month proration by inclusive days

**Status.** Accepted.

**Context.** Employees can join mid-period, so fixed monthly amounts must be apportioned.

**Decision.** `daysEmployed` is the inclusive day count from `max(joiningDate, periodStart)` through `periodEnd`. Basic pay, allowances, employee/employer SSF, and the security fund are prorated by `daysEmployed / daysInPeriod`. Overtime and reimbursements are not prorated. The annual tax projection uses full-month fixed amounts for future periods and the current month's fixed base, not the prorated earnings.

**Alternatives considered.** Treat every month as 30 days and prorate by calendar position; exclude the joining date from the count; prorate overtime and reimbursements too.

**Consequences.** A mid-month joiner receives a partial basic and proportional statutory deductions, while the tax projection still reflects a full-year salary. Golden vector F fixes the 15/30-day case.

## ADR-024 — Security fund is a configurable 2% placeholder

**Status.** Accepted.

**Context.** The company wants an in-house security fund separate from SSF, with a configurable percentage and a per-employee switch.

**Decision.** Compute the security fund as `securityFundBps` of prorated basic pay (seeded at 200 bps = 2%), only when the employee's `security_fund_enabled` flag is on. It is deducted from net pay, is not part of SSF, and does not reduce taxable income or the SSF exemption.

**Alternatives considered.** Fold the fund into SSF; make it tax-deductible; hard-code a per-employee amount.

**Consequences.** The 2% rate is a placeholder pending the company's actual fund policy. Because it is not tax-deductible, it reduces take-home pay without lowering TDS.

## ADR-025 — Secret component is per employee per period and frozen at finalization

**Status.** Accepted, with a compliance flag for legal review.

**Context.** The admin-only component must never appear on an employee payslip, in employee API responses, or in SSF/TDS calculations, but admins still need a complete company-cost view.

**Decision.** Store one secret row per employee and period. Write it only through the admin API; include it only in the admin cost view and in `payslip_admin_costs` snapshots written at finalization. A finalized run never re-reads the table, so the write route rejects a secret change for a finalized period with `409 PERIOD_FINALIZED` (ADR-006). Zero removes the row.

**Compliance note.** Remuneration excluded from SSF and tax calculations may conflict with statutory requirements if it is genuinely payment for work. This model is implemented as an admin-only off-book component and flagged for legal review before any real use; it is not a claim that such treatment is lawful.

**Alternatives considered.** Treat the component as a taxable allowance; include it in the engine behind an admin flag; keep it as an unattached company expense with no per-employee link.

**Consequences.** Structural isolation is enforceable by tests and lint. The component cannot be corrected retroactively after finalization (ADR-026).

## ADR-026 — Finalized runs are immutable with no unfinalize

**Status.** Accepted.

**Context.** A finalized payslip is a payroll record that employees and auditors may rely on. Allowing edits or an unfinalize step would silently change history.

**Decision.** Finalization recomputes and writes payslips, recoveries, and admin snapshots in one transaction, then marks the run FINALIZED. A second finalize is a no-op, recalculation returns 409, and no unfinalize endpoint exists. Corrections after finalization would be handled by voiding and reissuing the run or by adjustment lines in a later period, both listed as future work.

**Alternatives considered.** Allow unfinalize with an audit trail; allow in-place edits to finalized payslips; keep finalized runs recomputable.

**Consequences.** Financial history is stable and idempotent finalization is safe to retry. There is currently no correction workflow, so a mistake discovered after finalization needs a manual database decision or a future void/adjustment feature.
