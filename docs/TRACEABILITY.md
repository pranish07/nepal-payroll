# Traceability

| Brief section | Implementation |
| --- | --- |
| 1. Clean clone `npm install && npm start` | root `package.json`, `scripts/ensure-web-build.mjs`, `apps/api/src/app.ts`, `scripts/verify-clean-clone.sh` |
| 2. Stack | `apps/web` (React/Vite/Router/Query/Chakra), `apps/api` (Fastify/zod/Drizzle/better-sqlite3), `packages/core` |
| 3. Money/rates/hours | `packages/core/src/money.ts`, ADR-001, lint rules in `eslint.config.js` |
| 4. Engine (§6 formulas) | `packages/core/src/engine.ts`, `tax.ts`, `date.ts`, `admin.ts` |
| 5. Golden vectors A–G | `packages/core/test/vectors.test.ts`, `docs/PAYROLL_RULES.md` |
| 6. Invariants/edge cases | `packages/core/test/invariants.test.ts`, `edge-cases.test.ts` |
| 7. Config from FY tables | `apps/api/src/repositories/policy.ts`, `migrations/0001_init.sql`, ADR-005 |
| 8. Employee + pay items | `apps/api/src/routes/employees.ts`, `repositories/employees.ts`, `pay-items.ts` |
| 9. Runs, drafts, finalize | `apps/api/src/services/run-service.ts`, `repositories/runs.ts`, ADR-007 |
| 10. Advances | `apps/api/src/repositories/advances.ts`, `docs/PAYROLL_RULES.md`, ADR-008 |
| 11. Secret isolation | `repositories/admin.ts`, `services/admin-cost-service.ts`, `routes/payslips.ts`, `payslip/render.ts`, sentinel test, ADR-006 |
| 12. Payslip HTML/PDF | `apps/api/src/payslip/render.ts`, `scripts/generate-samples.ts`, samples/, ADR-014 |
| 13. Web UI | `apps/web/src/pages/*`, role switcher in `components/Layout.tsx` |
| 14. Tests/docs/CI | `apps/api/test/api.test.ts`, `docs/*`, `.github/workflows/ci.yml` |
| 15. Final report | root `README.md` assumptions + this file; final response summary |
