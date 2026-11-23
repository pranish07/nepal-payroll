import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import { badRequest, parseBody } from '../errors.js';
import { writeAudit } from '../repositories/audit.js';
import {
  createAdvance,
  getAdvanceLedger,
  listAdvances,
  updateAdvanceInstallment,
} from '../repositories/advances.js';
import {
  createEmployee,
  deactivateEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
} from '../repositories/employees.js';
import {
  createAllowance,
  createAllowanceType,
  createReimbursement,
  listAllowanceTypes,
  listAllowances,
  listOvertimeForEmployee,
  listReimbursements,
  stopAllowance,
  stopReimbursement,
  upsertOvertime,
} from '../repositories/pay-items.js';
import { getPeriodOrThrow } from '../repositories/policy.js';
import { listPayslipsForEmployee } from '../repositories/runs.js';
import { requireAdmin } from '../roles.js';
import {
  advancePatchSchema,
  advanceSchema,
  allowanceSchema,
  allowanceTypeSchema,
  createEmployeeSchema,
  employeeQuerySchema,
  overtimeSchema,
  reimbursementSchema,
  stopSchema,
  updateEmployeeSchema,
} from '../schemas.js';

type IdParams = { id: string };
type EmployeePeriodParams = { employeeId: string; periodId: string };

