import { annualReturn, computeTax, deadline, ratesFor } from './lib/tax.js';
import { ecbRate } from './lib/ecb.js';
import { amount, buildPdf, frDate, monthLabel } from './lib/pdf.js';
import { translate } from './lib/i18n.js';
import { initialStatuses, statusOf } from './lib/reminders.js';
import { BUNDLED_FORM_YEAR } from './lib/form-version.js';

const $ = (sel) => document.querySelector(sel);
const today = () => new Date().toISOString().slice(0, 10);

// Persisted in chrome.storage.local. The content script on Morgan Stanley at
// Work appends to `dividends`.
let profile = {};
let dividends = []; // [{ date, usd, withheld, usdEur, rateDate, source }]
let statuses = {}; // { 'YYYY-MM': 'todo' | 'sent' | 'paid' }
let form1042 = {}; // { 'YYYY': US tax withheld in USD, from the 1042-S form }
let lang = 'fr';
let formCheck = null; // { time, latestYear }, from the background worker.
let month = today().slice(0, 7); // The selected declaration, 'YYYY-MM'.

const t = (key, vars) => translate(lang, key, vars);
const save = () => chrome.storage.local.set({ profile, dividends, statuses, form1042, lang });

const ofYear = (y) => dividends.filter((d) => d.date?.startsWith(y) && d.usd > 0);

// A declaration covers the dividends received in one month.
const ofMonth = (m) => dividends.filter((d) => d.date?.startsWith(m) && d.usd > 0);

// The tax of month `m`, or null while a rate is missing.
function taxOf(m) {
  const ready = ofMonth(m);
  if (!ready.length || ready.some((d) => !d.usdEur)) return null;
  return computeTax(ready, { impatrie: profile.impatrie });
}

// The declaration of month `m` and its blockers.
function declaration(m = month) {
  const errors = [];
  if (!ofMonth(m).length) errors.push(t('selectDividend'));
  const tax = taxOf(m);
  if (ofMonth(m).length && !tax) errors.push(t('waitingRate'));
  if (!$('#profile').checkValidity()) errors.push(t('fillProfile'));
  if (errors.length) return { errors };
  return { decl: { month: m, profile, dividends: ofMonth(m), declarationDate: today() }, tax };
}

// Static texts of the page, in the current language.
function renderTexts() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  $('#signature-preview').alt = t('signatureAlt');
  $('#chart').setAttribute('aria-label', t('chartLabel'));
  const banner = $('#form-update');
  banner.hidden = !(formCheck?.latestYear > BUNDLED_FORM_YEAR);
  if (!banner.hidden) banner.textContent = t('formUpdate', { year: formCheck.latestYear, bundled: BUNDLED_FORM_YEAR });
}

