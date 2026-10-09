// Saves the dividends found on Morgan Stanley at Work for the extension page:
// - the whole history, sent by content/morgan-stanley-main.js;
// - as a fallback, the dashboard's "Évènements passés" panel, which only keeps
//   the ~10 most recent events. Expects the site in French:
//   Dividende
//   14 septembre 2026
//   GOOG - NASDAQ
//   Vous avez reçu un dividende de 524,09$US

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// US withholding at the treaty rate (W-8BEN). The dashboard only shows the
// gross amount.
const US_WITHHOLDING = 0.15;

// "14 septembre 2026" → "2026-09-14".
function parseDate(text) {
  const m = text?.match(/^(\d{1,2})(?:er)? (\S+) (\d{4})$/);
  const month = m && MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// "1 234,56" → 1234.56.
const parseAmount = (text) => Number(text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));

function scan() {
  const lines = document.body.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
  const found = [];
  lines.forEach((line, i) => {
    if (line !== 'Dividende') return;
    const date = parseDate(lines[i + 1]);
    const amount = lines.slice(i + 2, i + 4).join(' ').match(/dividende de ([\d\s\u00a0\u202f.,]+)\s*\$US/);
    if (date && amount) found.push({ date, usd: parseAmount(amount[1]) });
  });
  return found;
}

// Both sources may report at once: saves run one after the other so that
// neither overwrites the other's.
let saving = Promise.resolve();
const save = (found) => (saving = saving.then(() => saveNow(found)));

// The 2778-DIV-SD declaration is due on the 15th of the following month.
function deadline(date) {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10);
}

async function saveNow(found) {
  const { dividends = [], statuses = {} } = await chrome.storage.local.get(['dividends', 'statuses']);
  const fresh = found.filter((f) => !dividends.some((d) => d.date === f.date));
  if (!fresh.length) return;
  dividends.push(...fresh.map((f) => ({
    ...f,
    withheld: Math.round(f.usd * US_WITHHOLDING * 100) / 100,
    source: 'Morgan Stanley',
  })));
  // A dividend imported after its deadline was declared without the extension.
  const today = new Date().toISOString().slice(0, 10);
  for (const f of fresh) {
    const month = f.date.slice(0, 7);
    if (deadline(f.date) < today && !statuses[month]) statuses[month] = 'paid';
  }
  await chrome.storage.local.set({ dividends, statuses });
  console.log('[dividendes-goog] saved', fresh);
}

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'dividendes-goog') return;
  save(e.data.dividends.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.usd > 0));
});

// Tell content/morgan-stanley-main.js how far back the history is known.
chrome.storage.local.get('dividends').then(({ dividends = [] }) => {
  const latest = dividends.map((d) => d.date).filter(Boolean).sort().at(-1);
  if (latest) window.postMessage({ source: 'dividendes-goog-known', latest }, location.origin);
});

// Visible from the page, to check the extension is active.
document.documentElement.dataset.dividendesGoog = 'active';
console.log('[dividendes-goog] watching for dividends');

// The dashboard renders asynchronously: rescan once the DOM settles.
let timer;
new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const found = scan();
    if (found.length) save(found);
  }, 1000);
}).observe(document.body, { childList: true, subtree: true });
