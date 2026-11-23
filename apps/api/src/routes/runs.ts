import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import { parseBody } from '../errors.js';
import { listPeriods } from '../repositories/policy.js';
import { requireAdmin } from '../roles.js';
import { groupQuerySchema } from '../schemas.js';
import { calculateDraft, finalizeRun, getRunSummary, getRunView } from '../services/run-service.js';

type IdParams = { id: string };

export function registerRunRoutes(app: FastifyInstance, database: AppDatabase): void {
  app.get('/api/periods', async () => listPeriods(database));

  app.post<{ Params: IdParams }>(
    '/api/periods/:id/run',
    { preHandler: requireAdmin },
    async (request) => calculateDraft(database, request.params.id),
  );

  app.get<{ Params: IdParams }>('/api/runs/:id', async (request) => {
    const query = parseBody(groupQuerySchema, request.query);
    return getRunView(database, request.params.id, query.group ?? 'ALL');
  });

  app.get<{ Params: IdParams }>('/api/runs/:id/summary', async (request) => {
    const query = parseBody(groupQuerySchema, request.query);
    return getRunSummary(database, request.params.id, query.group ?? 'ALL');
  });

  app.post<{ Params: IdParams }>(
    '/api/runs/:id/finalize',
    { preHandler: requireAdmin },
    async (request) => finalizeRun(database, request.params.id),
  );
}
