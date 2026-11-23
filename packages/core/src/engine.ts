import { assertIsoDate, daysInclusive, maxIsoDate } from './date.js';
import { PayrollInputError } from './errors.js';
import { formatBpsPercent, formatHoursHundredths } from './format.js';
import {
  assertNonNegativeInt,
  assertPositiveInt,
  assertRateBps,
  mulDivFloor,
  mulDivRound,
} from './money.js';
import { slabTax, validateTaxSlabs } from './tax.js';
import type {
  PayslipInput,
  PayslipLine,
  PayslipResult,
  PayslipWarning,
  PayrollPolicy,
  TaxProjection,
} from './types.js';

/**
 * Calculates one employee's payslip for one period.
 *
 * Pure by construction: no clock, no randomness, no database. Policy and YTD
 * values are arguments. There is intentionally no `secret` parameter; the
 * admin-only component is added later by computeAdminCost().
 */
export function calculatePayslip(input: PayslipInput, policy: PayrollPolicy): PayslipResult {
  validateInput(input);
  validatePolicy(policy);

  const warnings: PayslipWarning[] = [];
  if (input.ytdIncomplete) {
    warnings.push({
      code: 'YTD_INCOMPLETE',
      message:
        'One or more earlier periods in this fiscal year have no finalized payroll run. ' +
        'Year-to-date tax figures may change after those periods are finalized.',
    });
  }

  const daysInPeriod = daysInclusive(input.periodStart, input.periodEnd);
  const employedFrom = maxIsoDate(input.joiningDate, input.periodStart);
  const daysEmployed = daysInclusive(employedFrom, input.periodEnd);
  const isProrated = daysEmployed < daysInPeriod;
  const prorationDetail = isProrated ? `${daysEmployed} of ${daysInPeriod} days` : undefined;

  const basicEarned = prorate(input.basicPaisa, daysEmployed, daysInPeriod);
  const earnings: PayslipLine[] = [
    {
      kind: 'EARNING',
      code: 'BASIC',
      label: 'Basic Pay',
      amountPaisa: basicEarned,
      taxable: true,
      ...(prorationDetail === undefined ? {} : { detail: `Prorated: ${prorationDetail}` }),
    },
  ];

  let taxableFixedEarned = basicEarned;
  let fixedTaxableMonthly = input.basicPaisa;

  for (const allowance of input.allowances) {
    const earned = prorate(allowance.amountPaisa, daysEmployed, daysInPeriod);
    if (earned > 0) {
      earnings.push({
        kind: 'EARNING',
        code: `ALLOWANCE:${allowance.id}`,
        label: allowance.label,
        amountPaisa: earned,
        taxable: allowance.taxable,
        ...(prorationDetail === undefined ? {} : { detail: `Prorated: ${prorationDetail}` }),
      });
    }
    if (allowance.taxable) {
      taxableFixedEarned += earned;
      fixedTaxableMonthly += allowance.amountPaisa;
    }
  }

  const overtime = calculateOvertime(input, policy);
  if (overtime.hoursHundredths > 0) {
    earnings.push({
      kind: 'EARNING',
      code: 'OVERTIME',
      label: 'Overtime',
      amountPaisa: overtime.amountPaisa,
      taxable: true,
      detail: `${formatHoursHundredths(overtime.hoursHundredths)} hours @ ${formatBpsPercent(
        overtime.multiplierBps,
      )}`,
    });
  }

  let taxableReimbursements = 0;
  for (const reimbursement of input.reimbursements) {
    if (reimbursement.amountPaisa > 0) {
      earnings.push({
        kind: 'EARNING',
        code: `REIMBURSEMENT:${reimbursement.id}`,
        label: reimbursement.label,
        amountPaisa: reimbursement.amountPaisa,
        taxable: reimbursement.taxable,
        detail: reimbursement.recurring ? 'Recurring reimbursement' : 'One-time reimbursement',
      });
    }
    if (reimbursement.taxable) {
      taxableReimbursements += reimbursement.amountPaisa;
      if (reimbursement.recurring) {
        fixedTaxableMonthly += reimbursement.amountPaisa;
      }
    }
  }

  const grossPaisa = sumLines(earnings);
  const taxableCashPaisa = taxableFixedEarned + overtime.amountPaisa + taxableReimbursements;

  const isSsf = input.employmentType === 'SSF';
  const ssfEmployeePaisa = isSsf
    ? mulDivRound(basicEarned, policy.ssfEmployeeBps, 10_000)
    : 0;
  const ssfEmployerPaisa = isSsf ? mulDivRound(basicEarned, policy.ssfEmployerBps, 10_000) : 0;
  const fullMonthEmployeeSsfPaisa = isSsf
    ? mulDivRound(input.basicPaisa, policy.ssfEmployeeBps, 10_000)
    : 0;
  const fullMonthEmployerSsfPaisa = isSsf
    ? mulDivRound(input.basicPaisa, policy.ssfEmployerBps, 10_000)
    : 0;

  const securityFundPaisa = input.securityFundEnabled
    ? mulDivRound(basicEarned, policy.securityFundBps, 10_000)
    : 0;

  const projection = projectTax({
    input,
    policy,
    taxableCashPaisa,
    fixedTaxableMonthly,
    ssfEmployeePaisa,
    ssfEmployerPaisa,
    fullMonthEmployeeSsfPaisa,
    fullMonthEmployerSsfPaisa,
  });

  // The formula above is authoritative. This guard only makes the explicit
  // "net pay can never be negative" invariant hold for pathological prorated
  // months: tax withheld may not exceed what is left after SSF and security.
  // In a normal, sequentially finalized year it never binds.
  const maximumWithholding = Math.max(0, grossPaisa - ssfEmployeePaisa - securityFundPaisa);
  const tdsPaisa = Math.min(projection.tdsPaisa, maximumWithholding);
  if (tdsPaisa < projection.tdsPaisa) {
    warnings.push({
      code: 'TDS_LIMITED',
      message:
        'Income tax withheld was limited so that net pay cannot be negative. ' +
        'The shortfall is recovered in a later period.',
    });
  }

  const deductions: PayslipLine[] = [];
  if (ssfEmployeePaisa > 0) {
    deductions.push({
      kind: 'DEDUCTION',
      code: 'SSF_EMPLOYEE',
      label: `Social Security Fund (Employee ${formatBpsPercent(policy.ssfEmployeeBps)})`,
      amountPaisa: ssfEmployeePaisa,
    });
  }
  if (tdsPaisa > 0) {
    deductions.push({
      kind: 'DEDUCTION',
      code: 'TDS',
      label: 'Income Tax (TDS)',
      amountPaisa: tdsPaisa,
    });
  }
  if (securityFundPaisa > 0) {
    deductions.push({
      kind: 'DEDUCTION',
      code: 'SECURITY_FUND',
      label: `Security Fund (${formatBpsPercent(policy.securityFundBps)})`,
      amountPaisa: securityFundPaisa,
    });
  }

  const netBeforeAdvancePaisa =
    grossPaisa - ssfEmployeePaisa - tdsPaisa - securityFundPaisa;
  const advanceCapPaisa = mulDivFloor(
    netBeforeAdvancePaisa,
    policy.advanceMaxRecoveryBps,
    10_000,
  );
  const advanceAllocations = allocateAdvanceRecovery(input.advances, advanceCapPaisa);
  for (const allocation of advanceAllocations) {
    deductions.push({
      kind: 'DEDUCTION',
      code: `ADVANCE_RECOVERY:${allocation.advanceId}`,
      label: `Advance Recovery — ${allocation.label}`,
      amountPaisa: allocation.amountPaisa,
    });
  }
  const advanceRecoveryPaisa = advanceAllocations.reduce(
    (total, allocation) => total + allocation.amountPaisa,
    0,
  );
  const totalDeductionsPaisa =
    ssfEmployeePaisa + tdsPaisa + securityFundPaisa + advanceRecoveryPaisa;

  const advanceBalanceBeforePaisa = input.advances.reduce(
    (total, advance) => total + advance.outstandingPaisa,
    0,
  );
  const netPaisa = grossPaisa - totalDeductionsPaisa;

  const employerMemo: PayslipLine[] = [];
  if (ssfEmployerPaisa > 0) {
    employerMemo.push({
      kind: 'EMPLOYER_MEMO',
      code: 'SSF_EMPLOYER',
      label: `Employer SSF Contribution (${formatBpsPercent(
        policy.ssfEmployerBps,
      )}) — not deducted`,
      amountPaisa: ssfEmployerPaisa,
    });
  }

  return {
    employeeId: input.employeeId,
    employmentType: input.employmentType,
    indexInFy: input.indexInFy,
    daysEmployed,
    daysInPeriod,
    basicProratedPaisa: basicEarned,
    fullMonthBasicPaisa: input.basicPaisa,
    overtimePaisa: overtime.amountPaisa,
    overtimeHoursHundredths: overtime.hoursHundredths,
    overtimeMultiplierBps: overtime.multiplierBps,
    grossPaisa,
    taxableCashPaisa,
    fixedTaxableMonthlyPaisa: fixedTaxableMonthly,
    ssfEmployeePaisa,
    ssfEmployerPaisa,
    fullMonthEmployeeSsfPaisa,
    fullMonthEmployerSsfPaisa,
    securityFundPaisa,
    tdsPaisa,
    advanceRecoveryPaisa,
    totalDeductionsPaisa,
    netPaisa,
    netBeforeAdvancePaisa,
    advanceCapPaisa,
    advanceBalanceBeforePaisa,
    advanceBalanceAfterPaisa: advanceBalanceBeforePaisa - advanceRecoveryPaisa,
    advanceRecoveries: advanceAllocations,
    tax: projection.projection,
    ytd: { ...input.ytd },
    lines: [...earnings, ...deductions, ...employerMemo],
    warnings,
  };
}

