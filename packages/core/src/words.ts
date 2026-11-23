const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Renders integer rupees using the Indian lakh/crore grouping used in Nepal. */
export function rupeesInWords(rupees: number): string {
  if (!Number.isSafeInteger(rupees) || rupees < 0) {
    throw new Error('rupeesInWords expects a non-negative safe integer');
  }
  if (rupees === 0) return 'Zero';
  if (rupees >= 10_000_000) {
    const crores = Math.floor(rupees / 10_000_000);
    const remainder = rupees % 10_000_000;
    return `${rupeesInWords(crores)} Crore${remainder === 0 ? '' : ` ${rupeesInWords(remainder)}`}`;
  }
  if (rupees >= 100_000) {
    const lakhs = Math.floor(rupees / 100_000);
    const remainder = rupees % 100_000;
    return `${twoDigits(lakhs)} Lakh${remainder === 0 ? '' : ` ${rupeesInWords(remainder)}`}`;
  }
  if (rupees >= 1_000) {
    const thousands = Math.floor(rupees / 1_000);
    const remainder = rupees % 1_000;
    return `${twoDigits(thousands)} Thousand${remainder === 0 ? '' : ` ${threeDigits(remainder)}`}`;
  }
  return threeDigits(rupees);
}

export function amountInWords(paisa: number): string {
  if (!Number.isSafeInteger(paisa) || paisa < 0) {
    throw new Error('amountInWords expects a non-negative safe integer number of paisa');
  }
  const rupees = Math.floor(paisa / 100);
  const paise = paisa % 100;
  const rupeePart = `Rupees ${rupeesInWords(rupees)}`;
  if (paise === 0) return `${rupeePart} Only`;
  return `${rupeePart} and Paise ${twoDigits(paise)} Only`;
}

function threeDigits(value: number): string {
  if (value < 100) return twoDigits(value);
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  return `${ONES[hundreds] ?? ''} Hundred${remainder === 0 ? '' : ` ${twoDigits(remainder)}`}`;
}

function twoDigits(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${TENS[tens] ?? ''}${ones === 0 ? '' : `-${ONES[ones] ?? ''}`}`;
}