function renderDividends() {
  const tbody = $('#dividends tbody');
  if (!dividends.length) {
    tbody.innerHTML = `<tr><td colspan="16" class="hint">${t('noDividend')}</td></tr>`;
    return;
  }
  // Most recent first.
  const rows = [...dividends].sort((a, b) => b.date.localeCompare(a.date));
  tbody.replaceChildren(...rows.map((d) => {
    const tr = document.createElement('tr');
    const m = d.date.slice(0, 7);
    const tax = taxOf(m);
    tr.classList.toggle('selected', m === month);
    const rate = d.error ? `<span class="error">${d.error}</span>` : d.usdEur ? amount(d.usdEur, 4) : '…';
    const cell = (value, strong) => `<td class="num">${tax ? (strong ? `<b>${amount(value)}</b>` : amount(value)) : ''}</td>`;
    const pdfReady = tax && $('#profile').checkValidity();
    const status = statusOf(statuses, m);
    const late = status === 'todo' && deadline(m) < today();
    tr.innerHTML = `
      <td><button type="button" class="pdf" ${pdfReady ? '' : 'disabled'}
        title="${pdfReady ? t('downloadPdf') : tax ? t('fillProfileFirst') : ''}">PDF</button></td>
      <td><select class="status ${late ? 'late' : status}" title="${late ? t('late') : ''}">
        ${['todo', 'sent', 'paid'].map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${s === 'todo' && late ? t('late') : t(s)}</option>`).join('')}
      </select></td>
      <td class="num">${frDate(d.date)}</td>
      <td class="num">${amount(d.usd, 2)} $</td>
      <td class="num">${amount(d.withheld ?? 0, 2)} $</td>
      <td class="num" title="${d.rateDate ? t('ecbRateOf', { date: frDate(d.rateDate) }) : ''}">${rate}</td>
      <td class="num">${d.usdEur ? `${amount(d.usd * d.usdEur, 2)} €` : ''}</td>
      <td class="num">${amount(ratesFor(d.date).csg * 100, 1)} %</td>
      ${cell(tax?.IK)}${cell(tax?.IL)}${cell(tax?.PQ)}${cell(tax?.PV)}${cell(tax?.PG)}${cell(tax?.PT)}${cell(tax?.QR, true)}
      <td class="num">${frDate(deadline(m))}</td>`;
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button, select') || m === month) return;
      month = m;
      update();
    });
    tr.querySelector('.pdf').addEventListener('click', () => downloadPdf(m));
    tr.querySelector('.status').addEventListener('change', (e) => {
      statuses[m] = e.target.value;
      update();
    });
    return tr;
  }));
}

// Where each month's dividends go, bottom to top: what is kept, then each tax.
const SHARES = [
  ['keep', () => t('keep')],
  ['us', () => t('usWithholding')],
  ['IL', () => 'Prélèvement 12,8 %'],
  ['PQ', () => 'CSG'],
  ['PV', () => 'CRDS'],
  ['PG', () => 'Solidarité'],
];

// Stacked bar chart: one bar per declaration (month), split by SHARES.
function renderChart() {
  const months = [...new Set(dividends.map((d) => d.date.slice(0, 7)))].sort();
  const data = months.map((m) => ({ month: m, tax: taxOf(m), dividends: ofMonth(m) }))
    .filter((r) => r.tax)
    .map((r) => {
      const gross = r.dividends.reduce((sum, d) => sum + d.usd * d.usdEur, 0);
      const us = r.dividends.reduce((sum, d) => sum + (d.withheld ?? 0) * d.usdEur, 0);
      const { IL, PQ, PV, PG } = r.tax;
      return { ...r, gross, values: { keep: gross - us - IL - PQ - PV - PG, us, IL, PQ, PV, PG } };
    });
  const svg = $('#chart');
  const tip = $('#chart-tip');
  svg.parentElement.hidden = !data.length;
  if (!data.length) return;

  $('#chart-legend').innerHTML = SHARES.map(([, label], i) =>
    `<span><i style="background: var(--series-${i + 1})"></i>${label()}</span>`).join('');

  const W = 960, H = 170, TOP = 22, BOTTOM = 24, LEFT = 48, RIGHT = 8, GAP = 2;
  // Round the axis up to a multiple of half a power of ten (e.g. 453 → 500).
  const peak = Math.max(...data.map((r) => r.gross));
  const step = 10 ** Math.floor(Math.log10(peak)) / 2;
  const max = Math.ceil(peak / step) * step;
  const y = (v) => TOP + (H - TOP - BOTTOM) * (1 - v / max);
  const band = (W - LEFT - RIGHT) / data.length;
  const barW = Math.min(40, band * 0.6);
  const every = Math.ceil(data.length / 12); // At most 12 date labels.

  const grid = [0, max / 2, max].map((v) => `
    <line class="grid" x1="${LEFT}" x2="${W - RIGHT}" y1="${y(v)}" y2="${y(v)}"/>
    <text x="${LEFT - 8}" y="${y(v) + 4}" text-anchor="end">${amount(v)} €</text>`).join('');
  const bars = data.map((r, i) => {
    const x = LEFT + band * i + (band - barW) / 2;
    const selected = r.month === month;
    let below = 0;
    const segments = SHARES.map(([key], k) => {
      const value = Math.max(0, r.values[key]);
      const bottom = y(below) - (k ? GAP / 2 : 0);
      below += value;
      const last = k === SHARES.length - 1;
      const top = y(below) + (last ? 0 : GAP / 2);
      const fill = `var(--series-${k + 1})`;
      if (!last) return `<rect x="${x}" y="${top}" width="${barW}" height="${Math.max(0, bottom - top)}" fill="${fill}"/>`;
      // The top segment has rounded corners.
      const rad = Math.min(4, Math.max(0, bottom - top));
      return `<path fill="${fill}" d="M${x},${bottom} V${top + rad} Q${x},${top} ${x + rad},${top}
        H${x + barW - rad} Q${x + barW},${top} ${x + barW},${top + rad} V${bottom} Z"/>`;
    }).join('');
    const [yy, mm] = r.month.split('-');
    return `
      ${selected ? `<rect class="selected-band" x="${LEFT + band * i}" y="${TOP - 18}" width="${band}" height="${H - TOP - BOTTOM + 18}" rx="8"/>` : ''}
      ${segments}
      ${selected ? `<text class="value" x="${x + barW / 2}" y="${y(r.gross) - 6}" text-anchor="middle">${amount(r.gross)} €</text>` : ''}
      ${i % every === 0 ? `<text x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${mm}/${yy.slice(2)}</text>` : ''}
      <rect class="hit" data-i="${i}" x="${LEFT + band * i}" y="${TOP}" width="${band}" height="${H - TOP - BOTTOM}"/>`;
  }).join('');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = grid + bars;

  svg.querySelectorAll('.hit').forEach((hit) => {
    const i = Number(hit.dataset.i);
    const r = data[i];
    hit.addEventListener('mouseenter', () => {
      const scale = svg.clientWidth / W;
      tip.innerHTML = `<b>${monthLabel(r.month)} · ${amount(r.gross, 2)} €</b>`
        + SHARES.map(([key, label], k) =>
          `<br><i class="swatch" style="background: var(--series-${k + 1})"></i>${label()}: ${amount(r.values[key], 2)} €`).reverse().join('');
      tip.style.left = `${(LEFT + band * (i + 0.5)) * scale}px`;
      tip.style.top = `${(y(r.gross) - 8) * scale}px`;
      tip.hidden = false;
    });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
    hit.addEventListener('click', () => {
      month = r.month;
      update();
    });
  });
}