export function registerEmployeeRoutes(app: FastifyInstance, database: AppDatabase): void {
  app.get('/api/employees', async (request) => {
    const query = parseBody(employeeQuerySchema, request.query);
    return listEmployees(database, query);
  });

  app.post('/api/employees', { preHandler: requireAdmin }, async (request, reply) => {
    const body = parseBody(createEmployeeSchema, request.body);
    const employee = createEmployee(database, body);
    writeAudit(database, {
      actorRole: request.role,
      action: 'EMPLOYEE_CREATED',
      entityType: 'employee',
      entityId: employee.id,
    });
    return reply.code(201).send(employee);
  });

  app.get<{ Params: IdParams }>('/api/employees/:id', async (request) => {
    return getEmployee(database, request.params.id);
  });

  app.patch<{ Params: IdParams }>(
    '/api/employees/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const current = getEmployee(database, request.params.id);
      const body = parseBody(updateEmployeeSchema, request.body);
      const mergedType = body.employmentType ?? current.employmentType;
      const mergedSsfNumber = body.ssfNumber ?? current.ssfNumber;
      if (mergedType === 'SSF' && !mergedSsfNumber) {
        throw badRequest('An SSF employee needs a (dummy) SSF number.', {
          field: 'ssfNumber',
        });
      }
      if (mergedType === 'NON_SSF' && body.employmentType === 'NON_SSF' && !body.ssfNumber) {
        body.ssfNumber = null;
      }
      const employee = updateEmployee(database, request.params.id, body);
      writeAudit(database, {
        actorRole: request.role,
        action: 'EMPLOYEE_UPDATED',
        entityType: 'employee',
        entityId: employee.id,
      });
      return employee;
    },
  );

  app.delete<{ Params: IdParams }>(
    '/api/employees/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const employee = deactivateEmployee(database, request.params.id);
      writeAudit(database, {
        actorRole: request.role,
        action: 'EMPLOYEE_DEACTIVATED',
        entityType: 'employee',
        entityId: employee.id,
      });
      return employee;
    },
  );

  app.get('/api/allowance-types', async () => listAllowanceTypes(database));

  app.post(
    '/api/allowance-types',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const body = parseBody(allowanceTypeSchema, request.body);
      return reply.code(201).send(createAllowanceType(database, body));
    },
  );

  app.get<{ Params: IdParams }>('/api/employees/:id/allowances', async (request) => {
    getEmployee(database, request.params.id);
    return listAllowances(database, request.params.id);
  });

  app.post<{ Params: IdParams }>(
    '/api/employees/:id/allowances',
    { preHandler: requireAdmin },
    async (request, reply) => {
      getEmployee(database, request.params.id);
      const body = parseBody(allowanceSchema, request.body);
      const type = listAllowanceTypes(database).find(
        (item) => item.id === body.allowanceTypeId,
      );
      if (!type) throw badRequest('allowanceTypeId does not identify an allowance type.');
      const assignment = createAllowance(database, request.params.id, {
        allowanceTypeId: body.allowanceTypeId,
        amountPaisa: body.amountPaisa,
        taxable: body.taxable ?? type.defaultTaxable,
        fromPeriodId: body.fromPeriodId,
      });
      return reply.code(201).send(assignment);
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/employee-allowances/:id/stop',
    { preHandler: requireAdmin },
    async (request) => {
      const body = parseBody(stopSchema, request.body);
      return stopAllowance(database, request.params.id, body.stopFromPeriodId);
    },
  );

  app.get<{ Params: IdParams }>('/api/employees/:id/reimbursements', async (request) => {
    getEmployee(database, request.params.id);
    return listReimbursements(database, request.params.id);
  });

  app.post<{ Params: IdParams }>(
    '/api/employees/:id/reimbursements',
    { preHandler: requireAdmin },
    async (request, reply) => {
      getEmployee(database, request.params.id);
      const body = parseBody(reimbursementSchema, request.body);
      const reimbursement = createReimbursement(
        database,
        request.params.id,
        body.kind === 'ONE_TIME'
          ? {
              kind: 'ONE_TIME',
              label: body.label,
              amountPaisa: body.amountPaisa,
              taxable: body.taxable ?? false,
              periodId: body.periodId,
            }
          : {
              kind: 'RECURRING',
              label: body.label,
              amountPaisa: body.amountPaisa,
              taxable: body.taxable ?? false,
              fromPeriodId: body.fromPeriodId,
            },
      );
      return reply.code(201).send(reimbursement);
    },
  );

  app.post<{ Params: IdParams }>(
    '/api/reimbursements/:id/stop',
    { preHandler: requireAdmin },
    async (request) => {
      const body = parseBody(stopSchema, request.body);
      return stopReimbursement(database, request.params.id, body.stopFromPeriodId);
    },
  );

  app.get<{ Params: IdParams }>('/api/employees/:id/overtime', async (request) => {
    getEmployee(database, request.params.id);
    return listOvertimeForEmployee(database, request.params.id);
  });

  app.put<{ Params: EmployeePeriodParams }>(
    '/api/periods/:periodId/overtime/:employeeId',
    { preHandler: requireAdmin },
    async (request) => {
      getPeriodOrThrow(database, request.params.periodId);
      getEmployee(database, request.params.employeeId);
      const body = parseBody(overtimeSchema, request.body);
      return upsertOvertime(database, request.params.employeeId, request.params.periodId, {
        hoursHundredths: body.hoursHundredths,
        multiplierOverrideBps: body.multiplierOverrideBps ?? null,
        note: body.note ?? null,
      });
    },
  );

  app.get<{ Params: IdParams }>('/api/employees/:id/advances', async (request) => {
    getEmployee(database, request.params.id);
    return listAdvances(database, request.params.id);
  });

  app.post<{ Params: IdParams }>(
    '/api/employees/:id/advances',
    { preHandler: requireAdmin },
    async (request, reply) => {
      getEmployee(database, request.params.id);
      const body = parseBody(advanceSchema, request.body);
      return reply.code(201).send(createAdvance(database, request.params.id, body));
    },
  );

  app.patch<{ Params: IdParams }>(
    '/api/advances/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const body = parseBody(advancePatchSchema, request.body);
      return updateAdvanceInstallment(database, request.params.id, body.installmentPaisa);
    },
  );

  app.get<{ Params: IdParams }>('/api/advances/:id/ledger', async (request) => {
    return getAdvanceLedger(database, request.params.id);
  });

  app.get<{ Params: IdParams }>('/api/employees/:id/payslips', async (request) => {
    getEmployee(database, request.params.id);
    return listPayslipsForEmployee(database, request.params.id);
  });
}
