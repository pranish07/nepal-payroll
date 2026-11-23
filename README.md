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

## Architecture at a glance

```text
packages/core/          pure payroll engine (no I/O, no secret parameter)
apps/api/               Fastify routes -> services -> repositories -> SQLite
apps/api/migrations/    committed SQL schema
apps/api/src/payslip/   server-rendered A4 HTML (employee-facing only)
apps/web/               React + Vite + Chakra UI + React Router + TanStack Query
scripts/                sample generation, web build check, clean-clone check
docs/                   architecture, decisions, rules, data model, test plan
```

Key boundaries:

- `calculatePayslip(input, policy)` is pure. It receives policy and YTD as arguments and has **no secret parameter**.
- Secret reads/writes live only in `apps/api/src/repositories/admin.ts` and the admin service/routes. ESLint forbids employee-facing payslip modules from importing them.
- A draft run is recomputable and disposable. Finalization recomputes all payslips, writes admin cost snapshots and advance recoveries in **one transaction**, and is idempotent. Finalized runs reject recalculation.
- All configuration (SSF rates, slabs, OT, security fund, advance cap, retirement cap) comes from versioned fiscal-year policy tables.

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PAYROLL_RULES.md](docs/PAYROLL_RULES.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/DECISIONS.md](docs/DECISIONS.md).

## Roles and the demo auth model

The header `X-Role: admin | employee` selects the role (default `employee`). Every mutating route requires `admin`; the admin cost and secret-component routes are admin-only. This is a **demo authorization mechanism, not production authentication** (ADR-011). The web UI has a role switcher in the header so the isolation can be exercised without a login system.

## Assumptions and deviations

These were ambiguous in the brief; choices are recorded as ADRs in [docs/DECISIONS.md](docs/DECISIONS.md) and surfaced here:

1. **Approximate Gregorian period dates** (ADR-010). The 12 fiscal-year periods use explicit approximate dates, not a Bikram Sambat calendar library. Period boundaries are stored data, so a real BS conversion can be swapped in without touching the engine.
2. **`X-Role` header as the auth boundary** (ADR-011). Suitable for a demo; a real deployment must replace it with verified sessions/tokens. The structural secret isolation remains valid either way.
3. **TDS non-negative guard** (ADR-009). A deviation from a literal formula-only implementation: withheld tax is capped at `gross − employee SSF − security fund`, emitting a `TDS_LIMITED` warning. It never binds for the golden vectors or normally finalized data, but guarantees the "net is never negative" invariant for pathological prorated months.

Other notable choices: core/API are run directly from TypeScript with `tsx` (only the web app has a build step, ADR-003); basic pay is a first-class employee field with Dearness/Conveyance as seeded non-deletable system allowance types (ADR-013); employees are soft-deleted (ADR-012); payslip HTML is server-rendered and PDFs are produced opportunistically with headless Chrome (ADR-014).

## Cuts and known limitations

- No email/SMS distribution, no bank-file export, no leave/attendance module, no multi-company support, no gratuity/bonus engine.
- No PDF library is bundled; PDF samples are generated only if Chrome/Edge is present at `CHROME_PATH` or a standard install path.
- The web app has typechecking and a production build but no component unit tests; correctness is concentrated in engine and API tests (ADR-015).
- The demo DB uses SQLite WAL in a single process; it is not a multi-writer production setup.

## Verification

```bash
npm run verify
```

The script clones the repo (or copies the working tree if there is no origin) into a fresh temp directory, runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm start`, probes the API and web HTML, checks documented clean-clone wall time, and prints an artifact summary.

Measured clean-clone time on this machine (Windows, Node 25.1.0, including `npm ci`, lint, typecheck, all tests, web build, and a live HTTP probe): **101 seconds**. The script prints the exact `CLEAN_CLONE_SECONDS` value on every run.
