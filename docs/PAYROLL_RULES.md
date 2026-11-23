# Payroll rules

All formulas operate on integer **paisa** unless stated otherwise. Rates are basis points (bps): `10_000 bps = 100%`. Overtime hours are hundredths of an hour. All intermediate multiplications/divisions use `BigInt`, with half-up `mulDivRound()` except where `mulDivFloor()` is specified.

## Period and proration

- `daysInPeriod = inclusiveDays(periodStart, periodEnd)`
- `daysEmployed = inclusiveDays(max(joiningDate, periodStart), periodEnd)` (0 if the employee joins after period end, in which case the employee is excluded by the API)
- `prorate(amount) = mulDivRound(amount, daysEmployed, daysInPeriod)`
- Basic, allowances, SSF, and security fund use prorated amounts. **The annual tax projection's fixed monthly base uses full-month amounts**, not prorated ones (golden vector F).

## Earnings

1. **Basic Pay** — `prorate(basicPaisa)`.
2. **Allowances** — each effective-dated allowance contributes `prorate(amountPaisa)` and carries a taxable flag. Taxable allowances add to both `taxableFixedEarned` and `fixedTaxableMonthly`.
3. **Overtime** — if `hoursHundredths > 0`:
   `otPaisa = mulDivRound(basicPaisa × hoursHundredths × multiplierBps, 1, otDivisorDays × otHoursPerDay × 100 × 10_000)`.
   `multiplierBps` defaults to the policy OT multiplier; a per-entry override is allowed.
4. **Reimbursements** — one-time items apply only in their exact period; recurring items follow effective-dating. They are **not prorated**. Taxable recurring reimbursements also increase `fixedTaxableMonthly`.

`gross = sum(earnings)`.
`taxableCash = taxable prorated earnings + overtime + taxable reimbursements`.

## Statutory deductions

- SSF employee = SSF employer = 0 for `NON_SSF`.
- For `SSF`: `ssfEmployee = mulDivRound(basicEarned, ssfEmployeeBps, 10_000)`, `ssfEmployer = mulDivRound(basicEarned, ssfEmployerBps, 10_000)`. Employer SSF is an **employer memo**, never deducted from the employee.
- Security fund = `mulDivRound(basicEarned, securityFundBps, 10_000)` when enabled on the employee, else 0.

## Income tax (TDS)

`remainingPeriods = 13 − indexInFy` (includes the current month).

```text
futurePeriods           = remainingPeriods − 1
projectedTaxableCash    = ytd.taxableCash + taxableCash + futurePeriods × fixedTaxableMonthly
projectedEmployeeSsf    = ytd.employeeSsf + ssfEmployee + futurePeriods × fullMonthEmployeeSsf   (SSF only)
projectedEmployerSsf    = ytd.employerSsf + ssfEmployer + futurePeriods × fullMonthEmployerSsf   (SSF only)
assessable              = projectedTaxableCash + projectedEmployerSsf
ssfTotal                = projectedEmployeeSsf + projectedEmployerSsf
oneThirdCap             = floor(assessable / retirementShareDen)                                   (SSF only)
exemption               = min(ssfTotal, oneThirdCap, retirementCapAnnual)                          (SSF only; 0 otherwise)
taxableIncome           = max(0, assessable − exemption)
annualTax               = slabTax(taxableIncome, slabs)
monthlySettlement       = mulDivRound(annualTax − ytd.tds, 1, remainingPeriods)
formulaTds              = max(0, monthlySettlement)
tds                     = min(formulaTds, max(0, gross − ssfEmployee − securityFund))              (ADR-009 guard)
```

If the guard binds, warning `TDS_LIMITED` is emitted. Golden vectors A–G never trigger it.

`slabTax` applies marginal rates with strictly increasing upper bounds and a final `null` (unbounded) slab; slab sets are validated when created and again before calculation.

## Advances

```text
netBeforeAdvance = gross − ssfEmployee − tds − securityFund
advanceCap       = mulDivFloor(netBeforeAdvance × advanceMaxRecoveryBps, 10_000)
```

Advances are processed in issuance order. For each, `wanted = installment ?? outstanding`, capped by `outstanding`; recovered = `min(wanted, remainingCap)`. The total recovered is a deduction; the ledger entry is written **only at finalization**. An advance is SETTLED when cumulative recoveries reach principal.

## Net and employer cost

```text
totalDeductions = ssfEmployee + tds + securityFund + advanceRecovery
net             = gross − totalDeductions          (never negative)
employerCost    = gross + ssfEmployer              (employee view)
companyCost     = employerCost + secretComponent   (admin view only)
```

The secret component is deliberately absent from the engine. `computeAdminCost()` adds it in the admin-only path.

## Warnings

- `YTD_INCOMPLETE` — an earlier fiscal-year period has no finalized run; tax figures may change.
- `TDS_LIMITED` — withholding was limited to keep net non-negative (ADR-009).

## Golden vectors (all passing)

| Vector | Scenario | Key expected values (paisa unless noted) |
| --- | --- | --- |
| A | SSF, all earnings on, OT, advance | OT 500,000; gross 10,100,000; taxable cash 9,700,000; employee SSF 880,000; employer SSF 1,600,000; security 160,000; taxable income 100,340,000; annual tax 1,034,000; TDS 86,167; net-before-advance 8,973,833; advance cap 4,486,916; recovery 500,000; net **8,473,833**; admin company cost 13,200,000; employee net unchanged |
| B | Non-SSF | Gross 12,500,000; SSF 0; exemption 0; security 240,000; annual tax 6,000,000; TDS 500,000; net **11,760,000**; secret only in admin cost |
| C | SSF exemption cap | Employee SSF 1,650,000; employer 3,000,000; exemption capped at 5,000,000; taxable income 16,600,000; annual tax 9,200,000; TDS 766,667; security 300,000; net **12,283,333**; 12-month settlement totals exactly 9,200,000 |
| D | Advance cap | Security 40,000; TDS 20,000; net-before-advance 1,940,000; cap and recovery 970,000; net **970,000**; balance after 3,030,000 |
| E | One-off taxable item in month 4 | First three months 250,000; month 4 316,667; recurring months alternate 316,666; annual total exactly 3,600,000 |
| F | Mid-period joiner (15/30 days) | Basic 3,000,000; employee SSF 330,000; employer 600,000; security 60,000; full-month projection base 6,000,000; taxable income 6,141,000; annual tax 61,410; TDS 51,175; net **2,558,825** |
| G | Slab boundaries | 10,00,000 → 10,000; 15,00,000 → 60,000; 25,00,000 → 2,60,000; 40,00,000 → 6,65,000; 50,00,000 → 9,55,000 |

## Invariants and properties tested

- `net >= 0`, `gross >= 0`, and every deduction non-negative.
- `gross = sum(earnings)`, `totalDeductions = sum(deductions)`.
- `net = gross − totalDeductions`.
- `advanceCap = floor(netBeforeAdvance × capBps / 10_000)`.
- `advanceRecovery <= min(advanceCap, outstanding)` and `advanceBalanceAfter = before − recovery`.
- TDS never exceeds `gross − employee SSF − security fund`.
- `slabTax(totalIncome, mergedSlabs)` equals the sum of `slabTax()` over the component incomes for arbitrary partitions (property test).
- Money helpers round half-up consistently; formatting uses South Asian grouping (`1,01,000.00`).
