import type { DocCheck, ExtractedField } from '@app/shared';

/** Parses "45,000.50", "₹ 45000", "INR 1,20,000", "-12.5". Returns undefined when there is no number. */
export function parseMoney(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/[\s,]/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

/** Accepts YYYY-MM-DD (what extraction is asked for), plus anything Date.parse understands. */
export function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = iso ? new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

type Rule = (get: (key: string) => ExtractedField | undefined, today: Date) => DocCheck | undefined;

const check = (id: string, label: string, status: DocCheck['status'], detail: string): DocCheck => ({
  id: `rule:${id}`,
  group: 'rule',
  label,
  status,
  detail,
  probability: null,
  evidence: null,
});

function order(first: string, second: string, label: string): Rule {
  return (get) => {
    const a = parseDate(get(first)?.value);
    const b = parseDate(get(second)?.value);
    if (!a || !b) return undefined;
    return a.getTime() <= b.getTime()
      ? check(
          `${first}-${second}`,
          label,
          'pass',
          `${get(first)!.label} ${day(a)} is on or before ${get(second)!.label} ${day(b)}.`,
        )
      : check(
          `${first}-${second}`,
          label,
          'fail',
          `${get(first)!.label} ${day(a)} is after ${get(second)!.label} ${day(b)}.`,
        );
  };
}

function notFuture(key: string, label: string): Rule {
  return (get, today) => {
    const d = parseDate(get(key)?.value);
    if (!d) return undefined;
    return d.getTime() > today.getTime()
      ? check(`${key}-future`, label, 'fail', `${get(key)!.label} ${day(d)} is in the future.`)
      : check(`${key}-future`, label, 'pass', `${get(key)!.label} ${day(d)} is not in the future.`);
  };
}

const RULES: Record<string, Rule[]> = {
  invoice: [
    order('issue_date', 'due_date', 'Due date after issue date'),
    notFuture('issue_date', 'Issue date not in the future'),
    (get) => {
      const subtotal = parseMoney(get('subtotal')?.value);
      const tax = parseMoney(get('tax')?.value);
      const total = parseMoney(get('total')?.value);
      if (subtotal === undefined || total === undefined) return undefined;
      const expected = subtotal + (tax ?? 0);
      const ok = Math.abs(expected - total) <= Math.max(1, total * 0.005);
      return check(
        'totals',
        'Totals add up',
        ok ? 'pass' : 'fail',
        ok
          ? `Subtotal ${subtotal} + tax ${tax ?? 0} = total ${total}.`
          : `Subtotal ${subtotal} + tax ${tax ?? 0} = ${expected.toFixed(2)}, but the total says ${total}.`,
      );
    },
    (get, today) => {
      const due = parseDate(get('due_date')?.value);
      if (!due) return undefined;
      return due.getTime() < today.getTime()
        ? check('overdue', 'Payment due date', 'warn', `Payment was due on ${day(due)}.`)
        : check('overdue', 'Payment due date', 'pass', `Payment is due on ${day(due)}.`);
    },
  ],
  receipt: [notFuture('transaction_date', 'Date not in the future')],
  quote: [order('quote_date', 'valid_until', 'Valid-until after quote date')],
  contract: [
    order('effective_date', 'end_date', 'End date after start date'),
    (get, today) => {
      const end = parseDate(get('end_date')?.value);
      if (!end) return undefined;
      return end.getTime() < today.getTime()
        ? check('expired', 'Contract in force', 'warn', `The contract ended on ${day(end)}.`)
        : check('expired', 'Contract in force', 'pass', `The contract runs until ${day(end)}.`);
    },
  ],
  id_document: [
    order('issue_date', 'expiry_date', 'Expiry after issue date'),
    notFuture('date_of_birth', 'Birth date not in the future'),
    (get, today) => {
      const expiry = parseDate(get('expiry_date')?.value);
      if (!expiry) return undefined;
      return expiry.getTime() < today.getTime()
        ? check('expired', 'ID still valid', 'fail', `The ID expired on ${day(expiry)}.`)
        : check('expired', 'ID still valid', 'pass', `Valid until ${day(expiry)}.`);
    },
  ],
  bank_statement: [order('period_start', 'period_end', 'Statement period in order')],
  insurance_claim: [
    notFuture('incident_date', 'Incident date not in the future'),
    (get) => {
      const amount = parseMoney(get('claimed_amount')?.value);
      if (amount === undefined) return undefined;
      return amount <= 0
        ? check('amount', 'Claimed amount positive', 'fail', 'The claimed amount is zero or negative.')
        : check('amount', 'Claimed amount positive', 'pass', `Claims ${amount}.`);
    },
  ],
  medical_report: [notFuture('report_date', 'Report date not in the future')],
  resume: [],
  other: [],
};

/** Field-format checks for every type, then the type's own rules. */
export function runRules(
  docType: string,
  fields: ExtractedField[],
  required: Set<string>,
  today = new Date(),
): DocCheck[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const get = (key: string) => byKey.get(key);
  const checks: DocCheck[] = [];
  const missing = fields.filter((f) => required.has(f.key) && !f.value).map((f) => f.label);
  checks.push(
    missing.length
      ? check('required', 'Required fields', 'warn', `Missing: ${missing.join(', ')}.`)
      : check('required', 'Required fields', 'pass', 'All required fields were found.'),
  );
  const badDates = fields
    .filter((f) => f.kind === 'date' && f.value && !parseDate(f.value))
    .map((f) => f.label);
  const badMoney = fields
    .filter((f) => f.kind === 'money' && f.value && parseMoney(f.value) === undefined)
    .map((f) => f.label);
  const bad = [...badDates, ...badMoney];
  if (bad.length)
    checks.push(check('format', 'Readable values', 'warn', `Could not read: ${bad.join(', ')}.`));
  for (const rule of RULES[docType] ?? []) {
    const result = rule(get, today);
    if (result) checks.push(result);
  }
  return checks;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** How a value is written in questions to the decision model: "3 November 2026", "45,000.50". */
export function humanValue(kind: string, value: string): string {
  if (kind === 'date') {
    const d = parseDate(value);
    if (d) return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  if (kind === 'money' || kind === 'number') {
    const n = parseMoney(value);
    if (n !== undefined)
      return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return value;
}
