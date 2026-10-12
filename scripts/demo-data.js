// Stands in for chrome.storage with made-up data, to render the extension page
// for the screenshots (scripts/images.py). Nothing here is real.
// Query parameter: ?lang=fr|en.

const params = new URLSearchParams(location.search);
const usd = [
  ['2024-06-17', 388.40], ['2024-09-16', 392.75], ['2024-12-16', 401.10], ['2025-03-17', 455.20],
  ['2025-06-16', 462.85], ['2025-09-15', 470.30], ['2025-12-15', 478.90], ['2026-03-16', 521.40],
  ['2026-06-15', 530.15], ['2026-09-14', 538.60],
];
const state = {
  lang: params.get('lang') ?? 'en',
  profile: {
    lastName: 'Dupont', firstNames: 'Jean', address: '12 rue de la Mer, 30000 Nîmes',
    birthDate: '1988-06-07', birthPlace: 'Limoges',
  },
  dividends: usd.map(([date, amount]) => ({ date, usd: amount, withheld: Math.round(amount * 15) / 100 })),
  statuses: Object.fromEntries(usd.slice(0, -1).map(([date]) => [date.slice(0, 7), 'paid'])),
  form1042: { 2025: 280.10 },
};

window.chrome = {
  storage: {
    onChanged: { addListener() {} },
    local: { get: async () => structuredClone(state), set: async () => {} },
  },
};

// Once the page has rendered and fetched the exchange rates, writes the
// position of each section, read back by scripts/images.py with --dump-dom.
setTimeout(() => {
  const offsets = Object.fromEntries([...document.querySelectorAll('section > h2[data-i18n]')]
    .map((h2) => [h2.dataset.i18n, Math.round(h2.closest('section').getBoundingClientRect().top + scrollY)]));
  document.body.dataset.offsets = JSON.stringify(offsets);
}, 4000);
