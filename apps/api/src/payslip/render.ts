import { formatNprPaisa, type PayslipLine } from '@nepal-payroll/core';
import type { EmployeePayslipView } from '../types.js';

const COMPANY = {
  name: 'Himalayan Gears Pvt. Ltd.',
  address: 'Lakeside Marg, Ward 4, Pokhara, Gandaki, Nepal',
  pan: 'PAN 601234567',
  phone: '+977-61-555-0101',
  email: 'payroll@himalayangears.example',
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Server-rendered printable payslip. The input type has no secret field, so
 * this renderer cannot display one even if a caller tried.
 */
export function renderPayslipHtml(view: EmployeePayslipView): string {
  const employmentLabel =
    view.employee.employmentType === 'SSF' ? 'SSF registered' : 'Non-SSF';
  const draftBanner =
    view.run.status === 'DRAFT'
      ? '<div class="draft-banner">DRAFT — this payslip is not finalized and may change.</div>'
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payslip ${escapeHtml(view.employee.code)} — ${escapeHtml(view.period.label)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="sheet">
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
    <span>${escapeHtml(view.period.label)} · ${escapeHtml(view.employee.fullName)}</span>
  </div>

  ${draftBanner}

  <header class="doc-head">
    <div class="company">
      <div class="company-mark">HG</div>
      <div>
        <h1>${escapeHtml(COMPANY.name)}</h1>
        <p>${escapeHtml(COMPANY.address)}</p>
        <p>${escapeHtml(COMPANY.pan)} · ${escapeHtml(COMPANY.phone)}</p>
      </div>
    </div>
    <div class="doc-title">
      <h2>Payslip</h2>
      <p>${escapeHtml(view.period.label)} · ${escapeHtml(view.period.fiscalYearLabel)}</p>
      <p class="muted">Payslip no. ${escapeHtml(view.id.slice(0, 8).toUpperCase())}</p>
    </div>
  </header>

  <section class="meta-grid">
    <div><span class="label">Employee ID</span><span class="value">${escapeHtml(view.employee.code)}</span></div>
    <div><span class="label">Employee name</span><span class="value">${escapeHtml(view.employee.fullName)}</span></div>
    <div><span class="label">Department</span><span class="value">${escapeHtml(view.employee.department)}</span></div>
    <div><span class="label">Designation</span><span class="value">${escapeHtml(view.employee.designation)}</span></div>
    <div><span class="label">Joining date</span><span class="value">${escapeHtml(formatDate(view.employee.joiningDate))}</span></div>
    <div><span class="label">Employment type</span><span class="value">${escapeHtml(employmentLabel)}</span></div>
    <div><span class="label">SSF number</span><span class="value">${escapeHtml(view.employee.ssfNumber ?? '—')}</span></div>
    <div><span class="label">Bank account</span><span class="value">${escapeHtml(view.employee.bankName)} · ${escapeHtml(view.employee.bankAccountMasked)}</span></div>
  </section>

  <section class="period-strip">
    <div><span class="label">Pay period</span><strong>${escapeHtml(view.period.label)}</strong></div>
    <div><span class="label">Gregorian range</span><strong>${escapeHtml(formatDate(view.period.startDate))} – ${escapeHtml(formatDate(view.period.endDate))}</strong></div>
    <div><span class="label">Days employed</span><strong>${view.daysEmployed} of ${view.daysInPeriod}</strong></div>
  </section>

  <section class="table-block">
    <h3>Earnings</h3>
    <table>
      <thead><tr><th>Component</th><th class="amount">Amount (NPR)</th></tr></thead>
      <tbody>
        ${renderRows(view.earnings)}
      </tbody>
      <tfoot><tr><th>Gross pay</th><td class="amount">${formatNprPaisa(view.grossPaisa)}</td></tr></tfoot>
    </table>
  </section>

  <section class="table-block">
    <h3>Deductions</h3>
    <table>
      <thead><tr><th>Component</th><th class="amount">Amount (NPR)</th></tr></thead>
      <tbody>
        ${renderRows(view.deductions, 'No deductions this period.')}
      </tbody>
      <tfoot><tr><th>Total deductions</th><td class="amount">${formatNprPaisa(view.totalDeductionsPaisa)}</td></tr></tfoot>
    </table>
  </section>

  <section class="net-pay">
    <div>
      <span class="net-label">Net pay</span>
      <span class="net-words">${escapeHtml(view.netInWords)}</span>
    </div>
    <div class="net-amount">NPR ${formatNprPaisa(view.netPaisa)}</div>
  </section>

  ${
    view.advanceBalanceBeforePaisa > 0
      ? `<section class="advance-box">
    <h3>Advance balance</h3>
    <div class="advance-grid">
      <div><span class="label">Balance before</span><strong>NPR ${formatNprPaisa(view.advanceBalanceBeforePaisa)}</strong></div>
      <div><span class="label">Recovered this period</span><strong>NPR ${formatNprPaisa(view.advanceRecoveryPaisa)}</strong></div>
      <div><span class="label">Balance after</span><strong>NPR ${formatNprPaisa(view.advanceBalanceAfterPaisa)}</strong></div>
    </div>
  </section>`
      : ''
  }

  ${
    view.employerMemo.length > 0
      ? `<section class="employer-memo">
    ${view.employerMemo
      .map(
        (line) =>
          `<p><strong>${escapeHtml(line.label)}:</strong> NPR ${formatNprPaisa(line.amountPaisa)} — employer contribution, not deducted from the employee.</p>`,
      )
      .join('')}
  </section>`
      : ''
  }

  ${
    view.warnings.length > 0
      ? `<section class="warnings">
    <h3>Notes</h3>
    <ul>${view.warnings.map((warning) => `<li>${escapeHtml(warning.message)}</li>`).join('')}</ul>
  </section>`
      : ''
  }

  <section class="ytd">
    <h3>Year-to-date (including this payslip)</h3>
    <table class="compact">
      <tbody>
        <tr><th>Gross pay</th><td class="amount">${formatNprPaisa(view.ytd.grossPaisa)}</td>
            <th>Taxable cash</th><td class="amount">${formatNprPaisa(view.ytd.taxableCashPaisa)}</td></tr>
        <tr><th>SSF (employee)</th><td class="amount">${formatNprPaisa(view.ytd.ssfEmployeePaisa)}</td>
            <th>TDS</th><td class="amount">${formatNprPaisa(view.ytd.tdsPaisa)}</td></tr>
        <tr><th>Employer SSF</th><td class="amount">${formatNprPaisa(view.ytd.ssfEmployerPaisa)}</td>
            <th>Net paid</th><td class="amount">${formatNprPaisa(view.ytd.netPaisa)}</td></tr>
      </tbody>
    </table>
  </section>

  <footer class="doc-foot">
    <p>This is a computer-generated payslip and does not require a signature.</p>
    <p>${escapeHtml(COMPANY.name)} · ${escapeHtml(COMPANY.email)} · Generated ${escapeHtml(formatTimestamp(view.generatedAt))}</p>
  </footer>
</main>
</body>
</html>`;
}

function renderRows(lines: PayslipLine[], emptyMessage = 'No earnings this period.'): string {
  if (lines.length === 0) {
    return `<tr><td class="muted">${escapeHtml(emptyMessage)}</td><td class="amount">0.00</td></tr>`;
  }
  return lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.label)}${
          line.detail ? `<span class="detail">${escapeHtml(line.detail)}</span>` : ''
        }</td>
        <td class="amount">${formatNprPaisa(line.amountPaisa)}</td>
      </tr>`,
    )
    .join('');
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1] ?? ''} ${year}`;
}

function formatTimestamp(iso: string): string {
  return iso.replace('T', ' ').slice(0, 19) + ' UTC';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STYLES = `
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #eef2f6;
    color: #1a202c;
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 11px;
    line-height: 1.45;
    padding: 24px;
  }
  .sheet {
    background: #ffffff;
    max-width: 190mm;
    margin: 0 auto;
    padding: 26px 30px 22px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  }
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
    color: #4a5568;
    font-size: 11px;
  }
  .toolbar button {
    background: #0f4c5c;
    color: #fff;
    border: 0;
    border-radius: 4px;
    padding: 8px 14px;
    font-size: 12px;
    cursor: pointer;
  }
  .draft-banner {
    border: 1px solid #d69e2e;
    background: #fefcbf;
    color: #744210;
    padding: 8px 12px;
    font-weight: 600;
    text-align: center;
    margin-bottom: 14px;
    letter-spacing: 0.02em;
  }
  .doc-head {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 2px solid #0f4c5c;
    padding-bottom: 14px;
    margin-bottom: 16px;
  }
  .company { display: flex; gap: 12px; align-items: flex-start; }
  .company-mark {
    width: 42px; height: 42px; border-radius: 6px;
    background: #0f4c5c; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 15px; letter-spacing: 0.04em;
  }
  .company h1 { margin: 0 0 3px; font-size: 17px; letter-spacing: 0.01em; }
  .company p { margin: 0; color: #4a5568; font-size: 10px; }
  .doc-title { text-align: right; }
  .doc-title h2 {
    margin: 0 0 4px;
    font-size: 19px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: #0f4c5c;
  }
  .doc-title p { margin: 0; font-size: 10.5px; }
  .muted { color: #718096; }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px 22px;
    margin-bottom: 14px;
  }
  .meta-grid > div, .period-strip > div, .advance-grid > div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    border-bottom: 1px dotted #e2e8f0;
    padding-bottom: 4px;
  }
  .label { color: #718096; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .value { font-weight: 600; text-align: right; }
  .period-strip {
    display: grid;
    grid-template-columns: 1fr 1.4fr 0.8fr;
    gap: 16px;
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    padding: 10px 12px;
    margin-bottom: 18px;
  }
  .period-strip > div { border-bottom: 0; padding-bottom: 0; flex-direction: column; gap: 2px; }
  .period-strip strong { font-size: 12px; }
  .table-block { margin-bottom: 14px; }
  h3 {
    margin: 0 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #0f4c5c;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 9px; vertical-align: top; }
  thead th {
    background: #f7fafc;
    text-align: left;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #4a5568;
  }
  tfoot th, tfoot td { background: #f7fafc; font-weight: 700; }
  .amount { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .detail { display: block; color: #718096; font-size: 9.5px; margin-top: 1px; }
  .net-pay {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    background: #0f4c5c;
    color: #fff;
    padding: 12px 16px;
    margin: 18px 0;
  }
  .net-label { display: block; text-transform: uppercase; letter-spacing: 0.12em; font-size: 10px; opacity: 0.85; }
  .net-words { display: block; margin-top: 3px; font-size: 11px; max-width: 120mm; }
  .net-amount { font-size: 22px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .advance-box { border: 1px solid #e2e8f0; padding: 10px 12px; margin-bottom: 14px; }
  .advance-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 16px; }
  .advance-grid > div { flex-direction: column; gap: 2px; }
  .employer-memo {
    border-left: 3px solid #a0aec0;
    background: #f7fafc;
    padding: 8px 12px;
    margin-bottom: 14px;
    color: #4a5568;
  }
  .employer-memo p { margin: 2px 0; }
  .warnings { background: #fffaf0; border: 1px solid #f6e05e; padding: 8px 12px; margin-bottom: 14px; }
  .warnings ul { margin: 0; padding-left: 18px; }
  .ytd table.compact th { width: 24%; text-align: left; font-weight: 500; background: #fff; border: 0; border-bottom: 1px dotted #e2e8f0; color: #4a5568; }
  .ytd table.compact td { border: 0; border-bottom: 1px dotted #e2e8f0; }
  .doc-foot {
    border-top: 1px solid #e2e8f0;
    margin-top: 18px;
    padding-top: 8px;
    color: #718096;
    font-size: 9.5px;
    text-align: center;
  }
  .doc-foot p { margin: 2px 0; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; max-width: none; padding: 0; }
    .no-print { display: none !important; }
    tr, .net-pay, .advance-box, .employer-memo { break-inside: avoid; }
  }
`;
