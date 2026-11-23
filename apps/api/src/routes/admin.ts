import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import { parseBody } from '../errors.js';
import { getEmployee } from '../repositories/employees.js';
import { listSecretComponents, setSecretComponent } from '../repositories/admin.js';
import { writeAudit } from '../repositories/audit.js';
import { getPeriodOrThrow } from '../repositories/policy.js';
import { requireAdmin } from '../roles.js';
import { groupQuerySchema, secretComponentSchema } from '../schemas.js';
import { getAdminCostView } from '../services/admin-cost-service.js';

type IdParams = { id: string };

/**
 * Every route in this module requires X-Role: admin. Employee-facing code never
 * imports the admin repository or this service.
 */
export function registerAdminRoutes(app: FastifyInstance, database: AppDatabase): void {
  app.get<{ Params: IdParams }>(
    '/api/admin/employees/:id/secret-components',
    { preHandler: requireAdmin },
    async (request) => {
      getEmployee(database, request.params.id);
      return listSecretComponents(database, request.params.id);
    },
  );

  app.put<{ Params: IdParams }>(
    '/api/admin/employees/:id/secret-components',
    { preHandler: requireAdmin },
    async (request) => {
      getEmployee(database, request.params.id);
      const body = parseBody(secretComponentSchema, request.body);
      getPeriodOrThrow(database, body.periodId);
      const component = setSecretComponent(
        database,
        request.params.id,
        body.periodId,
        body.amountPaisa,
        body.note ?? null,
      );
      writeAudit(database, {
        actorRole: request.role,
        action: 'SECRET_COMPONENT_SET',
        entityType: 'employee',
        entityId: request.params.id,
        details: { periodId: body.periodId },
      });
      return component;
    },
  );

  app.get<{ Params: IdParams }>(
    '/api/admin/runs/:id/cost-view',
    { preHandler: requireAdmin },
    async (request) => {
      const query = parseBody(groupQuerySchema, request.query);
      return getAdminCostView(database, request.params.id, query.group ?? 'ALL');
    },
  );
}
