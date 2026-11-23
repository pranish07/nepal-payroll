const nprFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

/** Formats integer paisa as NPR with two decimals and South Asian grouping. */
export function formatNprPaisa(paisa: number): string {
  const sign = paisa < 0 ? '-' : '';
  const absolute = Math.abs(paisa);
  const rupees = Math.trunc(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}NPR ${nprFormatter.format(rupees)}.${String(fraction).padStart(2, '0')}`;
}

export function formatPaisaPlain(paisa: number): string {
  return `NPR ${plainFormatter.format(Math.trunc(paisa / 100))}`;
}

/** Parses a human-entered rupee amount into integer paisa without float money math. */
export function parseNprToPaisa(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [rupees = '0', fraction = ''] = cleaned.split('.');
  const paisa = Number((fraction + '00').slice(0, 2));
  return Number(rupees) * 100 + paisa;
}

export function formatDate(value: string): string {
  return value;
}

/** Plain ungrouped rupee input value with exactly two decimals. */
export function paisaToNprInput(paisa: number): string {
  const sign = paisa < 0 ? '-' : '';
  const absolute = Math.abs(paisa);
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return value.replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace(/Z$/, ' UTC');
}

/** Converts decimal hours entered in the UI to the stored hundredths integer. */
export function hoursToHundredths(hours: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(hours.trim())) return null;
  const [whole = '0', fraction = ''] = hours.trim().split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

export function formatHours(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100);
  const fraction = hundredths % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function bpsToPercent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = bps % 100;
  return fraction === 0 ? `${whole}%` : `${whole}.${String(fraction).padStart(2, '0')}%`;
}
