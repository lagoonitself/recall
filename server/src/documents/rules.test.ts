import { describe, expect, it } from 'vitest';
import type { DocCheck, ExtractedField } from '@app/shared';
import { DOC_TYPES } from './catalog.js';
import { normalizeExtraction, route } from './analyze.js';
import { parseDate, parseMoney, runRules } from './rules.js';

const field = (key: string, value: string | null, kind: ExtractedField['kind'] = 'text'): ExtractedField => ({
  key,
  label: key.replace(/_/g, ' '),
  kind,
  value,
  page: null,
  confidence: null,
});
const today = new Date('2026-11-14T00:00:00Z');
const byId = (checks: DocCheck[], id: string) => checks.find((c) => c.id === id);

describe('value parsing', () => {
  it('reads Indian and western money formats', () => {
    expect(parseMoney('INR 1,20,000.50')).toBe(120000.5);
    expect(parseMoney('₹ 45,000')).toBe(45000);
    expect(parseMoney('-12.5')).toBe(-12.5);
    expect(parseMoney('none')).toBeUndefined();
  });
  it('reads ISO dates and rejects garbage', () => {
    expect(parseDate('2026-11-03')?.toISOString().slice(0, 10)).toBe('2026-11-03');
    expect(parseDate('not a date')).toBeUndefined();
  });
});

describe('document rules', () => {
  it('fails an invoice whose subtotal and tax do not add up to the total', () => {
    const checks = runRules(
      'invoice',
      [
        field('issue_date', '2026-11-06', 'date'),
        field('due_date', '2026-11-20', 'date'),
        field('subtotal', '38000.00', 'money'),
        field('tax', '6840.00', 'money'),
        field('total', '48500.00', 'money'),
      ],
      new Set(['total']),
      today,
    );
    expect(byId(checks, 'rule:totals')?.status).toBe('fail');
    expect(byId(checks, 'rule:totals')?.detail).toContain('44840.00');
    expect(byId(checks, 'rule:issue_date-due_date')?.status).toBe('pass');
    expect(byId(checks, 'rule:overdue')?.status).toBe('pass');
  });
  it('passes matching totals and flags an overdue invoice', () => {
    const checks = runRules(
      'invoice',
      [
        field('due_date', '2026-11-01', 'date'),
        field('subtotal', '100', 'money'),
        field('tax', '18', 'money'),
        field('total', '118', 'money'),
      ],
      new Set(),
      today,
    );
    expect(byId(checks, 'rule:totals')?.status).toBe('pass');
    expect(byId(checks, 'rule:overdue')?.status).toBe('warn');
  });
  it('fails an expired ID and a claim dated in the future', () => {
    expect(
      byId(
        runRules('id_document', [field('expiry_date', '2025-01-01', 'date')], new Set(), today),
        'rule:expired',
      )?.status,
    ).toBe('fail');
    expect(
      byId(
        runRules('insurance_claim', [field('incident_date', '2026-12-01', 'date')], new Set(), today),
        'rule:incident_date-future',
      )?.status,
    ).toBe('fail');
  });
  it('warns about missing required fields and unreadable values', () => {
    const checks = runRules(
      'receipt',
      [field('merchant_name', null), field('total', 'twelve', 'money')],
      new Set(['merchant_name']),
      today,
    );
    expect(byId(checks, 'rule:required')?.detail).toContain('merchant name');
    expect(byId(checks, 'rule:format')?.status).toBe('warn');
  });
});

describe('extraction normalising', () => {
  it('keeps catalogue fields only, drops placeholder values and bad pages', () => {
    const spec = DOC_TYPES.find((t) => t.key === 'receipt')!;
    const result = normalizeExtraction(spec, {
      summary: ' A receipt. ',
      fields: {
        merchant_name: { value: 'Cafe', page: 1 },
        total: { value: 'N/A', page: 0 },
        injected: { value: 'x' },
      },
    });
    expect(result.summary).toBe('A receipt.');
    expect(result.fields.map((f) => f.key)).toEqual(spec.fields.map((f) => f.key));
    expect(result.fields.find((f) => f.key === 'merchant_name')).toMatchObject({ value: 'Cafe', page: 1 });
    expect(result.fields.find((f) => f.key === 'total')).toMatchObject({ value: null, page: null });
  });
  it('survives a reply that is not an object', () => {
    expect(normalizeExtraction(DOC_TYPES[0], 'oops').fields.every((f) => f.value === null)).toBe(true);
  });
});

describe('review routing', () => {
  const pass: DocCheck = {
    id: 'a',
    group: 'rule',
    label: 'A',
    status: 'pass',
    detail: '',
    probability: null,
    evidence: null,
  };
  it('auto-approves a confident clean document', () => {
    expect(route({ typeConfidence: 0.95, quality: 1, checks: [pass] }).reviewStatus).toBe('auto_approved');
  });
  it('sends uncertain, unreadable or failing documents to a person', () => {
    expect(route({ typeConfidence: 0.4, quality: 1, checks: [pass] }).reviewStatus).toBe('needs_review');
    expect(route({ typeConfidence: 0.9, quality: 0.2, checks: [pass] }).reviewStatus).toBe('needs_review');
    const failed = route({
      typeConfidence: 0.9,
      quality: 1,
      checks: [{ ...pass, status: 'fail', label: 'Totals' }],
    });
    expect(failed.reviewStatus).toBe('needs_review');
    expect(failed.reasons[0]).toContain('Totals');
    expect(failed.risk).toBeGreaterThan(0.2);
  });
});
