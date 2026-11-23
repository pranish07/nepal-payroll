import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

type App = Awaited<ReturnType<typeof buildApp>>;
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const ADMIN = { 'x-role': 'admin' };
const EMPLOYEE = { 'x-role': 'employee' };

const openApps: App[] = [];
const tempDirs: string[] = [];

async function makeApp(
  options: Parameters<typeof buildApp>[0] = {},
): Promise<App> {
  const app = await buildApp({
    dbPath: ':memory:',
    seed: true,
    serveWeb: false,
    logger: false,
    ...options,
  });
  await app.ready();
  openApps.push(app);
  return app;
}

async function call(
  app: App,
  method: Method,
  url: string,
  options: { headers?: Record<string, string>; payload?: unknown } = {},
) {
  return app.inject({
    method,
    url,
    headers: options.headers ?? ADMIN,
    ...(options.payload === undefined ? {} : { payload: options.payload as object }),
  });
}

async function json<T>(app: App, method: Method, url: string, options: Parameters<typeof call>[3] = {}) {
  const response = await call(app, method, url, options);
  return { response, body: response.json() as T };
}

afterEach(async () => {
  while (openApps.length > 0) {
    const app = openApps.pop();
    if (app) await app.close();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

interface RunDtoBody {
  id: string;
  status: 'DRAFT' | 'FINALIZED';
  policyVersion: number;
  finalizedAt: string | null;
  payslips: Array<{
    id: string;
    code: string;
    fullName: string;
    employmentType: 'SSF' | 'NON_SSF';
    grossPaisa: number;
    netPaisa: number;
    tdsPaisa: number;
    advanceRecoveryPaisa: number;
    daysEmployed: number;
    daysInPeriod: number;
  }>;
  totals: {
    employeeCount: number;
    grossPaisa: number;
    netPaisa: number;
    ssfEmployeePaisa: number;
    ssfEmployerPaisa: number;
    advanceRecoveryPaisa: number;
    employerCostPaisa: number;
  };
  warnings: Array<{ code: string; employeeCount: number }>;
}

interface PayslipBody {
  id: string;
  employee: { code: string; bankAccountMasked: string };
  netPaisa: number;
  netInWords: string;
  securityFundPaisa: number;
  advanceBalanceBeforePaisa: number;
  advanceBalanceAfterPaisa: number;
  advanceRecoveryPaisa: number;
  earnings: Array<{ label: string; amountPaisa: number }>;
  deductions: Array<{ label: string; amountPaisa: number }>;
  run: { status: string };
}

interface AdvanceBody {
  id: string;
  principalPaisa: number;
  installmentPaisa: number | null;
  status: 'ACTIVE' | 'SETTLED';
  recoveredPaisa: number;
  outstandingPaisa: number;
}

interface AdminCostBody {
  status: 'DRAFT' | 'FINALIZED';
  rows: Array<{
    code: string;
    employmentType: 'SSF' | 'NON_SSF';
    secretPaisa: number;
    companyCostPaisa: number;
    netPaisa: number;
  }>;
  totals: { secretPaisa: number; companyCostPaisa: number; netPaisa: number };
}

describe('API: access control and reads', () => {
  it('serves health and employee reads to the employee role without leaking admin fields', async () => {
    const app = await makeApp();
    const health = await call(app, 'GET', '/api/health', { headers: EMPLOYEE });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok', database: 'ok', currency: 'NPR' });

    const { body } = await json<Array<Record<string, unknown>>>(app, 'GET', '/api/employees', {
      headers: EMPLOYEE,
    });
    expect(body).toHaveLength(6);
    for (const employee of body) {
      expect(Object.keys(employee).some((key) => key.toLowerCase().includes('secret'))).toBe(false);
    }

    const periods = await json<Array<{ id: string; runStatus: string | null }>>(
      app,
      'GET',
      '/api/periods',
      { headers: EMPLOYEE },
    );
    expect(periods.body).toHaveLength(12);
    expect(periods.body.every((period) => period.runStatus === null)).toBe(true);
  });

  it('rejects every mutation and admin read for the employee role', async () => {
    const app = await makeApp();
    const attempts: Array<[Method, string, unknown?]> = [
      ['POST', '/api/employees', {}],
      ['POST', '/api/periods/p-2083-01/run'],
      ['GET', '/api/admin/employees/11111111-1111-4111-8111-111111111111/secret-components'],
      ['PUT', '/api/admin/employees/11111111-1111-4111-8111-111111111111/secret-components', {}],
      ['POST', '/api/tax-slab-sets', {}],
    ];

    for (const [method, url, payload] of attempts) {
      const response = await call(app, method, url, { headers: EMPLOYEE, payload });
      expect(response.statusCode, `${method} ${url}`).toBe(403);
      expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('rejects an unknown role header with a validation envelope', async () => {
    const app = await makeApp();
    const response = await call(app, 'GET', '/api/employees', {
      headers: { 'x-role': 'owner' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_ROLE' });
  });
});

describe('API: draft calculation and views', () => {
  it('matches the seeded Shrawan draft totals and supports SSF filtering', async () => {
    const app = await makeApp();
    const { response, body } = await json<RunDtoBody>(
      app,
      'POST',
      '/api/periods/p-2083-01/run',
    );
    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('DRAFT');
    expect(body.policyVersion).toBe(1);
    expect(body.payslips).toHaveLength(4);

    const byCode = new Map(body.payslips.map((payslip) => [payslip.code, payslip]));
    expect(byCode.get('EMP-001')?.netPaisa).toBe(8_473_833);
    expect(byCode.get('EMP-002')?.netPaisa).toBe(11_760_000);
    expect(byCode.get('EMP-003')?.netPaisa).toBe(12_283_333);
    expect(byCode.get('EMP-004')?.netPaisa).toBe(970_000);
    expect(byCode.has('EMP-005')).toBe(false);
    expect(byCode.has('EMP-006')).toBe(false);
    expect(body.totals.netPaisa).toBe(33_487_166);
    expect(body.totals.employeeCount).toBe(4);
    expect(body.totals.employerCostPaisa).toBe(
      body.totals.grossPaisa + body.totals.ssfEmployerPaisa,
    );

    const ssf = await json<RunDtoBody>(app, 'GET', `/api/runs/${body.id}/summary?group=SSF`);
    expect(ssf.body.totals.employeeCount).toBe(2);
    const nonSsf = await json<RunDtoBody>(
      app,
      'GET',
      `/api/runs/${body.id}/summary?group=NON_SSF`,
    );
    expect(nonSsf.body.totals.employeeCount).toBe(2);
    expect(
      ssf.body.totals.netPaisa + nonSsf.body.totals.netPaisa,
    ).toBe(body.totals.netPaisa);
  });

  it('renders printable HTML and employee JSON without admin-only data', async () => {
    const app = await makeApp();
    const run = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    const payslipId = run.body.payslips.find((payslip) => payslip.code === 'EMP-001')?.id;
    expect(payslipId).toBeTruthy();

    const payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${payslipId}`, {
      headers: EMPLOYEE,
    });
    expect(payslip.response.statusCode).toBe(200);
    expect(payslip.body.netPaisa).toBe(8_473_833);
    expect(payslip.body.employee.bankAccountMasked).toBe('**** **** 9012');
    expect(payslip.body.netInWords.toLowerCase()).toContain('rupees');

    const html = await call(app, 'GET', `/api/payslips/${payslipId}/html`, {
      headers: EMPLOYEE,
    });
    expect(html.statusCode).toBe(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.body).toContain('Aarav Sharma');
    expect(html.body.toLowerCase()).toContain('payslip');
    expect(html.body.toLowerCase()).not.toContain('secret');
  });

  it('excludes inactive employees and includes a mid-period joiner with prorated days', async () => {
    const app = await makeApp();
    const first = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    expect(first.body.payslips.map((payslip) => payslip.code).sort()).toEqual([
      'EMP-001',
      'EMP-002',
      'EMP-003',
      'EMP-004',
    ]);

    const fourth = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-04/run');
    const newcomer = fourth.body.payslips.find((payslip) => payslip.code === 'EMP-005');
    expect(newcomer).toBeDefined();
    expect(newcomer?.daysEmployed).toBe(15);
    expect(newcomer?.daysInPeriod).toBe(30);
    expect(fourth.body.payslips.some((payslip) => payslip.code === 'EMP-006')).toBe(false);
  });
});

describe('API: secret component isolation', () => {
  it('keeps the sentinel value out of employee responses, HTML, logs, and all non-admin tables', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nepal-payroll-leak-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'leak.db');
    const sentinel = 812_345_671;
    const sentinelNote = 'SENTINEL-NOTE-ZYZZY';
    const logs: string[] = [];

    const app = await makeApp({
      dbPath,
      logger: {
        level: 'info',
        stream: { write: (chunk: string) => logs.push(chunk) },
      } as never,
    });

    const employeeId = '11111111-1111-4111-8111-111111111111';
    const secret = await call(app, 'PUT', `/api/admin/employees/${employeeId}/secret-components`, {
      payload: { periodId: 'p-2083-01', amountPaisa: sentinel, note: sentinelNote },
    });
    expect(secret.statusCode).toBe(200);
    expect(secret.json()).toMatchObject({ amountPaisa: sentinel, note: sentinelNote });

    const draft = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    const finalized = await call(app, 'POST', `/api/runs/${draft.body.id}/finalize`);
    expect(finalized.statusCode).toBe(200);
    const finalizedRun = finalized.json() as RunDtoBody;

    const runView = await call(app, 'GET', `/api/runs/${draft.body.id}`, { headers: EMPLOYEE });
    const summary = await call(app, 'GET', `/api/runs/${draft.body.id}/summary`, {
      headers: EMPLOYEE,
    });
    const payslipBodies: string[] = [];
    for (const payslip of finalizedRun.payslips) {
      const jsonResponse = await call(app, 'GET', `/api/payslips/${payslip.id}`, {
        headers: EMPLOYEE,
      });
      const htmlResponse = await call(app, 'GET', `/api/payslips/${payslip.id}/html`, {
        headers: EMPLOYEE,
      });
      expect(jsonResponse.statusCode).toBe(200);
      expect(htmlResponse.statusCode).toBe(200);
      payslipBodies.push(jsonResponse.body, htmlResponse.body);
    }
    const employees = await call(app, 'GET', '/api/employees', { headers: EMPLOYEE });

    const employeeFacing = [runView.body, summary.body, employees.body, ...payslipBodies].join('\n');
    expect(employeeFacing).not.toContain(String(sentinel));
    expect(employeeFacing).not.toContain(sentinelNote);
    expect(employeeFacing.toLowerCase()).not.toContain('secret');

    expect(logs.join('\n')).not.toContain(String(sentinel));
    expect(logs.join('\n')).not.toContain(sentinelNote);

    const adminView = await call(app, 'GET', `/api/admin/runs/${draft.body.id}/cost-view`);
    const adminBody = adminView.json() as AdminCostBody;
    expect(adminView.statusCode).toBe(200);
    const secretRow = adminBody.rows.find((row) => row.code === 'EMP-001');
    expect(secretRow?.secretPaisa).toBe(sentinel);
    expect(adminBody.totals.secretPaisa).toBeGreaterThanOrEqual(sentinel);

    await app.close();
    openApps.splice(openApps.indexOf(app), 1);

    const raw = new Database(dbPath, { readonly: true });
    try {
      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as Array<{ name: string }>;
      const allowed = new Set(['secret_components', 'payslip_admin_costs']);
      const probes: string[] = [];
      for (const { name } of tables) {
        const rows = raw.prepare(`SELECT * FROM "${name}"`).all();
        const serialized = JSON.stringify(rows);
        if (allowed.has(name)) {
          probes.push(`${name}:${serialized}`);
        } else {
          expect(serialized, `table ${name} must not contain the sentinel`).not.toContain(
            String(sentinel),
          );
          expect(serialized, `table ${name} must not contain the sentinel note`).not.toContain(
            sentinelNote,
          );
        }
      }
      expect(probes.join('\n')).toContain(String(sentinel));
      expect(probes.join('\n')).toContain(sentinelNote);
    } finally {
      raw.close();
    }
  });

  it('shows live secret cost for drafts and frozen snapshots for finalized runs', async () => {
    const app = await makeApp();
    const employeeId = '11111111-1111-4111-8111-111111111111';
    const draft = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    const baselineNet = draft.body.payslips.find((payslip) => payslip.code === 'EMP-001')?.netPaisa;

    const set = await call(app, 'PUT', `/api/admin/employees/${employeeId}/secret-components`, {
      payload: { periodId: 'p-2083-01', amountPaisa: 500_000, note: 'retention' },
    });
    expect(set.statusCode).toBe(200);

    const recalculated = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    expect(recalculated.body.payslips.find((payslip) => payslip.code === 'EMP-001')?.netPaisa).toBe(
      baselineNet,
    );

    const draftCost = await json<AdminCostBody>(
      app,
      'GET',
      `/api/admin/runs/${recalculated.body.id}/cost-view?group=SSF`,
    );
    expect(draftCost.body.status).toBe('DRAFT');
    expect(draftCost.body.rows.find((row) => row.code === 'EMP-001')?.secretPaisa).toBe(500_000);
    expect(draftCost.body.rows.every((row) => row.employmentType === 'SSF')).toBe(true);

    await call(app, 'POST', `/api/runs/${recalculated.body.id}/finalize`);
    const snapshotBefore = await json<AdminCostBody>(
      app,
      'GET',
      `/api/admin/runs/${recalculated.body.id}/cost-view`,
    );

    await call(app, 'PUT', `/api/admin/employees/${employeeId}/secret-components`, {
      payload: { periodId: 'p-2083-01', amountPaisa: 9_999_999, note: 'changed later' },
    });
    const snapshotAfter = await json<AdminCostBody>(
      app,
      'GET',
      `/api/admin/runs/${recalculated.body.id}/cost-view`,
    );
    expect(snapshotAfter.body.rows.find((row) => row.code === 'EMP-001')?.secretPaisa).toBe(
      snapshotBefore.body.rows.find((row) => row.code === 'EMP-001')?.secretPaisa,
    );
    expect(snapshotAfter.body.totals.secretPaisa).toBe(snapshotBefore.body.totals.secretPaisa);

    const employeeAttempt = await call(
      app,
      'GET',
      `/api/admin/runs/${recalculated.body.id}/cost-view`,
      { headers: EMPLOYEE },
    );
    expect(employeeAttempt.statusCode).toBe(403);
  });
});

describe('API: finalization', () => {
  it('is idempotent and never rewrites a finalized run', async () => {
    const app = await makeApp();
    const draft = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    const first = await json<RunDtoBody>(app, 'POST', `/api/runs/${draft.body.id}/finalize`);
    expect(first.body.status).toBe('FINALIZED');
    const finalizedAt = first.body.finalizedAt;

    const patch = await call(
      app,
      'PATCH',
      '/api/employees/11111111-1111-4111-8111-111111111111',
      { payload: { basicPaisa: 99_000_000 } },
    );
    expect(patch.statusCode).toBe(200);

    const second = await json<RunDtoBody>(app, 'POST', `/api/runs/${draft.body.id}/finalize`);
    expect(second.body.status).toBe('FINALIZED');
    expect(second.body.finalizedAt).toBe(finalizedAt);
    expect(second.body.totals.netPaisa).toBe(first.body.totals.netPaisa);

    const recalculate = await call(app, 'POST', '/api/periods/p-2083-01/run');
    expect(recalculate.statusCode).toBe(409);
    expect(recalculate.json()).toMatchObject({ code: 'CONFLICT' });

    const advanceLedger = await json<{ entries: unknown[] }>(app, 'GET', '/api/advances/adv-004/ledger');
    expect(advanceLedger.body.entries).toHaveLength(1);
  });

  it('does not persist advance recoveries while a run is only a draft', async () => {
    const app = await makeApp();
    const draft = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    const before = await json<{ entries: unknown[]; advance: AdvanceBody }>(
      app,
      'GET',
      '/api/advances/adv-004/ledger',
    );
    expect(before.body.entries).toHaveLength(0);
    expect(before.body.advance.recoveredPaisa).toBe(0);

    await call(app, 'POST', `/api/runs/${draft.body.id}/finalize`);
    const after = await json<{ entries: Array<{ amountPaisa: number }>; advance: AdvanceBody }>(
      app,
      'GET',
      '/api/advances/adv-004/ledger',
    );
    expect(after.body.entries).toHaveLength(1);
    expect(after.body.entries[0]?.amountPaisa).toBe(
      draft.body.payslips.find((payslip) => payslip.code === 'EMP-004')?.advanceRecoveryPaisa,
    );
  });
});

describe('API: advances', () => {
  it('caps recovery at the policy limit and settles the advance when fully recovered', async () => {
    const app = await makeApp();
    const advanceId = 'adv-004';
    const base = await json<{ advance: AdvanceBody }>(app, 'GET', `/api/advances/${advanceId}/ledger`);
    expect(base.body.advance.outstandingPaisa).toBe(4_000_000);

    let previousOutstanding = base.body.advance.outstandingPaisa;
    let totalRecovered = 0;

    for (const periodId of ['p-2083-01', 'p-2083-02', 'p-2083-03', 'p-2083-04', 'p-2083-05']) {
      const draft = await json<RunDtoBody>(app, 'POST', `/api/periods/${periodId}/run`);
      const row = draft.body.payslips.find((payslip) => payslip.code === 'EMP-004');
      expect(row).toBeDefined();
      const payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${row?.id}`, {
        headers: EMPLOYEE,
      });
      const cap = Math.floor((payslip.body.netPaisa + payslip.body.advanceRecoveryPaisa) * 0.5);
      expect(payslip.body.advanceRecoveryPaisa).toBeGreaterThan(0);
      expect(payslip.body.advanceRecoveryPaisa).toBeLessThanOrEqual(cap);
      expect(payslip.body.advanceRecoveryPaisa).toBeLessThanOrEqual(previousOutstanding);
      expect(payslip.body.advanceBalanceBeforePaisa).toBe(previousOutstanding);
      expect(payslip.body.advanceBalanceAfterPaisa).toBe(
        previousOutstanding - payslip.body.advanceRecoveryPaisa,
      );
      previousOutstanding = payslip.body.advanceBalanceAfterPaisa;
      totalRecovered += payslip.body.advanceRecoveryPaisa;

      await call(app, 'POST', `/api/runs/${draft.body.id}/finalize`);
      if (previousOutstanding === 0) break;
    }

    const ledger = await json<{ entries: unknown[]; advance: AdvanceBody }>(
      app,
      'GET',
      `/api/advances/${advanceId}/ledger`,
    );
    expect(ledger.body.advance.recoveredPaisa).toBe(totalRecovered);
    expect(ledger.body.advance.outstandingPaisa).toBe(previousOutstanding);
    if (previousOutstanding === 0) {
      expect(ledger.body.advance.status).toBe('SETTLED');
    }
  });

  it('honours a changed installment and a null installment (policy cap)', async () => {
    const app = await makeApp();
    const advanceId = 'adv-004';
    const patched = await call(app, 'PATCH', `/api/advances/${advanceId}`, {
      payload: { installmentPaisa: 100_000 },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as AdvanceBody).installmentPaisa).toBe(100_000);

    const draft = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    const row = draft.body.payslips.find((payslip) => payslip.code === 'EMP-004');
    const payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${row?.id}`, {
      headers: EMPLOYEE,
    });
    expect(payslip.body.advanceRecoveryPaisa).toBe(100_000);

    await call(app, 'PATCH', `/api/advances/${advanceId}`, { payload: { installmentPaisa: null } });
    const recalculated = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    const row2 = recalculated.body.payslips.find((payslip) => payslip.code === 'EMP-004');
    const payslip2 = await json<PayslipBody>(app, 'GET', `/api/payslips/${row2?.id}`, {
      headers: EMPLOYEE,
    });
    expect(payslip2.body.advanceRecoveryPaisa).toBeGreaterThan(100_000);
  });
});

describe('API: effective-dated pay items', () => {
  it('applies allowances and reimbursements only inside their effective windows', async () => {
    const app = await makeApp();
    const employeeId = '33333333-3333-4333-8333-333333333333';

    const added = await call(app, 'POST', `/api/employees/${employeeId}/allowances`, {
      payload: {
        allowanceTypeId: 'at-transport',
        amountPaisa: 250_000,
        taxable: true,
        fromPeriodId: 'p-2083-03',
      },
    });
    expect(added.statusCode).toBe(201);
    const allowanceId = (added.json() as { id: string }).id;

    const p2 = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-02/run');
    const p2Row = p2.body.payslips.find((payslip) => payslip.code === 'EMP-003');
    const p2Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p2Row?.id}`);
    expect(p2Payslip.body.earnings.some((line) => line.label === 'Transport Allowance')).toBe(false);

    const p3 = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-03/run');
    const p3Row = p3.body.payslips.find((payslip) => payslip.code === 'EMP-003');
    const p3Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p3Row?.id}`);
    expect(
      p3Payslip.body.earnings.find((line) => line.label === 'Transport Allowance')?.amountPaisa,
    ).toBe(250_000);

    const stopped = await call(app, 'POST', `/api/employee-allowances/${allowanceId}/stop`, {
      payload: { stopFromPeriodId: 'p-2083-05' },
    });
    expect(stopped.statusCode).toBe(200);

    const p4 = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-04/run');
    const p4Row = p4.body.payslips.find((payslip) => payslip.code === 'EMP-003');
    const p4Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p4Row?.id}`);
    expect(p4Payslip.body.earnings.some((line) => line.label === 'Transport Allowance')).toBe(true);

    const p5 = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-05/run');
    const p5Row = p5.body.payslips.find((payslip) => payslip.code === 'EMP-003');
    const p5Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p5Row?.id}`);
    expect(p5Payslip.body.earnings.some((line) => line.label === 'Transport Allowance')).toBe(false);
  });

  it('supports one-time and recurring reimbursements with an effective stop', async () => {
    const app = await makeApp();
    const employeeId = '22222222-2222-4222-8222-222222222222';

    const oneTime = await call(app, 'POST', `/api/employees/${employeeId}/reimbursements`, {
      payload: {
        kind: 'ONE_TIME',
        label: 'Client visit',
        amountPaisa: 175_000,
        taxable: false,
        periodId: 'p-2083-02',
      },
    });
    expect(oneTime.statusCode).toBe(201);

    const recurring = await call(app, 'POST', `/api/employees/${employeeId}/reimbursements`, {
      payload: {
        kind: 'RECURRING',
        label: 'Internet',
        amountPaisa: 90_000,
        taxable: false,
        fromPeriodId: 'p-2083-02',
      },
    });
    expect(recurring.statusCode).toBe(201);
    const recurringId = (recurring.json() as { id: string }).id;

    const p2 = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-02/run');
    const p2Row = p2.body.payslips.find((payslip) => payslip.code === 'EMP-002');
    const p2Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p2Row?.id}`);
    expect(p2Payslip.body.earnings.find((line) => line.label === 'Client visit')?.amountPaisa).toBe(
      175_000,
    );
    expect(p2Payslip.body.earnings.find((line) => line.label === 'Internet')?.amountPaisa).toBe(
      90_000,
    );

    const p3 = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-03/run');
    const p3Row = p3.body.payslips.find((payslip) => payslip.code === 'EMP-002');
    const p3Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p3Row?.id}`);
    expect(p3Payslip.body.earnings.some((line) => line.label === 'Client visit')).toBe(false);
    expect(p3Payslip.body.earnings.some((line) => line.label === 'Internet')).toBe(true);

    const stop = await call(app, 'POST', `/api/reimbursements/${recurringId}/stop`, {
      payload: { stopFromPeriodId: 'p-2083-04' },
    });
    expect(stop.statusCode).toBe(200);

    const p4 = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-04/run');
    const p4Row = p4.body.payslips.find((payslip) => payslip.code === 'EMP-002');
    const p4Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p4Row?.id}`);
    expect(p4Payslip.body.earnings.some((line) => line.label === 'Internet')).toBe(false);

    const stopOneTime = await call(app, 'POST', `/api/reimbursements/${recurringId}/stop`, {
      payload: { stopFromPeriodId: 'p-2083-05' },
    });
    expect(stopOneTime.statusCode).toBe(409);
  });
});

