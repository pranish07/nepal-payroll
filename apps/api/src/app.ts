import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './db/client.js';
import { applyMigrations } from './db/migrate.js';
import { registerErrorHandler } from './errors.js';
import { parseRoleHeader } from './roles.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerEmployeeRoutes } from './routes/employees.js';
import { registerPayslipRoutes } from './routes/payslips.js';
import { registerRunRoutes } from './routes/runs.js';
import { seedIfEmpty } from './seed.js';

export interface BuildAppOptions {
  dbPath?: string;
  seed?: boolean;
  serveWeb?: boolean;
  logger?: FastifyServerOptions['logger'];
}

const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const configuredPath = options.dbPath ?? process.env.DB_PATH ?? 'data/payroll.db';
  const dbPath = configuredPath === ':memory:' ? ':memory:' : resolve(configuredPath);
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

  const database = createDatabase(dbPath);
  applyMigrations(database.raw);
  if (options.seed !== false) seedIfEmpty(database);

  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 1_000_000,
  });

  app.addHook('onRequest', async (request) => {
    request.role = request.url.startsWith('/api')
      ? parseRoleHeader(request.headers['x-role'])
      : 'employee';
  });

  registerErrorHandler(app);

  app.get('/api/health', async () => {
    database.raw.prepare('SELECT 1 AS ok').get();
    return { status: 'ok', database: 'ok', currency: 'NPR' };
  });

  registerEmployeeRoutes(app, database);
  registerConfigRoutes(app, database);
  registerRunRoutes(app, database);
  registerPayslipRoutes(app, database);
  registerAdminRoutes(app, database);

  if (options.serveWeb !== false && existsSync(join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      wildcard: false,
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      return reply.code(404).send({
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} was not found.`,
        details: null,
      });
    }
    if (request.method === 'GET' && existsSync(join(webDist, 'index.html'))) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      details: null,
    });
  });

  app.addHook('onClose', async () => {
    database.raw.close();
  });

  return app;
}
