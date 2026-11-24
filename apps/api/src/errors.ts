import { PayrollInputError } from '@nepal-payroll/core';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message: string, details?: unknown): AppError {
  return new AppError(404, 'NOT_FOUND', message, details);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(409, 'CONFLICT', message, details);
}

export function periodFinalized(): AppError {
  return new AppError(
    409,
    'PERIOD_FINALIZED',
    'This period is finalized; secret components can only be set before finalization.',
  );
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'BAD_REQUEST', message, details);
}

export function forbidden(message = 'This operation requires the admin role.'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function configError(message: string, details?: unknown): AppError {
  return new AppError(422, 'CONFIG_ERROR', message, details);
}

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The request is invalid.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/**
 * One error envelope for the whole API. We log the error object, never the
 * request body, so payloads (including the secret component) cannot reach logs.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError | AppError | PayrollInputError | ZodError, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof AppError) {
        return reply
          .code(error.statusCode)
          .send({ code: error.code, message: error.message, details: error.details ?? null });
      }
      if (error instanceof PayrollInputError) {
        return reply.code(400).send({
          code: 'INVALID_PAYROLL_INPUT',
          message: error.message,
          details: { field: error.field },
        });
      }
      if (error instanceof ZodError) {
        return reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: 'The request is invalid.',
          details: {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        });
      }

      const sqliteCode = (error as { code?: string }).code;
      if (sqliteCode?.startsWith('SQLITE_CONSTRAINT')) {
        request.log.warn({ code: sqliteCode }, 'database constraint rejected a request');
        return reply.code(409).send({
          code: 'CONSTRAINT_VIOLATION',
          message: 'The request violates a database constraint.',
          details: { constraint: sqliteCode },
        });
      }

      request.log.error({ err: error }, 'unhandled request error');
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong while processing the request.',
        details: null,
      });
    },
  );
}
