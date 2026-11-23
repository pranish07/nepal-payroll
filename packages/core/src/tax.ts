import { PayrollInputError } from './errors.js';
import { assertNonNegativeInt, mulDivRound } from './money.js';
import type { TaxSlab } from './types.js';

/**
 * Progressive annual tax. Each portion is multiplied by its rate as an exact
 * integer; the single division by 10,000 happens once at the end, with half-up
 * rounding. There is deliberately no per-slab rounding.
 */
export function slabTax(taxableIncomePaisa: number, slabs: TaxSlab[]): number {
  assertNonNegativeInt(taxableIncomePaisa, 'taxableIncomePaisa');
  validateTaxSlabs(slabs);

  let lowerBound = 0n;
  const income = BigInt(taxableIncomePaisa);
  let weightedTax = 0n;

  for (const slab of slabs) {
    const upperBound = slab.upperBoundPaisa === null ? income : BigInt(slab.upperBoundPaisa);
    const portionEnd = upperBound < income ? upperBound : income;
    if (portionEnd > lowerBound) {
      weightedTax += (portionEnd - lowerBound) * BigInt(slab.rateBps);
    }
    lowerBound = portionEnd;
    if (income <= lowerBound) break;
  }

  return mulDivRound(weightedTax, 1n, 10_000n);
}

/**
 * Slabs must be a complete, ordered ladder: every bounded slab has a positive,
 * strictly increasing cumulative upper bound, and exactly the final slab is
 * unbounded (null). Bad configuration fails loudly instead of producing a
 * plausible-looking wrong tax.
 */
export function validateTaxSlabs(slabs: TaxSlab[]): void {
  if (!Array.isArray(slabs) || slabs.length === 0) {
    throw new PayrollInputError('taxSlabs', 'at least one tax slab is required');
  }

  let previousUpperBound = 0;
  for (let index = 0; index < slabs.length; index += 1) {
    const slab = slabs[index];
    if (slab === undefined) {
      throw new PayrollInputError('taxSlabs', `slab ${index + 1} is missing`);
    }
    assertNonNegativeInt(slab.rateBps, `taxSlabs[${index}].rateBps`);
    if (slab.rateBps > 10_000) {
      throw new PayrollInputError(`taxSlabs[${index}].rateBps`, 'must be at most 10,000 bps');
    }

    const isLast = index === slabs.length - 1;
    if (slab.upperBoundPaisa === null) {
      if (!isLast) {
        throw new PayrollInputError(
          `taxSlabs[${index}].upperBoundPaisa`,
          'only the final slab may be unbounded',
        );
      }
      continue;
    }

    assertNonNegativeInt(slab.upperBoundPaisa, `taxSlabs[${index}].upperBoundPaisa`);
    if (slab.upperBoundPaisa <= previousUpperBound) {
      throw new PayrollInputError(
        `taxSlabs[${index}].upperBoundPaisa`,
        'upper bounds must be strictly increasing',
      );
    }
    if (isLast) {
      throw new PayrollInputError(
        'taxSlabs',
        'the final slab must be unbounded (upperBoundPaisa = null)',
      );
    }
    previousUpperBound = slab.upperBoundPaisa;
  }
}
