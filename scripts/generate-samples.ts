/**
 * Generates committed sample payslips from the seeded demo database.
 *
 * This script uses the same database services and HTML renderer as the live
 * API, so the samples are real output rather than hand-written markup. Run it
 * with `npm run samples`. If Chrome/Edge is available, PDF copies are also
 * written; otherwise only HTML is produced.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDatabase } from '../apps/api/src/db/client.js';
import { applyMigrations } from '../apps/api/src/db/migrate.js';
import { renderPayslipHtml } from '../apps/api/src/payslip/render.js';
import { seedIfEmpty } from '../apps/api/src/seed.js';
import { getEmployeePayslipView } from '../apps/api/src/services/payslip-view.js';
import { calculateDraft, finalizeRun } from '../apps/api/src/services/run-service.js';
import type { RunDto } from '../apps/api/src/types.js';

const outputDir = resolve(process.cwd(), 'samples');
mkdirSync(outputDir, { recursive: true });

const tempDir = mkdtempSync(join(tmpdir(), 'nepal-payroll-samples-'));
const database = createDatabase(join(tempDir, 'samples.db'));
applyMigrations(database.raw);
seedIfEmpty(database);

function findBrowser(): string | null {
  const configured = process.env.CHROME_PATH;
  if (configured && existsSync(configured)) return configured;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const browser = findBrowser();
const generated: Array<{ file: string; title: string; description: string }> = [];

interface SampleSpec {
  periodId: string;
  code: string;
  file: string;
  description: string;
}

const specs: SampleSpec[] = [
  {
    periodId: 'p-2083-01',
    code: 'EMP-001',
    file: 'payslip-emp001-shrawan-2083.html',
    description: 'SSF employee with prorated OT, taxable allowances, reimbursements, and an advance.',
  },
  {
    periodId: 'p-2083-01',
    code: 'EMP-002',
    file: 'payslip-emp002-shrawan-2083.html',
    description: 'Non-SSF employee; no SSF deduction and no employer SSF memo.',
  },
  {
    periodId: 'p-2083-01',
    code: 'EMP-004',
    file: 'payslip-emp004-shrawan-2083.html',
    description: 'Advance recovery limited by the 50% policy cap.',
  },
  {
    periodId: 'p-2083-04',
    code: 'EMP-005',
    file: 'payslip-emp005-kartik-2083.html',
    description: 'Employee who joined mid-period, with prorated basic and days employed.',
  },
];

try {
  const runs = new Map<string, RunDto>();
  for (const periodId of ['p-2083-01', 'p-2083-02', 'p-2083-03', 'p-2083-04']) {
    const draft = calculateDraft(database, periodId);
    runs.set(periodId, finalizeRun(database, draft.id));
  }

  for (const spec of specs) {
    const run = runs.get(spec.periodId);
    if (!run) throw new Error(`Missing finalized run for ${spec.periodId}.`);
    const payslip = run.payslips.find((row) => row.code === spec.code);
    if (!payslip) throw new Error(`No payslip for ${spec.code} in ${spec.periodId}.`);

    const view = getEmployeePayslipView(database, payslip.id);
    const html = renderPayslipHtml(view);
    if (/secret|admin-approved market adjustment/i.test(html)) {
      throw new Error(`Secret component leaked into sample ${spec.file}.`);
    }

    const path = join(outputDir, spec.file);
    writeFileSync(path, html, 'utf8');
    generated.push({
      file: spec.file,
      title: `${view.employee.fullName} — ${view.period.label}`,
      description: spec.description,
    });

    if (browser) {
      const pdfPath = path.replace(/\.html$/, '.pdf');
      try {
        execFileSync(
          browser,
          [
            '--headless',
            '--disable-gpu',
            '--no-sandbox',
            '--no-pdf-header-footer',
            `--print-to-pdf=${pdfPath}`,
            path,
          ],
          { stdio: 'ignore', timeout: 45_000 },
        );
        if (existsSync(pdfPath)) generated.push({ file: pdfPath.slice(outputDir.length + 1), title: `${view.employee.fullName} — ${view.period.label} (PDF)`, description: spec.description });
      } catch {
        // HTML is the committed artifact; PDF is opportunistic.
        console.log(`[samples] PDF generation skipped for ${spec.file}.`);
      }
    }
  }

  const index = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sample payslips</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;color:#222}
li{margin:.6rem 0}a{color:#17675a}small{display:block;color:#666}</style></head>
<body>
<h1>Sample payslips</h1>
<p>Generated from the seeded demo database by <code>npm run samples</code>. Each HTML file is the exact server-rendered, A4-printable payslip returned by <code>/api/payslips/:id/html</code>.</p>
<ul>
${generated
  .map(
    (item) =>
      `<li><a href="${item.file}">${item.title}</a><small>${item.description}</small></li>`,
  )
  .join('\n')}
</ul>
</body>
</html>
`;
  writeFileSync(join(outputDir, 'index.html'), index, 'utf8');
  console.log(`[samples] Wrote ${generated.length} artifacts to samples/.`);
} finally {
  database.raw.close();
  rmSync(tempDir, { recursive: true, force: true });
}
