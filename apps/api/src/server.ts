import { buildApp } from './app.js';

const app = await buildApp();
const port = Number(process.env.PORT ?? 3000);

try {
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Nepal mini payroll is running at http://localhost:${port}`);
} catch (error) {
  app.log.error({ err: error }, 'failed to start the server');
  process.exitCode = 1;
}
