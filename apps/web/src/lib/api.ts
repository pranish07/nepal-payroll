import type { Role } from './types';

const ROLE_KEY = 'nepal-payroll.role';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function loadRole(): Role {
  const value = window.localStorage.getItem(ROLE_KEY);
  return value === 'admin' ? 'admin' : 'employee';
}

export function saveRole(role: Role): void {
  window.localStorage.setItem(ROLE_KEY, role);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Role': loadRole(),
    Accept: 'application/json',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let payload: { code?: string; message?: string; details?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Keep the generic message if the body is not JSON.
    }
    throw new ApiError(
      response.status,
      payload.code ?? 'HTTP_ERROR',
      payload.message ?? `Request failed with status ${response.status}.`,
      payload.details ?? null,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
