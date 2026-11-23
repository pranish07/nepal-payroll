import { assertNonNegativeInt } from './money.js';
import type { PayslipResult } from './types.js';

export interface AdminSecretLine {
  id: string;
  label: string;
  amountPaisa: number;
}

export interface AdminCostResult {
  grossPaisa: number;
  employerSsfPaisa: number;
  secretPaisa: number;
  companyCostPaisa: number;
  netPaisa: number;
  paidOutToEmployeePaisa: number;
  secretLines: AdminSecretLine[];
}

export interface AdminCostTotals {
  grossPaisa: number;
  employerSsfPaisa: number;
  netPaisa: number;
}

/**
 * Adds the admin-only component to a completed payslip result. Deliberately a
 * separate function: calculatePayslip() has no secret parameter, so secret pay
 * cannot influence SSF, TDS, or any employee-facing field.
 */
export function computeAdminCost(
  result: PayslipResult,
  secretLines: AdminSecretLine[],
): AdminCostResult {
  return computeAdminCostFromTotals(
    {
      grossPaisa: result.grossPaisa,
      employerSsfPaisa: result.ssfEmployerPaisa,
      netPaisa: result.netPaisa,
    },
    secretLines,
  );
}

/** Same arithmetic, usable from stored totals (for draft cost views). */
export function computeAdminCostFromTotals(
  totals: AdminCostTotals,
  secretLines: AdminSecretLine[],
): AdminCostResult {
  let secretPaisa = 0;
  for (const line of secretLines) {
    assertNonNegativeInt(line.amountPaisa, `secretLines[${line.id}].amountPaisa`);
    secretPaisa += line.amountPaisa;
  }

  return {
    grossPaisa: totals.grossPaisa,
    employerSsfPaisa: totals.employerSsfPaisa,
    secretPaisa,
    companyCostPaisa: totals.grossPaisa + totals.employerSsfPaisa + secretPaisa,
    netPaisa: totals.netPaisa,
    paidOutToEmployeePaisa: totals.netPaisa + secretPaisa,
    secretLines: secretLines.map((line) => ({ ...line })),
  };
}
