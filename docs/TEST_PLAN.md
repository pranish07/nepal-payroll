# Test plan

Run everything with:

```bash
npm test                 # all suites
npm run coverage         # core coverage with thresholds
npm run typecheck
npm run lint
npm run verify           # clean-clone end-to-end check
```

## 1. Pure core (`packages/core/test`)

| File | Covers |
| --- | --- |
| `vectors.test.ts` | Golden vectors A–G exactly as specified in the brief, including annual tax settlement over 12 months, slab boundaries, one-off taxable items, mid-period joiner, and admin cost separation |
| `invariants.test.ts` | fast-check properties: non-negative net/deductions, gross = sum of earnings, deduction totals, advance cap formula, slab additivity, rounding stability |
| `edge-cases.test.ts` | §6.6 edge cases: zero values, unbounded last slab, invalid slab sets, out-of-range dates, null overtime override, zero installment, negative/out-of-range inputs |
| `money-format-words.test.ts` | Integer paisa rounding (half-up), bps/hour formatting, Nepali-style grouping, amount-in-words |

Coverage thresholds (v8): lines 95%, functions 95%, branches 90%, statements 95% over `packages/core/src/**` (types excluded).

## 2. API integration (`apps/api/test/api.test.ts`)

Each test builds a fresh Fastify app over an in-memory SQLite database, applies migrations, and seeds the demo data, then drives it with `app.inject()`.

- Health, employee/period reads, default employee role, consistent 404 envelopes.
- Role enforcement: every mutation and all admin routes return 403 for `X-Role: employee`; invalid roles return 400.
- Draft calculation: seeded Shrawan totals, exact nets for EMP-001…004, group filters SSF/NON_SSF reconciling to ALL.
- Payslip JSON and printable HTML: content type, masked bank account, amount in words, no admin data.
- Mid-period joining (EMP-005 in period 4) and inactive employee exclusion.
- **Sentinel leak test**: unique secret amount + unique note written through the admin API; draft and finalize; employee JSON/HTML/run views/summary/employee list and captured logs must not contain them; every DB table except `secret_components` and `payslip_admin_costs` must not contain them; admin cost view must show them.
- Admin cost draft projection vs finalized frozen snapshots (secret changed after finalize must not change frozen values).
- Finalization: idempotent, immutable after employee edits, second finalize keeps timestamp and totals, recalculation of finalized period returns 409, exactly one advance recovery row.
- Drafts do not persist recoveries; finalize does.
- Advance lifecycle over multiple periods: cap respected, balances derived from ledger, settlement, changed and null installment behavior.
- Effective-dated allowances (add in period 3, stop from period 5) and reimbursements (one-time vs recurring, stop from period 4).
- Versioned config: new policy applies only from its effective period; policy rows have no update route; invalid slab sets and negative money rejected.
- Employee lifecycle: create, patch, soft delete, duplicate code 409, SSF without number 400, unknown period/employee 404.

## 3. Web (`apps/web`)

- `tsc --noEmit` strict typechecking (including `noUncheckedIndexedAccess`) and a production Vite build gate.
- No component unit tests (ADR-015, documented cut). The web app is a thin client: all decisions and money formatting with tests live in core/format helpers.

## 4. Structural checks

- ESLint `no-restricted-imports` prevents employee-facing payslip modules from importing admin repositories/services.
- ESLint bans `Math.round` globally and `toFixed()` calls (money formatting discipline).
- `npm run samples` asserts the rendered sample HTML contains no secret marker before writing files.

## 5. Clean clone (`scripts/verify-clean-clone.sh`)

Creates a temp dir, clones or copies the repo, runs `npm ci`, lint, typecheck, tests, web build, starts the server, probes health + API + served HTML, measures wall-clock time to first successful start, and prints `CLEAN_CLONE_SECONDS`. Temporary databases and builds are isolated from the working tree.