// Boxes of the annual income tax return, one column per year of income.
function renderAnnual() {
  const years = [...new Set(dividends.map((d) => d.date.slice(0, 4)))].sort().reverse();
  const returns = years.map((year) => {
    const months = [...new Set(ofYear(year).map((d) => d.date.slice(0, 7)))];
    const declarations = months.map((m) => ({ dividends: ofMonth(m), tax: taxOf(m) }));
    return declarations.every((r) => r.tax) ? annualReturn(declarations, { impatrie: profile.impatrie }) : null;
  });
  const v = (f) => returns.map((r) => `<td class="num">${r ? f(r) : '…'}</td>`).join('');
  const eur = (key) => v((r) => `${amount(r[key])}`);
  // To add to the amounts pre-filled by French banks.
  const plus = (f) => v((r) => `+ ${amount(f(r))}`);
  const group = (title) => `<tr class="group"><th colspan="${years.length + 2}">${title}</th></tr>`;
  const row = (box, label, cells) => `<tr><td class="box">${box}</td><td>${label}</td>${cells}</tr>`;
  const thisYear = today().slice(0, 4);
  // 8PL appears on the forms for income 2025 onward.
  const from2025 = (key) => returns.map((r, i) =>
    `<td class="num">${!r ? '…' : years[i] < '2025' ? '–' : amount(r[key])}</td>`).join('');
  // US tax withheld per year, in USD: as computed, and from the 1042-S form.
  const withheldUsd = years.map((y) => ofYear(y).reduce((sum, d) => sum + (d.withheld ?? 0), 0));
  const check1042 = years.map((y, i) => {
    if (form1042[y] === undefined) return '<td></td>';
    const diff = form1042[y] - withheldUsd[i];
    return Math.abs(diff) < 0.01
      ? `<td class="num ok">${t('matches')}</td>`
      : `<td class="num error">${t('differs', { amount: amount(diff, 2) })}</td>`;
  }).join('');
  const f = t('form');
  const impatrie = !!profile.impatrie;
  $('#annual').innerHTML = `
    <thead><tr><th>${t('box')}</th><th></th>${years.map((y) => `<th class="right">${t('income', { year: y })}<small>
      ${y === thisYear ? t('inProgress') : t('declareIn', { year: Number(y) + 1 })}</small></th>`).join('')}</tr></thead>
    <tbody>
      ${group(`${f} 2047 · 20. Dividendes ouvrant droit à un crédit d’impôt égal à l’impôt payé à l’étranger`)}
      ${row('202', 'Pays d’encaissement ou d’origine', v(() => 'États-Unis'))}
      ${row('203', 'Montant net encaissé', eur('net'))}
      ${row('204', 'Taux applicable', v(() => '17,6 %'))}
      ${row('205', 'Résultat (203 × 204)', eur('capped'))}
      ${row('206', 'Impôt supporté à l’étranger', eur('withheld'))}
      ${row('207', 'Crédit d’impôt retenu (le plus petit de 205 et 206)', eur('credit'))}
      ${row('208', 'Revenus crédit d’impôt inclus (203 + 207)', v((r) => amount(r.net + r.credit)))}
      ${row('221', 'Total des dividendes imposables', v((r) => amount(r.net + r.credit)))}
      ${row('222', 'dont éligibles à l’abattement de 40 % → 2DC', v((r) => amount(r.net + r.credit)))}
      ${group(`${f} 2047 · 270. Divers`)}
      ${row('272', 'Revenus déjà soumis aux prélèvements sociaux → 2BH', eur('gross'))}
      ${row('273', 'Prélèvement forfaitaire non libératoire déjà versé → 2CK', eur('prelevement'))}
      ${impatrie ? row('275', 'Impatriés : fraction exonérée (50 %) crédit d’impôt inclus → 2DM', eur('exempt')) : ''}
      ${impatrie ? row('276', 'Crédit d’impôt étranger sur la fraction exonérée des impatriés', eur('exemptCredit')) : ''}
      ${group(`${f} 2047 · 7. Crédit d’impôt égal à l’impôt étranger (cadre 70)`)}
      ${row('', 'Dividendes – impôt étranger retenu (report ligne 207)', eur('credit'))}
      ${impatrie ? row('', 'Revenus des impatriés (report ligne 276)', eur('exemptCredit')) : ''}
      ${row('', 'Montant total reporté sur la 2042 C → 8VL', v((r) => amount(r.credit + r.exemptCredit)))}
      ${row('', 'Revenus nets ouvrant droit à crédit d’impôt étranger → 8PL', from2025('gross'))}
      ${group(`${f} 2042 · 2. Revenus de capitaux mobiliers`)}
      ${row('2DC', 'Revenus des actions et parts (revenu brut)', plus((r) => r.gross - r.exempt))}
      ${row('2BH', 'Revenus déjà soumis aux prélèvements sociaux', plus((r) => r.gross))}
      ${row('2CK', 'Prélèvement forfaitaire non libératoire déjà versé', plus((r) => r.prelevement))}
      ${group(`${f} 2042 C · 2. / 8. (${t('online2042')})`)}
      ${impatrie ? row('2DM', 'Impatriés : revenus de capitaux mobiliers exonérés (50 %)', eur('exempt')) : ''}
      ${row('8PL', 'Revenus de capitaux mobiliers nets étrangers', from2025('gross'))}
      ${row('8VL', 'Impôt payé à l’étranger sur ces revenus', v((r) => amount(r.credit + r.exemptCredit)))}
      ${group(t('check1042'))}
      ${row('', t('computed15'), withheldUsd.map((w) => `<td class="num">${amount(w, 2)} $</td>`).join(''))}
      ${row('', t('box7a'), years.map((y) => `<td class="num"><input class="usd" type="number" step="0.01" min="0"
        data-year="${y}" value="${form1042[y] ?? ''}" placeholder="—"></td>`).join(''))}
      <tr><td></td><td></td>${check1042}</tr>
    </tbody>`;
  $('#annual').querySelectorAll('input.usd').forEach((input) => input.addEventListener('change', () => {
    if (input.value === '') delete form1042[input.dataset.year];
    else form1042[input.dataset.year] = Number(input.value);
    update();
  }));
}

