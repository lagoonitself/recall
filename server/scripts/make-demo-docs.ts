/** Generates the sample documents in demo/claim-review (used for testing and the demo video). */
import { writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const out = new URL('../../demo/claim-review/', import.meta.url);

async function pdf(name: string, title: string, lines: [string, string][], footer: string[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 780;
  page.drawText(title, { x: 50, y, size: 20, font: bold });
  y -= 40;
  for (const [label, value] of lines) {
    page.drawText(label, { x: 50, y, size: 11, font: bold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(value, { x: 210, y, size: 11, font });
    y -= 22;
  }
  y -= 16;
  for (const line of footer) {
    page.drawText(line, { x: 50, y, size: 10.5, font });
    y -= 17;
  }
  await writeFile(new URL(name, out), await doc.save());
}

await pdf(
  'claim-form.pdf',
  'Motor Insurance Claim Form',
  [
    ['Claim number', 'CLM-2026-118204'],
    ['Policy number', 'MTR-4471-2290'],
    ['Claimant', 'Priya Sharma'],
    ['Vehicle', 'White Hyundai Creta, KA-05-MN-2291'],
    ['Date of incident', '03 November 2026'],
    ['Location', 'Outer Ring Road, Marathahalli, Bengaluru'],
    ['Damage', 'Rear bumper and tail lamp damaged when hit from behind'],
    ['Amount claimed', 'INR 45,000'],
  ],
  [
    'Description: While stopped at a signal, my car was hit from behind by a two-wheeler.',
    'The rear bumper is cracked and the left tail lamp is broken. No injuries.',
    '',
    'I declare the above information is true.',
    'Signature: ____________________        Date: 05 November 2026',
  ],
);

await pdf(
  'garage-invoice.pdf',
  'TAX INVOICE  -  Speedfix Auto Works',
  [
    ['Invoice number', 'SFX/26/0932'],
    ['Billed to', 'Priya Sharma'],
    ['Invoice date', '06 November 2026'],
    ['Due date', '20 November 2026'],
    ['Vehicle', 'KA-05-MN-2291'],
    ['Items', 'Rear bumper replacement, tail lamp (L), paint'],
    ['Subtotal', 'INR 38,000.00'],
    ['GST 18%', 'INR 6,840.00'],
    ['Total due', 'INR 48,500.00'],
  ],
  ['GSTIN: 29ABCDE1234F1Z5', 'Thank you for your business.'],
);

await writeFile(
  new URL('repair-estimate.txt', out),
  [
    'Speedfix Auto Works - Repair estimate',
    'Customer: Priya Sharma   Vehicle: Hyundai Creta KA-05-MN-2291',
    'Inspection date: 05 November 2026',
    '',
    'Findings: front bumper cracked, bonnet dented, right headlamp broken.',
    'Rear of the vehicle: no damage found.',
    'Estimated cost: INR 52,000',
  ].join('\n'),
);
console.log('wrote demo/claim-review');
