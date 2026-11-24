# Architecture

## Layers

```text
Browser (apps/web)
   │  fetch /api/... with X-Role
   ▼
Fastify routes (apps/api/src/routes)
   │  zod validation, requireAdmin hook
   ▼
Services (apps/api/src/services)
   │  orchestration, DTO assembly, transaction boundaries
   ▼
Repositories (apps/api/src/repositories)
   │  Drizzle / raw SQL, AppError on constraint failures
   ▼
SQLite (apps/api/migrations/0001_init.sql)
```

`packages/core` is deliberately outside this stack. It is imported by the API (and referenced in tests) but imports nothing from it. It has no database, no clock, no randomness, and no I/O.

## Request flow: draft run

1. `POST /api/periods/:id/run` → `requireAdmin`.
2. `calculateDraft()` resolves the fiscal-year policy version effective at the period's global `seq`.
3. Inside one transaction: upsert a DRAFT run (rejecting finalized periods), load all active employees joined on or before period end, build each engine input from effective-dated pay items and derived YTD, call `calculatePayslip()`, delete old payslips for the run, insert new ones.
4. `getRunView()` reads the saved rows back and returns summaries, totals, and warnings.

Recalculating a draft replaces its payslips. No advance recovery or admin cost snapshot is written at draft time.

## Request flow: finalize

`POST /api/runs/:id/finalize` → `finalizeRun()`:

1. Transaction starts. If the run is already FINALIZED, return immediately (idempotent).
2. Recompute every payslip from current data in one transaction; never reuse stored draft numbers.
3. Delete and re-insert payslips; insert advance recoveries for each allocation.
4. Compute admin cost from the payslip totals plus the current secret component for that period and write `payslip_admin_costs` snapshots.
5. Mark advances fully recovered as SETTLED, mark the run FINALIZED, write an audit row, commit.

Any failure rolls the whole thing back. A finalized run is immutable: recalculation via `POST /api/periods/:id/run` returns 409, and a second finalize is a no-op.

## Secret isolation

The admin-only component is kept out of employee-facing code by construction, not by field omission alone:

- `calculatePayslip()` has no `secret` parameter. Secret money cannot enter engine results.
- Employee payslip DTO (`EmployeePayslipView`) has no secret field. `renderPayslipHtml()` consumes only that DTO.
- Only `repositories/admin.ts` reads/writes `secret_components` and `payslip_admin_costs`. Employee-facing modules (`routes/payslips.ts`, `payslip/**`) are blocked from importing it by ESLint.
- The admin cost view for a DRAFT computes live from the secret table; for a FINALIZED run it reads the frozen snapshots, so later secret edits cannot change history.
- `apps/api/test/api.test.ts` plants a unique sentinel secret and asserts it does not appear in any employee-facing JSON, HTML, application logs, or any database table except the two admin tables.

The demo role header is the access-control boundary. A production deployment must replace it with authenticated identity; the structural boundaries still hold.

## Money and numeric discipline

- All stored monetary values are non-negative `INTEGER` paisa.
- All rates are integer basis points; hours are integer hundredths.
- Conversions use `BigInt` intermediates through `mulDivRound(a, b, den)` (half-up) and `mulDivFloor()` for values that must truncate (advance cap, one-third exemption).
- No float arithmetic, `Math.round()`, or `toFixed()` is used for money. ESLint bans `Math.round` globally and `toFixed()` calls. UI parsing uses string splitting, not float multiplication.

## Dates

Fiscal years and periods store explicit ISO Gregorian dates. There is no Bikram Sambat conversion dependency. The seeded dates are approximate equivalents of the BS months; users can edit period boundaries as data.

## Configuration

No rate is hard-coded in the engine. Policy rows carry SSF employee/employer bps, retirement cap and share denominator, OT multiplier/divisor/hours-per-day, security fund bps, advance recovery cap bps, and a reference to an immutable tax slab set. `resolvePolicyForPeriod()` selects the latest version with `effective_from_seq <= period.seq`. Policies are append-only; the API exposes creation but no update/delete.

## Responsive UI

The web app (`apps/web`) is mobile-first:

- `components/Layout.tsx` switches between a desktop top bar and a right-hand `Drawer` navigation on small screens, with a compact brand and role switcher that fit narrow viewports.
- Shared `components/Card.tsx` and `components/PageHeader.tsx` give pages a consistent card surface and responsive title/action row.
- Tables are wrapped in horizontally scrollable containers (`overflowX="auto"`) with `variant="simple"` and `size="sm"`, so wide payrolls remain usable on phones.
- Filters and action rows use `Stack`/`Flex` with `base`/`md` responsive props instead of fixed widths.
- Money is always rendered through `formatNprPaisa()`, so each amount shows one `NPR` label and one decimal separator.

## Deployment shape

`npm start` runs `scripts/ensure-web-build.mjs` and then the Fastify server. The server registers the JSON API, the printable payslip routes, and `@fastify/static` for `apps/web/dist`, falling back to `index.html` for client-side routes. A single process serves everything on `http://localhost:3000`.