async function fetchRate(d) {
  Object.assign(d, { usdEur: undefined, rateDate: undefined, error: undefined });
  const date = d.date;
  try {
    const rate = await ecbRate(date);
    if (d.date === date) Object.assign(d, rate);
  } catch (e) {
    d.error = e.message;
  }
  update();
}

// The message for the selected declaration. It is always in French.
function renderMessage({ decl, tax, errors }) {
  $('#copy-message').disabled = !decl;
  if (errors) {
    $('#message-status').textContent = errors.join(' ');
    $('#message').value = '';
    $('#wire-ref').textContent = '';
    return;
  }
  const due = deadline(decl.month);
  $('#message-status').textContent = t('messageStatus', { month: monthLabel(decl.month), date: frDate(due) });
  const name = `${profile.firstNames} ${profile.lastName.toUpperCase()}`;
  $('#message').value = `Objet : Déclaration 2778-DIV-SD – revenus de ${monthLabel(decl.month)}

Bonjour,

Veuillez trouver ci-joint ma déclaration n° 2778-DIV-SD relative aux dividendes de source étrangère (Alphabet Inc.) encaissés en ${monthLabel(decl.month)}, pour un montant à payer de ${amount(tax.QR)} €.

Je vous remercie par avance.

Cordialement,
${name}`;
  $('#wire-ref').textContent = `${profile.lastName.toUpperCase()} - 2778 - ${monthLabel(decl.month).toUpperCase()}`;
}

