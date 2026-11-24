# Nepal Mini Payroll

A small, correct Nepal payroll system: a pure TypeScript calculation engine, a Fastify + SQLite API, a React web UI, server-rendered printable payslips, and a **structurally isolated admin-only secret component**.

Money is integer **paisa**. Rates are integer **basis points**. Overtime hours are integer **hundredths of an hour**. BigInt intermediates are used for every multiplication/division, with a single half-up `mulDivRound()` primitive.

## Quick start

Requires Node.js 20+ (`.nvmrc` pins 22; the project is also verified on newer Node).

```bash
npm install
npm start
```

Then open **http://localhost:3000**. `npm start`:

1. builds the web app if `apps/web/dist` is missing or stale,
2. auto-applies committed SQL migrations,
3. seeds the FY 2083/84 demo dataset if the database is empty,
4. serves the API and the built UI from one Fastify process.

The database is written to `data/payroll.db` by default. Override with `DB_PATH=:memory:` or another path; override the port with `PORT=...`.

A committed `.npmrc` sets `ignore-scripts=true` (ADR-017): `better-sqlite3@13` ships prebuilt binaries in its tarball, and npm 11 otherwise tries a `node-gyp` rebuild on machines without a C++ toolchain. No dependency here needs a lifecycle script.

### Try it

```bash
# Health
curl http://localhost:3000/api/health

# Seed data: 6 employees, 12 monthly periods, policy v1
curl -H 'X-Role: admin' http://localhost:3000/api/employees
curl -H 'X-Role: admin' http://localhost:3000/api/periods

# Calculate a draft run, then finalize it
curl -X POST -H 'X-Role: admin' http://localhost:3000/api/periods/p-2083-01/run
curl -X POST -H 'X-Role: admin' http://localhost:3000/api/runs/<RUN_ID>/finalize

# Employee-facing payslip JSON and A4-printable HTML (no secret data)
curl http://localhost:3000/api/payslips/<PAYSLIP_ID>
curl http://localhost:3000/api/payslips/<PAYSLIP_ID>/html

# Admin-only cost view (403 without X-Role: admin)
curl -H 'X-Role: admin' http://localhost:3000/api/admin/runs/<RUN_ID>/cost-view
```

Open `samples/index.html` for committed example payslips (HTML and, where Chrome/Edge is available, PDF).

## Demo walkthrough

1. Switch the header role selector to **Admin**.
2. Open an employee, add a dynamic allowance on **Pay items**, and record an advance on **Advances**.
3. On the **Admin: secret** tab, add a secret component for a period that has no run or a draft run. Finalized periods are disabled and labelled "(finalized)".
4. Go to **Payroll runs**, calculate a draft for a period, then finalize it.
5. Open a payslip, use the **SSF / Non-SSF** filter on the run view, check the **Admin cost view**, then switch back to **Employee** and confirm the secret is gone from every employee-facing surface.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Build web if needed, migrate + seed, serve API and UI on port 3000 |
| `npm run dev` | API watch mode + Vite dev server on 5173 (proxies `/api` to 3000) |
| `npm test` | All Vitest suites (core engine + API integration) |
| `npm run coverage` | Coverage with 95/95/90/95 thresholds on `packages/core/src` |
| `npm run typecheck` | `tsc --noEmit` for core, API and web |
| `npm run lint` | ESLint across the monorepo |
| `npm run build` | Production build of the web app only |
| `npm run samples` | Regenerate committed sample payslips from the seed data |
| `npm run verify` | Clean-clone verification in a temporary directory (see below) |

## Troubleshooting

- **Schema changed after pulling an older checkout.** There are no deployed databases, so the committed migration is edited in place rather than layered. Delete the old database before starting: remove `data/payroll.db` (and any `data/payroll.db-wal` / `data/payroll.db-shm` siblings) and run `npm start` again. The app recreates the schema and reseeds the demo data.

## Sample payslips

`npm run samples` regenerates these from the seed data. Each HTML file is the exact server-rendered, A4-printable payslip; PDF copies are added when Chrome or Edge is available.

| File | Employee | Type |
| --- | --- | --- |
| `samples/payslip-emp001-shrawan-2083.html` | Aarav Sharma (EMP-001) | SSF, with overtime, allowances, reimbursements, and an advance |
| `samples/payslip-emp002-shrawan-2083.html` | Priya Thapa (EMP-002) | Non-SSF, no SSF deduction or employer memo |
| `samples/payslip-emp004-shrawan-2083.html` | Sita Karki (EMP-004) | Non-SSF, advance recovery limited by the 50% cap |
| `samples/payslip-emp005-kartik-2083.html` | Nabin Rai (EMP-005) | SSF, joined mid-period with prorated basic and days employed |

`samples/index.html` links all generated artifacts. No sample contains the secret component.

## Architecture at a glance

```text
packages/core/          pure payroll engine (no I/O, no secret parameter)
apps/api/               Fastify routes -> services -> repositories -> SQLite
apps/api/migrations/    committed SQL schema
apps/api/src/payslip/   server-rendered A4 HTML (employee-facing only)
apps/web/               React + Vite + Chakra UI + React Router + TanStack Query (responsive, mobile drawer nav)
scripts/                sample generation, web build check, clean-clone check
docs/                   architecture, decisions, rules, data model, test plan
```

Key boundaries:

