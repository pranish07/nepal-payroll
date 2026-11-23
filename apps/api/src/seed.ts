import type { AppDatabase } from './db/client.js';
import {
  advanceRecoveries,
  advances,
  allowanceTypes,
  auditLog,
  employeeAllowances,
  employees,
  fiscalYears,
  overtimeEntries,
  payrollPeriods,
  payrollRuns,
  payslipAdminCosts,
  payslips,
  policies,
  reimbursements,
  secretComponents,
  taxSlabSets,
  taxSlabs,
} from './db/schema.js';
import { nowIso } from './util.js';

/**
 * Demo data only. Dates are approximate Gregorian equivalents of the BS months;
 * they are explicit period boundaries, not a Bikram Sambat conversion.
 */
export function seedIfEmpty(database: AppDatabase): boolean {
  const existing = database.db.select({ id: employees.id }).from(employees).limit(1).get();
  if (existing) return false;
  seedDatabase(database);
  return true;
}

export function seedDatabase(database: AppDatabase): void {
  const timestamp = nowIso();

  database.raw.transaction(() => {
    clearDemoData(database);

    database.db
      .insert(fiscalYears)
      .values({
        id: 'fy-2083-84',
        label: '2083/84',
        startDate: '2026-07-17',
        endDate: '2027-07-16',
      })
      .run();

    const periods = [
      ['p-2083-01', 1, 1, 'Shrawan 2083', '2026-07-17', '2026-08-16'],
      ['p-2083-02', 2, 2, 'Bhadra 2083', '2026-08-17', '2026-09-16'],
      ['p-2083-03', 3, 3, 'Ashwin 2083', '2026-09-17', '2026-10-17'],
      ['p-2083-04', 4, 4, 'Kartik 2083', '2026-10-18', '2026-11-16'],
      ['p-2083-05', 5, 5, 'Mangsir 2083', '2026-11-17', '2026-12-16'],
      ['p-2083-06', 6, 6, 'Poush 2083', '2026-12-17', '2027-01-15'],
      ['p-2083-07', 7, 7, 'Magh 2083', '2027-01-16', '2027-02-14'],
      ['p-2083-08', 8, 8, 'Falgun 2083', '2027-02-15', '2027-03-16'],
      ['p-2083-09', 9, 9, 'Chaitra 2083', '2027-03-17', '2027-04-14'],
      ['p-2083-10', 10, 10, 'Baisakh 2084', '2027-04-15', '2027-05-14'],
      ['p-2083-11', 11, 11, 'Jestha 2084', '2027-05-15', '2027-06-14'],
      ['p-2083-12', 12, 12, 'Ashadh 2084', '2027-06-15', '2027-07-16'],
    ] as const;

    for (const [id, index, seq, label, startDate, endDate] of periods) {
      database.db
        .insert(payrollPeriods)
        .values({ id, fiscalYearId: 'fy-2083-84', indexInFy: index, seq, label, startDate, endDate })
        .run();
    }

    database.db
      .insert(taxSlabSets)
      .values({
        id: 'slabs-2083-v1',
        fiscalYearId: 'fy-2083-84',
        name: 'FY 2083/84 statutory slabs',
        createdAt: timestamp,
      })
      .run();

    const slabs = [
      [1, 100_000_000, 100],
      [2, 150_000_000, 1000],
      [3, 250_000_000, 2000],
      [4, 400_000_000, 2700],
      [5, null, 2900],
    ] as const;

    for (const [ordinal, upperBoundPaisa, rateBps] of slabs) {
      database.db
        .insert(taxSlabs)
        .values({
          id: `slab-2083-${ordinal}`,
          slabSetId: 'slabs-2083-v1',
          ordinal,
          upperBoundPaisa,
          rateBps,
        })
        .run();
    }

    database.db
      .insert(policies)
      .values({
        id: 'policy-2083-v1',
        fiscalYearId: 'fy-2083-84',
        version: 1,
        effectiveFromSeq: 1,
        ssfEmployeeBps: 1100,
        ssfEmployerBps: 2000,
        retirementCapAnnualPaisa: 50_000_000,
        retirementShareDen: 3,
        otMultiplierBps: 15_000,
        otDivisorDays: 30,
        otHoursPerDay: 8,
        securityFundBps: 200,
        advanceMaxRecoveryBps: 5000,
        taxSlabSetId: 'slabs-2083-v1',
        createdAt: timestamp,
      })
      .run();

    const allowanceCatalog = [
      ['at-da', 'Dearness Allowance', 1, 1],
      ['at-conveyance', 'Conveyance', 1, 1],
      ['at-transport', 'Transport Allowance', 1, 0],
      ['at-remote', 'Remote Work Allowance', 1, 0],
    ] as const;

    for (const [id, name, defaultTaxable, isSystem] of allowanceCatalog) {
      database.db
        .insert(allowanceTypes)
        .values({ id, name, defaultTaxable, isSystem, createdAt: timestamp })
        .run();
    }

    const employeeRows = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        code: 'EMP-001',
        fullName: 'Aarav Sharma',
        department: 'Engineering',
        designation: 'Senior Engineer',
        employmentType: 'SSF',
        ssfNumber: 'SSF-1001',
        basicPaisa: 8_000_000,
        joiningDate: '2023-05-01',
        status: 'ACTIVE',
        securityFundEnabled: 1,
        bankName: 'Nabil Bank',
        bankAccountName: 'Aarav Sharma',
        bankAccountNumber: '0123456789012',
        bankBranch: 'Pokhara Lakeside',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        code: 'EMP-002',
        fullName: 'Priya Thapa',
        department: 'Finance',
        designation: 'Accountant',
        employmentType: 'NON_SSF',
        ssfNumber: null,
        basicPaisa: 12_000_000,
        joiningDate: '2022-02-15',
        status: 'ACTIVE',
        securityFundEnabled: 1,
        bankName: 'Standard Chartered',
        bankAccountName: 'Priya Thapa',
        bankAccountNumber: '9876543210987',
        bankBranch: 'Kathmandu Durbar Marg',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        code: 'EMP-003',
        fullName: 'Bikash Gurung',
        department: 'Operations',
        designation: 'Operations Officer',
        employmentType: 'SSF',
        ssfNumber: 'SSF-1003',
        basicPaisa: 15_000_000,
        joiningDate: '2021-09-01',
        status: 'ACTIVE',
        securityFundEnabled: 1,
        bankName: 'Nepal Investment Bank',
        bankAccountName: 'Bikash Gurung',
        bankAccountNumber: '5555666677778',
        bankBranch: 'Pokhara Chipledhunga',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        code: 'EMP-004',
        fullName: 'Sita Karki',
        department: 'Sales',
        designation: 'Sales Executive',
        employmentType: 'NON_SSF',
        ssfNumber: null,
        basicPaisa: 2_000_000,
        joiningDate: '2024-01-10',
        status: 'ACTIVE',
        securityFundEnabled: 1,
        bankName: 'Global IME Bank',
        bankAccountName: 'Sita Karki',
        bankAccountNumber: '1111222233334',
        bankBranch: 'Pokhara Prithvi Chowk',
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        code: 'EMP-005',
        fullName: 'Nabin Rai',
        department: 'Engineering',
        designation: 'Engineer',
        employmentType: 'SSF',
        ssfNumber: 'SSF-1005',
        basicPaisa: 6_000_000,
        joiningDate: '2026-11-02',
        status: 'ACTIVE',
        securityFundEnabled: 1,
        bankName: 'Nabil Bank',
        bankAccountName: 'Nabin Rai',
        bankAccountNumber: '4444555566667',
        bankBranch: 'Biratnagar Main',
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        code: 'EMP-006',
        fullName: 'Maya Shrestha',
        department: 'Human Resources',
        designation: 'HR Coordinator',
        employmentType: 'NON_SSF',
        ssfNumber: null,
        basicPaisa: 5_000_000,
        joiningDate: '2020-03-01',
        status: 'INACTIVE',
        securityFundEnabled: 0,
        bankName: 'Nabil Bank',
        bankAccountName: 'Maya Shrestha',
        bankAccountNumber: '7777888899990',
        bankBranch: 'Kathmandu Lazimpat',
      },
    ] as const;

    for (const employee of employeeRows) {
      database.db
        .insert(employees)
        .values({ ...employee, employmentType: employee.employmentType, createdAt: timestamp, updatedAt: timestamp })
        .run();
    }

    const allowances = [
      ['ea-001-da', '11111111-1111-4111-8111-111111111111', 'at-da', 500_000, 1, 'p-2083-01'],
      ['ea-001-conv', '11111111-1111-4111-8111-111111111111', 'at-conveyance', 300_000, 1, 'p-2083-01'],
      ['ea-001-transport', '11111111-1111-4111-8111-111111111111', 'at-transport', 400_000, 1, 'p-2083-01'],
      ['ea-002-conv', '22222222-2222-4222-8222-222222222222', 'at-conveyance', 500_000, 1, 'p-2083-01'],
    ] as const;

    for (const [id, employeeId, allowanceTypeId, amountPaisa, taxable, fromPeriodId] of allowances) {
      database.db
        .insert(employeeAllowances)
        .values({
          id,
          employeeId,
          allowanceTypeId,
          amountPaisa,
          taxable,
          fromPeriodId,
          stopFromPeriodId: null,
          createdAt: timestamp,
        })
        .run();
    }

    database.db
      .insert(reimbursements)
      .values([
        {
          id: 'reimb-001-phone',
          employeeId: '11111111-1111-4111-8111-111111111111',
          label: 'Phone',
          amountPaisa: 150_000,
          kind: 'RECURRING',
          periodId: null,
          fromPeriodId: 'p-2083-01',
          stopFromPeriodId: null,
          taxable: 0,
          createdAt: timestamp,
        },
        {
          id: 'reimb-001-one-time',
          employeeId: '11111111-1111-4111-8111-111111111111',
          label: 'One-time equipment reimbursement',
          amountPaisa: 250_000,
          kind: 'ONE_TIME',
          periodId: 'p-2083-01',
          fromPeriodId: null,
          stopFromPeriodId: null,
          taxable: 0,
          createdAt: timestamp,
        },
      ])
      .run();

    database.db
      .insert(overtimeEntries)
      .values({
        id: 'ot-001-p1',
        employeeId: '11111111-1111-4111-8111-111111111111',
        periodId: 'p-2083-01',
        hoursHundredths: 1000,
        multiplierOverrideBps: null,
        note: 'Shrawan close',
        updatedAt: timestamp,
      })
      .run();

    database.db
      .insert(advances)
      .values([
        {
          id: 'adv-001',
          employeeId: '11111111-1111-4111-8111-111111111111',
          principalPaisa: 2_000_000,
          issuedOn: '2026-07-01',
          installmentPaisa: 500_000,
          status: 'ACTIVE',
          note: 'ADV-001',
          createdAt: timestamp,
        },
        {
          id: 'adv-004',
          employeeId: '44444444-4444-4444-8444-444444444444',
          principalPaisa: 4_000_000,
          issuedOn: '2026-07-01',
          installmentPaisa: 2_500_000,
          status: 'ACTIVE',
          note: 'ADV-004',
          createdAt: timestamp,
        },
      ])
      .run();

    database.db
      .insert(secretComponents)
      .values([
        {
          id: 'secret-001-p1',
          employeeId: '11111111-1111-4111-8111-111111111111',
          periodId: 'p-2083-01',
          amountPaisa: 1_500_000,
          note: 'Admin-approved market adjustment',
          updatedAt: timestamp,
        },
        {
          id: 'secret-002-p1',
          employeeId: '22222222-2222-4222-8222-222222222222',
          periodId: 'p-2083-01',
          amountPaisa: 2_000_000,
          note: 'Admin-approved market adjustment',
          updatedAt: timestamp,
        },
      ])
      .run();
  })();
}