function update() {
  save();
  renderTexts();
  renderChart();
  renderDividends();
  renderAnnual();
  renderMessage(declaration());
}

document.querySelectorAll('[data-lang]').forEach((button) => button.addEventListener('click', () => {
  lang = button.dataset.lang;
  update();
}));

$('#profile').addEventListener('input', (e) => {
  const input = e.target;
  if (!input.name) return; // The signature file is handled below.
  profile[input.name] = input.type === 'checkbox' ? input.checked : input.value;
  update();
});

// Turns an image file into a PNG data URL for the PDF: at most 600px wide,
// with its white background made transparent.
async function signaturePng(file) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 600 / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 220 && d[i + 1] > 220 && d[i + 2] > 220) d[i + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

function renderSignature() {
  $('#signature-preview').hidden = !profile.signature;
  $('#signature-remove').hidden = !profile.signature;
  if (profile.signature) $('#signature-preview').src = profile.signature;
}

$('#signature-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  profile.signature = await signaturePng(file);
  e.target.value = '';
  renderSignature();
  update();
});

$('#signature-remove').addEventListener('click', () => {
  delete profile.signature;
  renderSignature();
  update();
});

async function downloadPdf(m) {
  const { decl, tax } = declaration(m);
  const template = await (await fetch('vendor/2778-div-sd.pdf')).arrayBuffer();
  const bytes = await buildPdf(window.PDFLib, decl, tax, template);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = `2778-DIV-SD-${decl.month}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#copy-message').addEventListener('click', () => navigator.clipboard.writeText($('#message').value));

// The background worker updates the form check and the content script the
// dividends while the page is open.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.formCheck) {
    formCheck = changes.formCheck.newValue;
    renderTexts();
  }
});

const saved = await chrome.storage.local.get(['profile', 'dividends', 'statuses', 'form1042', 'lang', 'formCheck']);
profile = saved.profile ?? {};
// Rows without a date are blank rows left by older versions.
dividends = (saved.dividends ?? []).filter((d) => d.date);
statuses = saved.statuses ?? initialStatuses(dividends, today());
form1042 = saved.form1042 ?? {};
lang = saved.lang ?? 'fr';
formCheck = saved.formCheck ?? null;
// Select the latest dividend, and fetch the rates of the dividends imported
// from Morgan Stanley.
const dated = [...dividends].sort((a, b) => a.date.localeCompare(b.date));
if (dated.length) month = dated.at(-1).date.slice(0, 7);
dated.filter((d) => !d.usdEur).forEach(fetchRate);
renderSignature();
for (const input of $('#profile').elements) {
  if (!input.name) continue;
  if (input.type === 'checkbox') input.checked = !!profile[input.name];
  else input.value = profile[input.name] ?? '';
}
update();
