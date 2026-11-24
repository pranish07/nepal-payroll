import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO date (YYYY-MM-DD).');
const money = z.number().int('Must be an integer number of paisa.').min(0);
const positiveMoney = z.number().int('Must be an integer number of paisa.').positive();
const bps = z.number().int().min(0).max(10_000);

const employeeFields = {
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Use uppercase letters, digits, and dashes.'),
  fullName: z.string().trim().min(1).max(120),
  department: z.string().trim().min(1).max(80),
  designation: z.string().trim().min(1).max(80),
  employmentType: z.enum(['SSF', 'NON_SSF']),
  ssfNumber: z.string().trim().max(40).nullable().optional(),
  basicPaisa: money,
  joiningDate: isoDate,
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  securityFundEnabled: z.boolean().optional(),
  bankName: z.string().trim().min(1).max(80),
  bankAccountName: z.string().trim().min(1).max(120),
  bankAccountNumber: z.string().trim().min(4).max(40),
  bankBranch: z.string().trim().min(1).max(80),
};

export const createEmployeeSchema = z.object(employeeFields);

export const updateEmployeeSchema = z.object(employeeFields).partial();

export const employeeQuerySchema = z.object({
  type: z.enum(['SSF', 'NON_SSF']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  q: z.string().trim().max(80).optional(),
});

export const allowanceTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  defaultTaxable: z.boolean(),
});

export const allowanceSchema = z.object({
  allowanceTypeId: z.string().min(1),
  amountPaisa: money,
  taxable: z.boolean().optional(),
  fromPeriodId: z.string().min(1),
});

export const stopSchema = z.object({
  stopFromPeriodId: z.string().min(1),
});

export const reimbursementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ONE_TIME'),
    label: z.string().trim().min(1).max(80),
    amountPaisa: money,
    taxable: z.boolean().default(false),
    periodId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('RECURRING'),
    label: z.string().trim().min(1).max(80),
    amountPaisa: money,
    taxable: z.boolean().default(false),
    fromPeriodId: z.string().min(1),
  }),
]);

export const overtimeSchema = z.object({
  hoursHundredths: z.number().int().min(0).max(100_000),
  multiplierOverrideBps: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

export const advanceSchema = z.object({
  principalPaisa: positiveMoney,
  issuedOn: isoDate,
  installmentPaisa: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(120).nullable().optional(),
});

export const advancePatchSchema = z.object({
  installmentPaisa: z.number().int().positive().nullable(),
});

export const taxSlabSetSchema = z.object({
  fiscalYearId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  slabs: z
    .array(
      z.object({
        upperBoundPaisa: z.number().int().positive().nullable(),
        rateBps: bps,
      }),
    )
    .min(1),
});

export const policySchema = z.object({
  effectiveFromSeq: z.number().int().positive().optional(),
  ssfEmployeeBps: bps,
  ssfEmployerBps: bps,
  retirementCapAnnualPaisa: money,
  retirementShareDen: z.number().int().positive(),
  otMultiplierBps: z.number().int().positive(),
  otDivisorDays: z.number().int().positive(),
  otHoursPerDay: z.number().int().positive(),
  securityFundBps: bps,
  advanceMaxRecoveryBps: bps,
  taxSlabSetId: z.string().min(1),
});

export const secretComponentSchema = z.object({
  periodId: z.string().min(1),
  amountPaisa: money,
  note: z.string().trim().max(200).nullable().optional(),
});

export const groupQuerySchema = z.object({
  group: z.enum(['ALL', 'SSF', 'NON_SSF']).default('ALL'),
});

export const taxSlabSetQuerySchema = z.object({
  fiscalYearId: z.string().min(1),
});

export type CreateEmployeeBody = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeSchema>;
export type ReimbursementBody = z.infer<typeof reimbursementSchema>;
export type PolicyBody = z.infer<typeof policySchema>;
