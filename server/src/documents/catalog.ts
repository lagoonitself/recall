import type { DecisionQuestion } from '../agent/provider/documents.js';

export type FieldKind = 'text' | 'date' | 'money' | 'number' | 'id';
export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  hint: string;
  required?: boolean;
  /** Compare this value against photos, audio, video and other files in the collection. */
  cross?: boolean;
};
/** A yes/no check answered by Gemini Decision 1 over the original document. */
export type AiCheckSpec = {
  key: string;
  label: string;
  question: Extract<DecisionQuestion, { type: 'noul' }>;
  /** Which answer is the problem. */
  problemWhen: 'yes' | 'no';
  /** Status when the problem is likely (p >= 0.6). Between 0.4 and 0.6 it is always 'warn'. */
  severity: 'warn' | 'fail';
  detailProblem: string;
  detailOk: string;
};
export type DocTypeSpec = {
  key: string;
  label: string;
  /** Shown to Decision 1 as the choice criterion. */
  description: string;
  fields: FieldSpec[];
  checks: AiCheckSpec[];
};

const signed = (what: string): AiCheckSpec => ({
  key: 'signed',
  label: 'Signature present',
  question: {
    type: 'noul',
    instructions: `Is this ${what} signed, with a handwritten, stamped or digital signature visible?`,
  },
  problemWhen: 'no',
  severity: 'warn',
  detailProblem: `No signature was found on this ${what}.`,
  detailOk: 'A signature is visible.',
});