- `calculatePayslip(input, policy)` is pure. It receives policy and YTD as arguments and has **no secret parameter**.
- Secret reads/writes live only in `apps/api/src/repositories/admin.ts` and the admin service/routes. ESLint forbids employee-facing payslip modules from importing them.
- A draft run is recomputable and disposable. Finalization recomputes all payslips, writes admin cost snapshots and advance recoveries in **one transaction**, and is idempotent. Finalized runs reject recalculation and reject secret-component writes.
- All configuration (SSF rates, slabs, OT, security fund, advance cap, retirement cap) comes from versioned fiscal-year policy tables.

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PAYROLL_RULES.md](docs/PAYROLL_RULES.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/DECISIONS.md](docs/DECISIONS.md).

## Roles and the demo auth model

The header `X-Role: admin | employee` selects the role (default `employee`). Every mutating route requires `admin`; the admin cost and secret-component routes are admin-only. This is a **demo authorization mechanism, not production authentication** (ADR-011). The web UI has a role switcher in the header so the isolation can be exercised without a login system.

## Assumptions

Each choice below is recorded as an ADR in [docs/DECISIONS.md](docs/DECISIONS.md).

- **Web app, not React Native** (ADR-018). The payslip is print/PDF-first and the browser keeps setup to one command.
- **Approximate Gregorian period dates** (ADR-010). The 12 periods use explicit approximate dates; period boundaries are stored data, so a Bikram Sambat conversion can replace them without touching the engine.
- **`X-Role` header as the auth boundary** (ADR-011). Suitable for the demo; a real deployment must replace it with verified sessions or tokens.
- **TDS non-negative guard** (ADR-009). Withheld tax is capped at `gross − employee SSF − security fund`, emitting a `TDS_LIMITED` warning for pathological prorated months.
- **Cumulative projected-annual TDS** (ADR-019). Each month projects the full-year liability from YTD, the current month, and remaining full months, then settles the difference over the remaining periods.
- **SSF-linked tax exemption model** (ADR-020). Employer SSF counts in assessable income; the exemption is `min(employee + employer SSF, one-third of assessable income, NPR 5,00,000 annual cap)`; non-SSF employees receive none. This is an assumption modeled on the retirement-fund deduction and should be verified against the current Finance Act.
- **Overtime rate from basic pay** (ADR-021). Hourly rate is basic ÷ policy divisor days (30) ÷ hours per day (8), times a 1.5× default multiplier; per-entry multiplier overrides are allowed.
- **Reimbursement taxability defaults to non-taxable** (ADR-022). A per-item taxable flag moves an item into taxable cash and the tax projection.
- **Joining-month proration by inclusive days** (ADR-023). Basic, allowances, SSF, and security fund are prorated; overtime and reimbursements are not; the tax projection uses full-month fixed amounts.
- **Security fund defaults to 2% of basic** (ADR-024). It is a configurable placeholder, enabled per employee, not tax-deductible, and separate from SSF.
- **Secret component is per employee per period and frozen at finalization** (ADR-025). It is visible only in the admin cost view, excluded from SSF and TDS, and cannot be set after a period is finalized. Excluding genuine remuneration from SSF and tax may conflict with statutory requirements and is flagged for legal review.
- **Advance recovery cap defaults to 50% of net before advance** (ADR-008). The cap, installment, and outstanding balance all constrain each recovery.
- **SSF base is basic pay only** (see [docs/PAYROLL_RULES.md](docs/PAYROLL_RULES.md); basic pay is a first-class employee field per ADR-013). Allowances, overtime, and reimbursements do not increase SSF.
- **Finalized runs are immutable** (ADR-026). There is no unfinalize endpoint; corrections would be void-and-reissue or adjustment lines.

Other notable choices: core/API run directly from TypeScript with `tsx` (ADR-003); Dearness and Conveyance are seeded non-deletable system allowance types (ADR-013); employees are soft-deleted (ADR-012); payslip HTML is server-rendered and PDFs are produced opportunistically with headless Chrome (ADR-014).

## What I'd do with more time

- Real authentication and per-employee ownership checks, replacing the `X-Role` header.
- A Bikram Sambat calendar library and official period dates instead of approximate Gregorian boundaries.
- Void-and-reissue runs and adjustment lines so a mistake discovered after finalization can be corrected without touching history.
- Effective-dated recurring secret components, so a standing arrangement does not need to be re-entered every period.
- Component tests and a Playwright smoke test for the web app, covering the role switch, filters, and secret visibility.
- PostgreSQL and a real migration tool for production, replacing SQLite plus the in-place initial migration.
- Background jobs and email distribution of payslips.
- Bank-file export for salary transfers.
- Leave/attendance and gratuity/bonus modules.
- Code-splitting the web bundle and measuring the production payload.
- A formal review of the tax and SSF rules against the current Finance Act with an accountant, especially the exemption model in ADR-020.

## Limitations

- No email/SMS distribution, no bank-file export, no leave/attendance module, no multi-company support, no gratuity/bonus engine.
- No PDF library is bundled; PDF samples are generated only if Chrome/Edge is present at `CHROME_PATH` or a standard install path.
- The web app has typechecking and a production build but no component unit tests; correctness is concentrated in engine and API tests (ADR-015).
- The demo DB uses SQLite WAL in a single process; it is not a multi-writer production setup.
- Secret components must be entered before a period is finalized.
- No correction path after finalization.

## Verification

```bash
npm run verify
```

The script clones the repo (or copies the working tree if there is no origin) into a fresh temp directory, runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm start`, probes the API and web HTML, checks documented clean-clone wall time, and prints an artifact summary.

Measured from a fresh clone on Windows with Node 25.1.0: **about two minutes** including `npm ci`, lint, typecheck, all tests, web build, and live HTTP/API/payslip probes. The exact value varies by machine; the script prints `CLEAN_CLONE_SECONDS` on every run. Other Node versions and operating systems were not tested locally; the CI matrix covers Node 20 and 22 on Ubuntu and Node 22 on Windows.
