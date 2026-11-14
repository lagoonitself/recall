import type { DocCheck, DocInsight, ExtractedField, File as LibraryFile } from '@app/shared';

/**
 * Mock-mode document intelligence. Values mirror a real Gemini Decision 1 run on demo/claim-review
 * (claim form vs. the claimant's call), so screenshots and tests show realistic output.
 */
const insights = new Map<string, DocInsight>();

const field = (
  key: string,
  label: string,
  kind: ExtractedField['kind'],
  value: string | null,
  confidence: number | null,
  page: number | null = 1,
): ExtractedField => ({
  key,
  label,
  kind,
  value,
  page: value ? page : null,
  confidence: value ? confidence : null,
});
const check = (
  id: string,
  group: DocCheck['group'],
  label: string,
  status: DocCheck['status'],
  detail: string,
  probability: number | null = null,
  evidence: DocCheck['evidence'] = null,
): DocCheck => ({ id, group, label, status, detail, probability, evidence });

function build(file: LibraryFile, others: LibraryFile[]): DocInsight {
  const name = file.name.toLowerCase();
  const media = others.find(
    (f) => f.modality === 'audio' || f.modality === 'video' || f.modality === 'image',
  );
  const evidence = media
    ? {
        chunkId: media.previewChunkId ?? crypto.randomUUID(),
        fileId: media.id,
        fileName: media.name,
        modality: media.modality,
        location: media.modality === 'audio' || media.modality === 'video' ? { startSec: 0, endSec: 30 } : {},
      }
    : null;
  const base = {
    fileId: file.id,
    collectionId: file.collectionId,
    fileName: file.name,
    modality: file.modality,
    status: 'ready' as const,
    error: null,
    analyzedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (name.includes('claim')) {
    const checks: DocCheck[] = [
      check('rule:required', 'rule', 'Required fields', 'pass', 'All required fields were found.'),
      check(
        'rule:incident_date-future',
        'rule',
        'Incident date not in the future',
        'pass',
        'Incident date 2026-11-03 is not in the future.',
      ),
      check(
        'ai:fields',
        'ai',
        'Extracted values confirmed',
        'pass',
        'Every extracted value was confirmed on a second read.',
      ),
      check('ai:tampered', 'ai', 'Signs of tampering', 'pass', 'No signs of alteration.', 0.93),
      check(
        'ai:signed',
        'ai',
        'Signature present',
        'warn',
        'No signature was found on this claim form.',
        0.96,
      ),
    ];
    if (evidence)
      checks.push(
        check(
          'cross:incident_date',
          'cross',
          'Incident date vs other media',
          'fail',
          `“${evidence.fileName}” contradicts “3 November 2026”.`,
          0.99,
          evidence,
        ),
        check(
          'cross:damage_description',
          'cross',
          'Damage described vs other media',
          'fail',
          `“${evidence.fileName}” contradicts “Rear bumper and tail lamp damaged when hit from behind”.`,
          0.99,
          evidence,
        ),
        check(
          'cross:claimant_name',
          'cross',
          'Claimant vs other media',
          'pass',
          `Confirmed by “${evidence.fileName}”.`,
          0.93,
          evidence,
        ),
      );
    const fails = checks.filter((c) => c.status === 'fail');
    return {
      ...base,
      docType: 'insurance_claim',
      docTypeLabel: 'Insurance claim',
      typeConfidence: 0.997,
      typeProbabilities: { insurance_claim: 0.997, invoice: 0.002, other: 0.001 },
      summary:
        'Motor insurance claim by Priya Sharma for rear bumper and tail lamp damage to a white Hyundai Creta on 3 November 2026, claiming INR 45,000.',
      fields: [
        field('claim_number', 'Claim number', 'id', 'CLM-2026-118204', 0.98),
        field('policy_number', 'Policy number', 'id', 'MTR-4471-2290', 0.99),
        field('claimant_name', 'Claimant', 'text', 'Priya Sharma', 0.98),
        field('incident_date', 'Incident date', 'date', '2026-11-03', 0.97),
        field(
          'incident_location',
          'Incident location',
          'text',
          'Outer Ring Road, Marathahalli, Bengaluru',
          0.97,
        ),
        field('asset', 'Insured item', 'text', 'White Hyundai Creta, KA-05-MN-2291', 0.98),
        field(
          'damage_description',
          'Damage described',
          'text',
          'Rear bumper and tail lamp damaged when hit from behind',
          0.96,
        ),
        field('claimed_amount', 'Amount claimed', 'money', '45000.00', 0.97),
      ],
      checks,
      quality: 0.99,
      riskScore: fails.length ? 0.68 : 0.12,
      reviewStatus: fails.length ? 'needs_review' : 'auto_approved',
      reviewReasons: fails.map((c) => `${c.label}: ${c.detail}`),
    };
  }
  if (name.includes('invoice')) {
    return {
      ...base,
      docType: 'invoice',
      docTypeLabel: 'Invoice',
      typeConfidence: 0.985,
      typeProbabilities: { invoice: 0.985, receipt: 0.01, quote: 0.005 },
      summary:
        'Tax invoice from Speedfix Auto Works to Priya Sharma for rear bumper and tail lamp repairs, totalling INR 48,500.',
      fields: [
        field('invoice_number', 'Invoice number', 'id', 'SFX/26/0932', 0.98),
        field('vendor_name', 'Vendor', 'text', 'Speedfix Auto Works', 0.98),
        field('issue_date', 'Issue date', 'date', '2026-11-06', 0.99),
        field('due_date', 'Due date', 'date', '2026-11-20', 0.97),
        field('subtotal', 'Subtotal', 'money', '38000.00', 0.98),
        field('tax', 'Tax', 'money', '6840.00', 0.96),
        field('total', 'Total', 'money', '48500.00', 0.92),
        field('po_number', 'PO number', 'id', null, null),
      ],
      checks: [
        check(
          'rule:totals',
          'rule',
          'Totals add up',
          'fail',
          'Subtotal 38000 + tax 6840 = 44840.00, but the total says 48500.',
        ),
        check(
          'rule:issue_date-due_date',
          'rule',
          'Due date after issue date',
          'pass',
          'Issue date 2026-11-06 is on or before Due date 2026-11-20.',
        ),
        check(
          'ai:tax_id',
          'ai',
          'Seller tax id',
          'pass',
          "The seller's tax registration number is shown.",
          0.97,
        ),
        check('ai:tampered', 'ai', 'Signs of tampering', 'pass', 'No signs of alteration.', 0.83),
      ],
      quality: 0.98,
      riskScore: 0.41,
      reviewStatus: 'needs_review',
      reviewReasons: ['Totals add up: Subtotal 38000 + tax 6840 = 44840.00, but the total says 48500.'],
    };
  }
  if (file.modality === 'image' && !name.includes('receipt') && !name.includes('scan')) {
    return {
      ...base,
      status: 'not_document',
      docType: null,
      docTypeLabel: null,
      typeConfidence: 0.95,
      typeProbabilities: {},
      summary: null,
      fields: [],
      checks: [],
      quality: null,
      riskScore: null,
      reviewStatus: null,
      reviewReasons: [],
    };
  }
  return {
    ...base,
    docType: 'other',
    docTypeLabel: 'Other document',
    typeConfidence: 0.81,
    typeProbabilities: { other: 0.81, contract: 0.11, invoice: 0.08 },
    summary: `${file.name} was analysed. No problems were found.`,
    fields: [
      field('title', 'Title', 'text', file.name.replace(/\.[^.]+$/, ''), 0.9),
      field('document_date', 'Date', 'date', '2026-11-01', 0.84),
    ],
    checks: [
      check('rule:required', 'rule', 'Required fields', 'pass', 'All required fields were found.'),
      check('ai:tampered', 'ai', 'Signs of tampering', 'pass', 'No signs of alteration.', 0.95),
      check('ai:complete', 'ai', 'Complete document', 'pass', 'Nothing looks cut off.', 0.92),
    ],
    quality: 0.95,
    riskScore: 0.07,
    reviewStatus: 'auto_approved',
    reviewReasons: [],
  };
}

const isDocument = (f: LibraryFile) => f.status === 'ready' && ['pdf', 'image', 'text'].includes(f.modality);

/** Analysed documents of a collection; new ready files show as "running" for a moment first. */
export function mockDocuments(files: LibraryFile[], collectionId: string) {
  const inCollection = files.filter((f) => f.collectionId === collectionId);
  const list: DocInsight[] = [];
  for (const file of inCollection.filter(isDocument)) {
    let insight = insights.get(file.id);
    if (!insight) {
      const ready = build(
        file,
        inCollection.filter((f) => f.id !== file.id),
      );
      insight = { ...ready, status: 'running', reviewStatus: null };
      insights.set(file.id, insight);
      setTimeout(() => insights.set(file.id, ready), 2500);
    }
    list.push(insight);
  }
  return { documents: list, unanalyzed: 0 };
}

export function mockDocument(fileId: string) {
  return insights.get(fileId);
}

export function mockReview(fileId: string, status: DocInsight['reviewStatus']) {
  const insight = insights.get(fileId);
  if (!insight) return undefined;
  const next = { ...insight, reviewStatus: status, updatedAt: new Date().toISOString() };
  insights.set(fileId, next);
  return next;
}

export function mockReanalyze(fileId: string) {
  insights.delete(fileId);
}
