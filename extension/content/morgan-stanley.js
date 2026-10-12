// Saves the dividends found on Morgan Stanley at Work by
// content/morgan-stanley-main.js, which reads them from the site's own API.

// US withholding at the treaty rate (W-8BEN). The dashboard only shows the
// gross amount.
const US_WITHHOLDING = 0.15;

// Saves run one after the other, so that none overwrites another's.
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
