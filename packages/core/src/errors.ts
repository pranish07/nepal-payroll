/**
 * A bad payroll input. The engine never touches the database or the clock, so
 * every failure it can produce is a function of its arguments.
 */
export class PayrollInputError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'PayrollInputError';
    this.field = field;
  }
}
