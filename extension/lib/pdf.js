// Fills the official 2778-DIV-SD form (cerfa n°12568*14, 2026 edition) and
// appends a page detailing the dividends. The form has no fillable fields:
// values are printed at the positions of its boxes.
// `PDFLib` is passed in: window.PDFLib in the extension, the npm module in tests.

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const monthLabel = (month) => {
  const [y, m] = month.split('-');
  return `${MONTHS[m - 1]} ${y}`;
};

export const frDate = (iso) => iso.split('-').reverse().join('/');

// French number format with a plain space as thousands separator (the
// standard PDF fonts have no narrow no-break space).
export const amount = (x, decimals = 0) => {
  const [int, dec] = x.toFixed(decimals).split('.');
  return int.replace(/\B(?=(\d{3})+$)/g, ' ') + (dec ? `,${dec}` : '');
};

// Page height of the form, to convert from the top-origin coordinates
// measured on it (`pdftotext -bbox`) to PDF coordinates.
const H = 841.89;

// Bottom edges (from the top) of the boxes of the form, measured on a 288 dpi
// rendering. Every box is 14pt tall.
const BOX_HEIGHT = 14;
const PAGE1 = {
  month: 231.75, name: 285.75, lastName: 303.75, address: 321.75, birth: 339.5,
  toPay: 513.25, date: 598,
};
const PAGE2 = { IL: 147.75, EA: 226, PQ: 364, PV: 382, PF: 399.75, PG: 417.75, PT: 435.5, QR: 472 };
// Horizontal positions, in points.
const X = {
  wideBox: 330, // Text start in the right-column boxes (box starts at 324).
  addressBox: 184, // Box starts at 178.
  baseRight: 355, // Right edge of the text in the "base imposable" column.
  valueRight: 501, // Right edge of the text in the "impôt / montant dû" column.
};
// Boxes split in 8 cells, DD MM YYYY: cell boundaries (box edges and ticks).
const COMB = {
  birth: [178, 190, 205.8, 221.4, 237.1, 252.9, 268.6, 284.4, 301],
  date: [176, 190.5, 206.2, 222, 237.8, 253.5, 269.2, 285, 299],
};
// The "Virement" checkbox: center.
const WIRE = { x: 181.4, y: 545.8 };
// The signature box (top-origin).
const SIGNATURE = { x: 178, top: 604.25, width: 365.2, height: 54 };
// Helvetica's cap height, per point of font size.
const CAP = 0.718;

// The CSG rate printed on the 2026 form, and its box (top-origin).
const PRINTED_CSG = 0.106;
const CSG_RATE_BOX = { x: 371.6, top: 351.8, width: 34.6, height: 12.4 };