function prorate(amountPaisa: number, daysEmployed: number, daysInPeriod: number): number {
  return mulDivRound(amountPaisa, daysEmployed, daysInPeriod);
}

function calculateOvertime(
  input: PayslipInput,
  policy: PayrollPolicy,
): { amountPaisa: number; hoursHundredths: number; multiplierBps: number } {
  const hoursHundredths = input.overtime?.hoursHundredths ?? 0;
  const multiplierBps = input.overtime?.multiplierBps ?? policy.otMultiplierBps;
  if (hoursHundredths === 0) return { amountPaisa: 0, hoursHundredths, multiplierBps };

  const denominator = BigInt(policy.otDivisorDays * policy.otHoursPerDay * 100 * 10_000);
  const numerator =
    BigInt(input.basicPaisa) * BigInt(hoursHundredths) * BigInt(multiplierBps);
  return {
    amountPaisa: mulDivRound(numerator, 1n, denominator),
    hoursHundredths,
    multiplierBps,
  };
}

function projectTax(args: {
  input: PayslipInput;
  policy: PayrollPolicy;
  taxableCashPaisa: number;
  fixedTaxableMonthly: number;
  ssfEmployeePaisa: number;
  ssfEmployerPaisa: number;
  fullMonthEmployeeSsfPaisa: number;
  fullMonthEmployerSsfPaisa: number;
}): { projection: TaxProjection; tdsPaisa: number } {
  const {
    input,
    policy,
    taxableCashPaisa,
    fixedTaxableMonthly,
    ssfEmployeePaisa,
    ssfEmployerPaisa,
    fullMonthEmployeeSsfPaisa,
    fullMonthEmployerSsfPaisa,
  } = args;

  const remainingPeriods = 13 - input.indexInFy;
  const futurePeriods = remainingPeriods - 1;
  const projectedTaxableCashPaisa =
    input.ytd.taxableCashPaisa + taxableCashPaisa + futurePeriods * fixedTaxableMonthly;

  const isSsf = input.employmentType === 'SSF';
  const projectedEmployeeSsfPaisa = isSsf
    ? input.ytd.ssfEmployeePaisa +
      ssfEmployeePaisa +
      futurePeriods * fullMonthEmployeeSsfPaisa
    : 0;
  const projectedEmployerSsfPaisa = isSsf
    ? input.ytd.ssfEmployerPaisa +
      ssfEmployerPaisa +
      futurePeriods * fullMonthEmployerSsfPaisa
    : 0;

  const assessablePaisa = projectedTaxableCashPaisa + projectedEmployerSsfPaisa;
  const ssfTotal = projectedEmployeeSsfPaisa + projectedEmployerSsfPaisa;
  const oneThirdCap =
    isSsf && policy.retirementShareDen > 0
      ? Number(BigInt(assessablePaisa) / BigInt(policy.retirementShareDen))
      : 0;
  const exemptionPaisa = isSsf
    ? Math.min(ssfTotal, oneThirdCap, policy.retirementCapAnnualPaisa)
    : 0;
  const taxableIncomePaisa = Math.max(0, assessablePaisa - exemptionPaisa);
  const annualTaxPaisa = slabTax(taxableIncomePaisa, policy.taxSlabs);
  const settlement = mulDivRound(annualTaxPaisa - input.ytd.tdsPaisa, 1, remainingPeriods);
  const tdsPaisa = Math.max(0, settlement);

  return {
    projection: {
      remainingPeriods,
      projectedTaxableCashPaisa,
      projectedEmployeeSsfPaisa,
      projectedEmployerSsfPaisa,
      assessablePaisa,
      exemptionPaisa,
      taxableIncomePaisa,
      annualTaxPaisa,
    },
    tdsPaisa,
  };
}

