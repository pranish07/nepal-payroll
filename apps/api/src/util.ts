import { randomUUID } from 'node:crypto';

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

/** Shows only the final four digits of a bank account on employee-facing documents. */
export function maskBankAccount(accountNumber: string): string {
  const digits = accountNumber.replace(/\s+/g, '');
  if (digits.length <= 4) return '****';
  return `**** **** ${digits.slice(-4)}`;
}