// `decl.profile.signature`: optional, a PNG data URL.
// `decl`: { month, profile, dividends: [{ date, usd, withheld, usdEur }],
//           declarationDate }. `tax`: the result of computeTax().
// `template`: the bytes of vendor/2778-div-sd.pdf.
export async function buildPdf(PDFLib, decl, tax, template) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.load(template);
  doc.setTitle(`2778-DIV-SD – ${monthLabel(decl.month)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0, 0.1, 0.45);
  const [page1, page2] = doc.getPages();

  // `top`: the baseline, from the top of the page.
  const text = (page, s, x, top, { f = font, size = 10, align = 'left', color = ink } = {}) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y: H - top, size, font: f, color });
  };
  // Text vertically centered in the box whose bottom edge is at `bottom`.
  const inBox = (page, s, x, bottom, options = {}) =>
    text(page, s, x, bottom - (BOX_HEIGHT - CAP * (options.size ?? 10)) / 2, options);
  // One character per cell of a comb box.
  const comb = (page, digits, cells, bottom) => [...digits].forEach((c, i) =>
    inBox(page, c, (cells[i] + cells[i + 1]) / 2, bottom, { align: 'center' }));
  const ddmmyyyy = (iso) => iso.split('-').reverse().join('');

  // Page 1.
  const p = decl.profile;
  inBox(page1, monthLabel(decl.month), X.wideBox, PAGE1.month);
  inBox(page1, `${p.lastName.toUpperCase()} ${p.firstNames}`, X.wideBox, PAGE1.name);
  inBox(page1, p.lastName.toUpperCase(), X.wideBox, PAGE1.lastName);
  inBox(page1, p.address, X.addressBox, PAGE1.address);
  comb(page1, ddmmyyyy(p.birthDate), COMB.birth, PAGE1.birth);
  inBox(page1, p.birthPlace, X.wideBox, PAGE1.birth);
  inBox(page1, `${amount(tax.QR)} €`, X.wideBox, PAGE1.toPay, { f: bold });
  text(page1, 'X', WIRE.x, WIRE.y + CAP * 10 / 2, { f: bold, align: 'center' });
  comb(page1, ddmmyyyy(decl.declarationDate), COMB.date, PAGE1.date);
  // Signature image (PNG data URL), fitted in its box with a small margin.
  if (p.signature) {
    const image = await doc.embedPng(p.signature);
    const b = SIGNATURE;
    const scale = Math.min((b.width - 12) / image.width, (b.height - 8) / image.height);
    page1.drawImage(image, {
      x: b.x + 6, y: H - b.top - b.height + 4, width: image.width * scale, height: image.height * scale,
    });
  }

  // Page 2.
  const line = (code, value, base) => {
    if (base !== undefined) inBox(page2, amount(base), X.baseRight, PAGE2[code], { align: 'right' });
    inBox(page2, amount(value), X.valueRight, PAGE2[code], { align: 'right', f: code === 'QR' ? bold : font });
  };
  line('IL', tax.IL, tax.IK);
  line('EA', tax.EA);
  line('PQ', tax.PQ, tax.socialBase);
  line('PV', tax.PV, tax.socialBase);
  line('PF', tax.PF);
  line('PG', tax.PG, tax.socialBase);
  line('PT', tax.PT);
  line('QR', tax.QR);
  // Income received before 2026 has another CSG rate than the printed one.
  if (tax.rates.csg !== PRINTED_CSG) {
    const b = CSG_RATE_BOX;
    page2.drawRectangle({ x: b.x, y: H - b.top - b.height, width: b.width, height: b.height, color: rgb(0.988, 0.98, 0.925) });
    text(page2, `x ${amount(tax.rates.csg * 100, 1)} %`, b.x + 1.5, b.top + 9.5, { f: bold, size: 8.5 });
  }

  // Page 3: details of the dividends.
  const page3 = doc.addPage([595.28, H]);
  const grey = rgb(0.42, 0.44, 0.48);
  const blue = rgb(0.29, 0.42, 0.55);
  const black = { color: rgb(0.1, 0.1, 0.12) };
  const L = 28.35;
  const R = 567;
  let top = 60;
  text(page3, 'ANNEXE – DÉTAIL DES REVENUS DISTRIBUÉS', L, top, { f: bold, size: 9, color: blue });
  page3.drawLine({ start: { x: L, y: H - top - 6 }, end: { x: R, y: H - top - 6 }, thickness: 0.8, color: blue });
  top += 24;
  text(page3, `Dividendes Alphabet Inc. (GOOG) encaissés en ${monthLabel(decl.month)} – ${p.firstNames} ${p.lastName.toUpperCase()}`, L, top, black);
  top += 26;
  const C = { date: L, usd: 200, withheld: 300, rate: 420, eur: R };
  const head = { size: 7.5, color: grey };
  text(page3, 'DATE DE PAIEMENT', C.date, top, head);
  text(page3, 'BRUT (USD)', C.usd, top, { ...head, align: 'right' });
  text(page3, 'RETENUE US (USD)', C.withheld, top, { ...head, align: 'right' });
  text(page3, '1 USD EN EUR (BCE)', C.rate, top, { ...head, align: 'right' });
  text(page3, 'BRUT (EUR)', C.eur, top, { ...head, align: 'right' });
  top += 18;
  for (const d of decl.dividends) {
    text(page3, frDate(d.date), C.date, top, black);
    text(page3, amount(d.usd, 2), C.usd, top, { ...black, align: 'right' });
    text(page3, amount(d.withheld ?? 0, 2), C.withheld, top, { ...black, align: 'right' });
    text(page3, amount(d.usdEur, 4), C.rate, top, { ...black, align: 'right' });
    text(page3, amount(d.usd * d.usdEur, 2), C.eur, top, { ...black, align: 'right' });
    top += 16;
  }
  page3.drawLine({ start: { x: L, y: H - top + 10 }, end: { x: R, y: H - top + 10 }, thickness: 0.5, color: grey });
  top += 6;
  text(page3, 'Base imposable (IK + EA), arrondie à l’euro', L, top, black);
  text(page3, `${amount(tax.socialBase)} €`, C.eur, top, { ...black, f: bold, align: 'right' });
  top += 24;
  for (const note of [
    'Conversion au taux de référence de la Banque centrale européenne du jour du paiement.',
    'La retenue à la source américaine sera imputée lors de la déclaration annuelle des revenus (formulaire n° 2047).',
  ]) {
    text(page3, note, L, top, { size: 8, color: grey });
    top += 12;
  }

  return doc.save();
}