describe('API: versioned configuration', () => {
  it('applies a new policy version only from its effective period', async () => {
    const app = await makeApp();
    const firstRun = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    expect(firstRun.body.policyVersion).toBe(1);
    const p1Security = firstRun.body.payslips.find((payslip) => payslip.code === 'EMP-001');
    const p1Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p1Security?.id}`);
    expect(p1Payslip.body.securityFundPaisa).toBeGreaterThan(0);

    const current = await json<{
      policy: Record<string, unknown> & { taxSlabSetId: string };
      policies: Array<{ version: number }>;
    }>(app, 'GET', '/api/fiscal-years/fy-2083-84/policy');

    const created = await call(app, 'POST', '/api/fiscal-years/fy-2083-84/policies', {
      payload: {
        effectiveFromSeq: 2,
        ssfEmployeeBps: current.body.policy.ssfEmployeeBps,
        ssfEmployerBps: current.body.policy.ssfEmployerBps,
        retirementCapAnnualPaisa: current.body.policy.retirementCapAnnualPaisa,
        retirementShareDen: current.body.policy.retirementShareDen,
        otMultiplierBps: current.body.policy.otMultiplierBps,
        otDivisorDays: current.body.policy.otDivisorDays,
        otHoursPerDay: current.body.policy.otHoursPerDay,
        securityFundBps: 0,
        advanceMaxRecoveryBps: current.body.policy.advanceMaxRecoveryBps,
        taxSlabSetId: current.body.policy.taxSlabSetId,
      },
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as { version: number }).version).toBe(2);

    const p1Again = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    expect(p1Again.body.policyVersion).toBe(1);
    const p2 = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-02/run');
    expect(p2.body.policyVersion).toBe(2);

    const p2Security = p2.body.payslips.find((payslip) => payslip.code === 'EMP-001');
    const p2Payslip = await json<PayslipBody>(app, 'GET', `/api/payslips/${p2Security?.id}`);
    expect(p2Payslip.body.securityFundPaisa).toBe(0);

    const noUpdateRoute = await call(app, 'PUT', '/api/fiscal-years/fy-2083-84/policies');
    expect(noUpdateRoute.statusCode).toBe(404);
  });

  it('validates tax slab ordering and money inputs', async () => {
    const app = await makeApp();
    const badSlabs = await call(app, 'POST', '/api/tax-slab-sets', {
      payload: {
        fiscalYearId: 'fy-2083-84',
        name: 'Broken slabs',
        slabs: [
          { upperBoundPaisa: 200_000_000, rateBps: 100 },
          { upperBoundPaisa: 100_000_000, rateBps: 200 },
          { upperBoundPaisa: null, rateBps: 300 },
        ],
      },
    });
    expect(badSlabs.statusCode).toBe(400);

    const negativeMoney = await call(app, 'POST', '/api/employees', {
      payload: {
        code: 'EMP-777',
        fullName: 'Bad Money',
        department: 'QA',
        designation: 'Tester',
        employmentType: 'NON_SSF',
        basicPaisa: -1,
        joiningDate: '2026-01-01',
        bankName: 'Bank',
        bankAccountName: 'Bad Money',
        bankAccountNumber: '12345678',
        bankBranch: 'Branch',
      },
    });
    expect(negativeMoney.statusCode).toBe(400);
    expect(negativeMoney.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('API: employee lifecycle and constraints', () => {
  it('creates, updates, and soft-deletes an employee', async () => {
    const app = await makeApp();
    const created = await call(app, 'POST', '/api/employees', {
      payload: {
        code: 'EMP-777',
        fullName: 'Test Person',
        department: 'QA',
        designation: 'Tester',
        employmentType: 'SSF',
        ssfNumber: 'SSF-7777',
        basicPaisa: 7_000_000,
        joiningDate: '2026-07-17',
        bankName: 'Test Bank',
        bankAccountName: 'Test Person',
        bankAccountNumber: '1234567890',
        bankBranch: 'Test Branch',
      },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const updated = await call(app, 'PATCH', `/api/employees/${id}`, {
      payload: { designation: 'Senior Tester', basicPaisa: 7_500_000 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ designation: 'Senior Tester', basicPaisa: 7_500_000 });

    const runBefore = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    expect(runBefore.body.payslips.some((payslip) => payslip.code === 'EMP-777')).toBe(true);

    const deleted = await call(app, 'DELETE', `/api/employees/${id}`);
    expect(deleted.statusCode).toBe(200);
    expect((deleted.json() as { status: string }).status).toBe('INACTIVE');

    const runAfter = await json<RunDtoBody>(app, 'POST', '/api/periods/p-2083-01/run');
    expect(runAfter.body.payslips.some((payslip) => payslip.code === 'EMP-777')).toBe(false);
  });

  it('rejects duplicate codes, missing SSF numbers, and unknown periods', async () => {
    const app = await makeApp();
    const duplicate = await call(app, 'POST', '/api/employees', {
      payload: {
        code: 'EMP-001',
        fullName: 'Duplicate',
        department: 'QA',
        designation: 'Tester',
        employmentType: 'NON_SSF',
        basicPaisa: 1_000_000,
        joiningDate: '2026-01-01',
        bankName: 'Bank',
        bankAccountName: 'Duplicate',
        bankAccountNumber: '12345678',
        bankBranch: 'Branch',
      },
    });
    expect(duplicate.statusCode).toBe(409);

    const missingSsf = await call(app, 'POST', '/api/employees', {
      payload: {
        code: 'EMP-778',
        fullName: 'No SSF',
        department: 'QA',
        designation: 'Tester',
        employmentType: 'SSF',
        basicPaisa: 1_000_000,
        joiningDate: '2026-01-01',
        bankName: 'Bank',
        bankAccountName: 'No SSF',
        bankAccountNumber: '12345678',
        bankBranch: 'Branch',
      },
    });
    expect(missingSsf.statusCode).toBe(400);

    const unknownPeriod = await call(app, 'POST', '/api/periods/nope/run');
    expect(unknownPeriod.statusCode).toBe(404);

    const unknownEmployee = await call(app, 'GET', '/api/employees/nope');
    expect(unknownEmployee.statusCode).toBe(404);
  });

  it('returns a consistent 404 envelope for unknown API routes', async () => {
    const app = await makeApp();
    const response = await call(app, 'GET', '/api/does-not-exist');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND', details: null });
  });
});
