import type { FastifyRequest } from 'fastify';
import { AppError, forbidden } from './errors.js';

export type Role = 'admin' | 'employee';

export function parseRoleHeader(value: string | string[] | undefined): Role {
  if (value === undefined) return 'employee';
  if (value === 'admin' || value === 'employee') return value;
  throw new AppError(400, 'INVALID_ROLE', 'X-Role must be "admin" or "employee".');
}

/**
 * Async on purpose: Fastify treats non-async hooks with fewer than three
 * parameters as promise-based, so a plain `void` function would never settle.
 */
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (request.role !== 'admin') {
    throw forbidden();
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    role: Role;
  }
}
