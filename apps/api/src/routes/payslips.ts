import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/client.js';
import { renderPayslipHtml } from '../payslip/render.js';
import { getEmployeePayslipView } from '../services/payslip-view.js';

type IdParams = { id: string };

/**
 * Employee-facing payslip routes. The view DTO and renderer have no secret
 * field, and this module must not import repositories/admin.ts.
 */
export function registerPayslipRoutes(app: FastifyInstance, database: AppDatabase): void {
  app.get<{ Params: IdParams }>('/api/payslips/:id', async (request) => {
    return getEmployeePayslipView(database, request.params.id);
  });

  app.get<{ Params: IdParams }>('/api/payslips/:id/html', async (request, reply) => {
    const view = getEmployeePayslipView(database, request.params.id);
    return reply
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(renderPayslipHtml(view));
  });
}