export const DOC_TYPES: DocTypeSpec[] = [
  {
    key: 'invoice',
    label: 'Invoice',
    description: 'A bill from a seller asking for payment for goods or services.',
    fields: [
      { key: 'invoice_number', label: 'Invoice number', kind: 'id', hint: 'The invoice id', required: true },
      {
        key: 'vendor_name',
        label: 'Vendor',
        kind: 'text',
        hint: 'Seller / issuer name',
        required: true,
        cross: true,
      },
      { key: 'customer_name', label: 'Billed to', kind: 'text', hint: 'Buyer name' },
      { key: 'issue_date', label: 'Issue date', kind: 'date', hint: 'Invoice date', required: true },
      { key: 'due_date', label: 'Due date', kind: 'date', hint: 'Payment due date' },
      { key: 'po_number', label: 'PO number', kind: 'id', hint: 'Purchase order number' },
      {
        key: 'items_summary',
        label: 'Items',
        kind: 'text',
        hint: 'Short list of goods or services billed',
        cross: true,
      },
      { key: 'subtotal', label: 'Subtotal', kind: 'money', hint: 'Amount before tax' },
      { key: 'tax', label: 'Tax', kind: 'money', hint: 'Total tax amount' },
      { key: 'total', label: 'Total', kind: 'money', hint: 'Grand total due', required: true, cross: true },
      { key: 'currency', label: 'Currency', kind: 'text', hint: 'ISO currency code, e.g. INR, USD' },
    ],
    checks: [
      {
        key: 'tax_id',
        label: 'Seller tax id',
        question: {
          type: 'noul',
          instructions:
            "Does the invoice show the seller's tax registration number (for example GSTIN, VAT or TIN)?",
        },
        problemWhen: 'no',
        severity: 'warn',
        detailProblem: "The seller's tax registration number is missing.",
        detailOk: "The seller's tax registration number is shown.",
      },
    ],
  },
  {
    key: 'quote',
    label: 'Quote / estimate',
    description:
      'A quotation, estimate or proposal of what work or goods will cost, before any bill is issued.',
    fields: [
      { key: 'quote_number', label: 'Quote number', kind: 'id', hint: 'Quote or estimate reference' },
      {
        key: 'vendor_name',
        label: 'Vendor',
        kind: 'text',
        hint: 'Who issued the quote',
        required: true,
        cross: true,
      },
      { key: 'customer_name', label: 'Customer', kind: 'text', hint: 'Who it is for', cross: true },
      {
        key: 'quote_date',
        label: 'Quote date',
        kind: 'date',
        hint: 'Date of the quote or inspection',
        required: true,
      },
      { key: 'valid_until', label: 'Valid until', kind: 'date', hint: 'Expiry of the quote' },
      {
        key: 'work_summary',
        label: 'Work quoted',
        kind: 'text',
        hint: 'Short list of work, parts or findings',
        required: true,
        cross: true,
      },
      {
        key: 'total',
        label: 'Quoted total',
        kind: 'money',
        hint: 'Total estimated cost',
        required: true,
        cross: true,
      },
      { key: 'currency', label: 'Currency', kind: 'text', hint: 'ISO currency code' },
    ],
    checks: [],
  },
  {
    key: 'receipt',
    label: 'Receipt',
    description: 'Proof that a payment was already made, such as a till slip or payment confirmation.',
    fields: [
      {
        key: 'merchant_name',
        label: 'Merchant',
        kind: 'text',
        hint: 'Shop or payee',
        required: true,
        cross: true,
      },
      {
        key: 'transaction_date',
        label: 'Date',
        kind: 'date',
        hint: 'Payment date',
        required: true,
        cross: true,
      },
      { key: 'receipt_number', label: 'Receipt number', kind: 'id', hint: 'Receipt or transaction id' },
      { key: 'items_summary', label: 'Items', kind: 'text', hint: 'What was bought', cross: true },
      { key: 'payment_method', label: 'Payment method', kind: 'text', hint: 'Cash, card, UPI…' },
      { key: 'total', label: 'Total paid', kind: 'money', hint: 'Amount paid', required: true, cross: true },
      { key: 'currency', label: 'Currency', kind: 'text', hint: 'ISO currency code' },
    ],
    checks: [],
  },
  {
    key: 'contract',
    label: 'Contract',
    description: 'An agreement between parties: contract, lease, NDA, offer letter or terms.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', hint: 'Agreement title', required: true },
      { key: 'party_a', label: 'Party A', kind: 'text', hint: 'First party', required: true, cross: true },
      { key: 'party_b', label: 'Party B', kind: 'text', hint: 'Second party', required: true, cross: true },
      {
        key: 'effective_date',
        label: 'Effective date',
        kind: 'date',
        hint: 'Start date',
        required: true,
        cross: true,
      },
      { key: 'end_date', label: 'End date', kind: 'date', hint: 'Expiry or end date' },
      {
        key: 'contract_value',
        label: 'Value',
        kind: 'money',
        hint: 'Total or recurring amount',
        cross: true,
      },
      { key: 'governing_law', label: 'Governing law', kind: 'text', hint: 'Jurisdiction' },
      {
        key: 'key_obligations',
        label: 'Key obligations',
        kind: 'text',
        hint: 'One-sentence summary of main obligations',
        cross: true,
      },
    ],
    checks: [
      {
        ...signed('contract'),
        question: { type: 'noul', instructions: 'Is the contract signed by both parties?' },
      },
      {
        key: 'auto_renewal',
        label: 'Auto-renewal clause',
        question: {
          type: 'noul',
          instructions: 'Does the contract renew automatically unless someone cancels it?',
        },
        problemWhen: 'yes',
        severity: 'warn',
        detailProblem: 'The contract renews automatically. Note the cancellation deadline.',
        detailOk: 'No automatic renewal.',
      },
      {
        key: 'termination',
        label: 'Termination clause',
        question: { type: 'noul', instructions: 'Does the contract say how either party can terminate it?' },
        problemWhen: 'no',
        severity: 'warn',
        detailProblem: 'No termination clause was found.',
        detailOk: 'A termination clause is present.',
      },
    ],
  },
  {
    key: 'id_document',
    label: 'ID document',
    description: 'An identity document: passport, driving licence, national id card, Aadhaar, PAN or visa.',
    fields: [
      { key: 'id_kind', label: 'ID type', kind: 'text', hint: 'Passport, driving licence…', required: true },
      {
        key: 'full_name',
        label: 'Name',
        kind: 'text',
        hint: 'Holder full name',
        required: true,
        cross: true,
      },
      { key: 'id_number', label: 'ID number', kind: 'id', hint: 'Document number', required: true },
      { key: 'date_of_birth', label: 'Date of birth', kind: 'date', hint: 'Holder birth date' },
      { key: 'issue_date', label: 'Issue date', kind: 'date', hint: 'Date issued' },
      { key: 'expiry_date', label: 'Expiry date', kind: 'date', hint: 'Valid until' },
      { key: 'issuing_authority', label: 'Issued by', kind: 'text', hint: 'Country or authority' },
    ],
    checks: [
      {
        key: 'photo',
        label: 'Holder photo',
        question: { type: 'noul', instructions: "Does the document show a photo of the holder's face?" },
        problemWhen: 'no',
        severity: 'warn',
        detailProblem: 'No holder photo is visible.',
        detailOk: 'A holder photo is visible.',
      },
    ],
  },
  {
    key: 'bank_statement',
    label: 'Bank statement',
    description: 'A bank or card account statement listing transactions over a period.',
    fields: [
      { key: 'bank_name', label: 'Bank', kind: 'text', hint: 'Bank name', required: true },
      {
        key: 'account_holder',
        label: 'Account holder',
        kind: 'text',
        hint: 'Name on the account',
        required: true,
        cross: true,
      },
      { key: 'account_last4', label: 'Account (last 4)', kind: 'id', hint: 'Last four digits only' },
      {
        key: 'period_start',
        label: 'Period start',
        kind: 'date',
        hint: 'Statement start date',
        required: true,
      },
      { key: 'period_end', label: 'Period end', kind: 'date', hint: 'Statement end date', required: true },
      { key: 'opening_balance', label: 'Opening balance', kind: 'money', hint: 'Balance at start' },
      { key: 'closing_balance', label: 'Closing balance', kind: 'money', hint: 'Balance at end' },
      {
        key: 'largest_debit',
        label: 'Largest debit',
        kind: 'text',
        hint: 'Largest outgoing payment: payee and amount',
        cross: true,
      },
    ],
    checks: [],
  },
  {
    key: 'insurance_claim',
    label: 'Insurance claim',
    description: 'An insurance claim form, loss report, accident report or damage assessment.',
    fields: [
      { key: 'claim_number', label: 'Claim number', kind: 'id', hint: 'Claim reference' },
      { key: 'policy_number', label: 'Policy number', kind: 'id', hint: 'Policy id', required: true },
      {
        key: 'claimant_name',
        label: 'Claimant',
        kind: 'text',
        hint: 'Person claiming',
        required: true,
        cross: true,
      },
      {
        key: 'incident_date',
        label: 'Incident date',
        kind: 'date',
        hint: 'When the loss happened',
        required: true,
        cross: true,
      },
      {
        key: 'incident_location',
        label: 'Incident location',
        kind: 'text',
        hint: 'Where it happened',
        cross: true,
      },
      {
        key: 'asset',
        label: 'Insured item',
        kind: 'text',
        hint: 'Vehicle, property or item (make, model, colour, plate)',
        cross: true,
      },
      {
        key: 'damage_description',
        label: 'Damage described',
        kind: 'text',
        hint: 'What was damaged and how, one or two sentences',
        required: true,
        cross: true,
      },
      {
        key: 'claimed_amount',
        label: 'Amount claimed',
        kind: 'money',
        hint: 'Amount requested',
        required: true,
        cross: true,
      },
    ],
    checks: [signed('claim form')],
  },
  {
    key: 'medical_report',
    label: 'Medical report',
    description: 'A lab report, prescription, discharge summary, scan report or doctor note.',
    fields: [
      {
        key: 'patient_name',
        label: 'Patient',
        kind: 'text',
        hint: 'Patient name',
        required: true,
        cross: true,
      },
      {
        key: 'report_date',
        label: 'Report date',
        kind: 'date',
        hint: 'Date of report',
        required: true,
        cross: true,
      },
      { key: 'provider', label: 'Provider', kind: 'text', hint: 'Hospital, lab or doctor' },
      { key: 'diagnosis', label: 'Diagnosis / finding', kind: 'text', hint: 'Main finding', cross: true },
      {
        key: 'abnormal_results',
        label: 'Abnormal results',
        kind: 'text',
        hint: 'Values outside reference range',
      },
      { key: 'medications', label: 'Medications', kind: 'text', hint: 'Prescribed medicines', cross: true },
    ],
    checks: [
      {
        key: 'abnormal',
        label: 'Out-of-range results',
        question: {
          type: 'noul',
          instructions:
            'Does the report flag any result as abnormal, high, low or outside the reference range?',
        },
        problemWhen: 'yes',
        severity: 'warn',
        detailProblem: 'Some results are flagged outside the reference range.',
        detailOk: 'No results are flagged as abnormal.',
      },
    ],
  },
  {
    key: 'resume',
    label: 'Resume',
    description: "A CV or resume describing a person's work history and skills.",
    fields: [
      {
        key: 'candidate_name',
        label: 'Candidate',
        kind: 'text',
        hint: 'Full name',
        required: true,
        cross: true,
      },
      { key: 'email', label: 'Email', kind: 'text', hint: 'Email address' },
      {
        key: 'current_role',
        label: 'Current role',
        kind: 'text',
        hint: 'Latest title and employer',
        cross: true,
      },
      {
        key: 'years_experience',
        label: 'Years of experience',
        kind: 'number',
        hint: 'Total years, a number',
      },
      {
        key: 'top_skills',
        label: 'Top skills',
        kind: 'text',
        hint: 'Up to six skills, comma-separated',
        cross: true,
      },
      { key: 'education', label: 'Education', kind: 'text', hint: 'Highest degree and school' },
    ],
    checks: [],
  },
  {
    key: 'other',
    label: 'Other document',
    description: 'Any other document: report, letter, notice, article, form or presentation.',
    fields: [
      { key: 'title', label: 'Title', kind: 'text', hint: 'Document title or subject', required: true },
      { key: 'document_date', label: 'Date', kind: 'date', hint: 'Main date on the document', cross: true },
      { key: 'issuer', label: 'Author / issuer', kind: 'text', hint: 'Who wrote or issued it', cross: true },
      {
        key: 'main_point',
        label: 'Main point',
        kind: 'text',
        hint: 'One sentence: what the document says or asks',
        cross: true,
      },
      { key: 'amount', label: 'Amount', kind: 'money', hint: 'Main monetary amount, if any' },
    ],
    checks: [],
  },
];