function clearDemoData(database: AppDatabase): void {
  const hasEmployees = database.db.select({ id: employees.id }).from(employees).limit(1).get();
  if (hasEmployees) {
    throw new Error('Refusing to clear a non-empty payroll database.');
  }
  // Models/derived tables are empty in a fresh database, but clear defensively
  // so `seedDatabase` is safe after a partial manual reset.
  database.db.delete(payslipAdminCosts).run();
  database.db.delete(advanceRecoveries).run();
  database.db.delete(payslips).run();
  database.db.delete(payrollRuns).run();
  database.db.delete(secretComponents).run();
  database.db.delete(advances).run();
  database.db.delete(overtimeEntries).run();
  database.db.delete(reimbursements).run();
  database.db.delete(employeeAllowances).run();
  database.db.delete(employees).run();
  database.db.delete(allowanceTypes).run();
  database.db.delete(policies).run();
  database.db.delete(taxSlabs).run();
  database.db.delete(taxSlabSets).run();
  database.db.delete(payrollPeriods).run();
  database.db.delete(fiscalYears).run();
  database.db.delete(auditLog).run();
}

export function countEmployees(database: AppDatabase): number {
  const row = database.raw.prepare('SELECT COUNT(*) AS count FROM employees').get() as {
    count: number;
  };
  return row.count;
}
