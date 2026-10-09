import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as PDFLib from 'pdf-lib';
import { computeTax } from '../extension/lib/tax.js';
import { amount, buildPdf } from '../extension/lib/pdf.js';

test('amount formats numbers the French way', () => {
  assert.equal(amount(1234567), '1 234 567');
  assert.equal(amount(1234.5, 2), '1 234,50');
  assert.equal(amount(0.8712, 4), '0,8712');
});

test('renders the example declaration', async () => {
  const decl = {
    month: '2026-03',
    declarationDate: '2026-03-20',
    profile: {
      lastName: 'Dupont', firstNames: 'Jean', address: '12 rue de la Mer, 30000 Nîmes',
      birthDate: '1988-06-07', birthPlace: 'Limoges',
    },
    dividends: [{ date: '2026-03-16', usd: 145.2, withheld: 21.78, usdEur: 0.8696 }],
  };
  const template = await readFile(new URL('../extension/vendor/2778-div-sd.pdf', import.meta.url));
  const bytes = await buildPdf(PDFLib, decl, computeTax(decl.dividends), template);
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 3);
  // Kept for visual inspection.
  if (process.env.PDF_OUT) await writeFile(process.env.PDF_OUT, bytes);
});

test('covers the printed CSG rate for income before 2026', async () => {
  const decl = {
    month: '2025-09',
    declarationDate: '2025-10-01',
    profile: { lastName: 'Dupont', firstNames: 'Jean', address: 'Nîmes', birthDate: '1988-06-07', birthPlace: 'Limoges' },
    dividends: [{ date: '2025-09-15', usd: 480.4, withheld: 72.06, usdEur: 0.8499 }],
  };
  const template = await readFile(new URL('../extension/vendor/2778-div-sd.pdf', import.meta.url));
  const bytes = await buildPdf(PDFLib, decl, computeTax(decl.dividends), template);
  if (process.env.PDF_OUT_2025) await writeFile(process.env.PDF_OUT_2025, bytes);
});

test('embeds the signature image', async () => {
  // A 1×1 PNG.
  const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const decl = {
    month: '2026-09',
    declarationDate: '2026-10-09',
    profile: { lastName: 'Dupont', firstNames: 'Jean', address: 'Nîmes', birthDate: '1988-06-07', birthPlace: 'Limoges', signature },
    dividends: [{ date: '2026-09-14', usd: 524.09, withheld: 78.61, usdEur: 0.8657 }],
  };
  const template = await readFile(new URL('../extension/vendor/2778-div-sd.pdf', import.meta.url));
  const withSignature = await buildPdf(PDFLib, decl, computeTax(decl.dividends), template);
  const without = await buildPdf(PDFLib, { ...decl, profile: { ...decl.profile, signature: undefined } }, computeTax(decl.dividends), template);
  assert.ok(withSignature.length > without.length);
});