export const docType = (key: string | null | undefined) =>
  DOC_TYPES.find((t) => t.key === key) ?? DOC_TYPES[DOC_TYPES.length - 1];

/** Checks asked of every document. */
export const COMMON_CHECKS: AiCheckSpec[] = [
  {
    key: 'tampered',
    label: 'Signs of tampering',
    question: {
      type: 'noul',
      instructions:
        'Does the document show signs of alteration or tampering, such as mismatched fonts, overwritten or ' +
        'pasted-in numbers, misaligned text, or edited areas?',
      criteria: {
        true_description:
          'Visible editing, overwriting or inconsistencies that suggest the document was altered.',
        false_description: 'The document looks consistent and unaltered.',
      },
    },
    problemWhen: 'yes',
    severity: 'fail',
    detailProblem: 'Parts of the document look altered. Compare with the original.',
    detailOk: 'No signs of alteration.',
  },
  {
    key: 'complete',
    label: 'Complete document',
    question: {
      type: 'noul',
      instructions:
        'Is the document complete, with no pages, edges, tables or sections visibly cut off or missing?',
    },
    problemWhen: 'no',
    severity: 'warn',
    detailProblem: 'Part of the document looks cut off or missing.',
    detailOk: 'Nothing looks cut off.',
  },
];

export const LEGIBILITY: Extract<DecisionQuestion, { type: 'score' }> = {
  type: 'score',
  instructions: 'How clearly can the text of this document be read?',
  criteria: [
    'Unreadable: blurred, dark or too low resolution to read.',
    'Partly readable: some words or numbers are hard to make out.',
    'Clear: all text is easy to read.',
  ],
};

export const IS_DOCUMENT: Extract<DecisionQuestion, { type: 'noul' }> = {
  type: 'noul',
  instructions:
    'Is this image a document, such as a page, form, receipt, bill, card, certificate, letter or a screenshot of ' +
    'text, rather than a photo of a scene, object, place or person?',
};

export const docTypeQuestion = (): Extract<DecisionQuestion, { type: 'choice' }> => ({
  type: 'choice',
  instructions: 'What kind of document is this?',
  criteria: Object.fromEntries(DOC_TYPES.map((t) => [t.key, t.description])),
});
