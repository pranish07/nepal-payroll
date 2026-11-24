# Decisions (ADRs)

Ambiguities in the brief were resolved with the following Architecture Decision Records. Each is short and status = accepted unless noted.

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

**Decision.** Outstanding = principal − sum(ledger recoveries). Recoveries are written only at finalize, capped by `advanceMaxRecoveryBps × netBeforeAdvance`, and further limited by installment and outstanding. Advances are marked SETTLED when principal is fully recovered.

**Consequences.** Drafts show projected recoveries without mutating the ledger. The ledger is an exact audit trail.

## ADR-009 — Non-negative-net TDS guard (deviation)

**Context.** A literal TDS projection could exceed gross minus statutory deductions in pathological prorated months, violating the explicit invariant that net pay is never negative.

**Decision.** Cap withheld tax at `max(0, gross − employee SSF − security fund)` and emit a `TDS_LIMITED` warning. This is a deviation from a pure-formula implementation but leaves all golden vectors unchanged.

**Consequences.** The net-non-negative invariant is total. Risk: if a real jurisdiction requires carrying the shortfall differently, the warning carries the information but the recovery schedule would need a rule change.

## ADR-010 — Approximate Gregorian dates, no BS library

**Context.** The brief lists Nepali month labels but does not require a Bikram Sambat conversion algorithm.

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

**Context.** The brief distinguishes fixed allowances and dynamic catalog allowances.

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