function allocateAdvanceRecovery(
  advances: PayslipInput['advances'],
  capPaisa: number,
): PayslipResult['advanceRecoveries'] {
  let remaining = capPaisa;
  const allocations: PayslipResult['advanceRecoveries'] = [];

  // Callers pass advances oldest-first. Recovery order follows this order.
  for (const advance of advances) {
    if (remaining <= 0) break;
    const wanted =
      advance.installmentPaisa === null
        ? advance.outstandingPaisa
        : Math.min(advance.installmentPaisa, advance.outstandingPaisa);
    const recovered = Math.min(wanted, remaining);
    if (recovered > 0) {
      allocations.push({
        advanceId: advance.id,
        label: advance.label,
        amountPaisa: recovered,
      });
      remaining -= recovered;
    }
  }
  return allocations;
}

function sumLines(lines: PayslipLine[]): number {
  return lines.reduce((total, line) => total + line.amountPaisa, 0);
}

function validateInput(input: PayslipInput): void {
  if (input.employmentType !== 'SSF' && input.employmentType !== 'NON_SSF') {
    throw new PayrollInputError('employmentType', 'must be SSF or NON_SSF');
  }
  assertPositiveInt(input.indexInFy, 'indexInFy');
  if (input.indexInFy > 12) {
    throw new PayrollInputError('indexInFy', 'must be between 1 and 12');
  }
  assertIsoDate(input.periodStart, 'periodStart');
  assertIsoDate(input.periodEnd, 'periodEnd');
  assertIsoDate(input.joiningDate, 'joiningDate');
  daysInclusive(input.periodStart, input.periodEnd);
  if (input.joiningDate > input.periodEnd) {
    throw new PayrollInputError('joiningDate', 'employee joins after this period ends');
  }
  assertNonNegativeInt(input.basicPaisa, 'basicPaisa');

  for (const allowance of input.allowances) {
    assertNonNegativeInt(allowance.amountPaisa, `allowances[${allowance.id}].amountPaisa`);
  }
  for (const reimbursement of input.reimbursements) {
    assertNonNegativeInt(
      reimbursement.amountPaisa,
      `reimbursements[${reimbursement.id}].amountPaisa`,
    );
  }
  if (input.overtime !== null) {
    assertNonNegativeInt(input.overtime.hoursHundredths, 'overtime.hoursHundredths');
    if (input.overtime.multiplierBps !== null) {
      assertPositiveInt(input.overtime.multiplierBps, 'overtime.multiplierBps');
    }
  }
  for (const advance of input.advances) {
    assertNonNegativeInt(advance.outstandingPaisa, `advances[${advance.id}].outstandingPaisa`);
    if (advance.installmentPaisa !== null) {
      assertNonNegativeInt(advance.installmentPaisa, `advances[${advance.id}].installmentPaisa`);
    }
  }
  assertNonNegativeInt(input.ytd.taxableCashPaisa, 'ytd.taxableCashPaisa');
  assertNonNegativeInt(input.ytd.ssfEmployeePaisa, 'ytd.ssfEmployeePaisa');
  assertNonNegativeInt(input.ytd.ssfEmployerPaisa, 'ytd.ssfEmployerPaisa');
  assertNonNegativeInt(input.ytd.tdsPaisa, 'ytd.tdsPaisa');
}

function validatePolicy(policy: PayrollPolicy): void {
  assertRateBps(policy.ssfEmployeeBps, 'policy.ssfEmployeeBps');
  assertRateBps(policy.ssfEmployerBps, 'policy.ssfEmployerBps');
  assertRateBps(policy.securityFundBps, 'policy.securityFundBps');
  assertPositiveInt(policy.otMultiplierBps, 'policy.otMultiplierBps');
  assertRateBps(policy.advanceMaxRecoveryBps, 'policy.advanceMaxRecoveryBps');
  assertNonNegativeInt(policy.retirementCapAnnualPaisa, 'policy.retirementCapAnnualPaisa');
  assertPositiveInt(policy.retirementShareDen, 'policy.retirementShareDen');
  assertPositiveInt(policy.otDivisorDays, 'policy.otDivisorDays');
  assertPositiveInt(policy.otHoursPerDay, 'policy.otHoursPerDay');
  validateTaxSlabs(policy.taxSlabs);
}
