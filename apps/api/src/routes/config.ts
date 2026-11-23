import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import { parseBody } from '../errors.js';
import {
  createPolicy,
  createTaxSlabSet,
  getFiscalYearOrThrow,
  getLatestPolicy,
  listFiscalYears,
  listPolicies,
  listTaxSlabSets,
} from '../repositories/policy.js';
import { requireAdmin } from '../roles.js';
import { policySchema, taxSlabSetQuerySchema, taxSlabSetSchema } from '../schemas.js';

type IdParams = { id: string };

export function registerConfigRoutes(app: FastifyInstance, database: AppDatabase): void {
  app.get('/api/fiscal-years', async () => listFiscalYears(database));

  app.get<{ Params: IdParams }>('/api/fiscal-years/:id/policy', async (request) => {
    const fiscalYear = getFiscalYearOrThrow(database, request.params.id);
    return {
      fiscalYear,
      policy: getLatestPolicy(database, fiscalYear.id),
      policies: listPolicies(database, fiscalYear.id),
      taxSlabSets: listTaxSlabSets(database, fiscalYear.id),
    };
  });

  app.post<{ Params: IdParams }>(
    '/api/fiscal-years/:id/policies',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const body = parseBody(policySchema, request.body);
      const policy = createPolicy(database, request.params.id, body);
      return reply.code(201).send(policy);
    },
  );

  app.get('/api/tax-slab-sets', async (request) => {
    const query = parseBody(taxSlabSetQuerySchema, request.query);
    return listTaxSlabSets(database, query.fiscalYearId);
  });

  app.post(
    '/api/tax-slab-sets',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const body = parseBody(taxSlabSetSchema, request.body);
      const set = createTaxSlabSet(database, body.fiscalYearId, {
        name: body.name,
        slabs: body.slabs,
      });
      return reply.code(201).send(set);
    },
  );
}
