// Runs in the page's own JavaScript world, before the app starts, to see the
// app's GraphQL requests. When the dashboard loads its "past events", the
// same request is replayed with earlier dates to walk back through the whole
// history, down to the latest dividend already saved. Dividends found are
// handed to content/morgan-stanley.js, which saves them for the extension.

(() => {
  const LOG = '[dividendes-goog]';
  const MAX_PAGES = 40;
  // Alphabet paid its first dividend in June 2024: no need to look earlier.
  const FIRST_DIVIDEND = '2024-06-01';
  const appFetch = window.fetch;
  let started = false;
  // The date of the latest dividend already saved, sent by
  // content/morgan-stanley.js: no need to look further back.
  let known = FIRST_DIVIDEND;
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.source === 'dividendes-goog-known' && e.data.latest > known) known = e.data.latest;
  });

  window.fetch = async function (input, init) {
    const response = await appFetch.apply(this, arguments);
    const url = typeof input === 'string' ? input : input?.url;
    if (!started && url?.includes('/graphql')
        && typeof init?.body === 'string' && init.body.includes('pastEvents')) {
      started = true;
      collect(url, init).catch((e) => console.warn(LOG, 'history scan failed:', e));
    }
    return response;
  };

  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  // ISO dates ("2026-09-14", "2026-09-14T00:00:00Z") or "14 septembre 2026".
  function parseDate(text) {
    const iso = String(text).match(/^\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];
    const m = String(text).match(/^(\d{1,2})(?:er)? (\S+) (\d{4})$/);
    const month = m && MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  }

  // "Vous avez reçu un dividende de 524,09$US" (or "1,234.56 USD").
  function parseUsd(text) {
    const m = String(text).match(/([\d\s  .,]*\d)\s*(?:\$\s*US|USD|US\$)/);
    if (!m) return null;
    let s = m[1].replace(/[\s  ]/g, '');
    // The last separator followed by exactly 2 digits is the decimal one.
    s = /[.,]\d{2}$/.test(s) ? s.slice(0, -3).replace(/[.,]/g, '') + '.' + s.slice(-2) : s.replace(/[.,]/g, '');
    return Number(s);
  }

  const isDividend = (event) => /dividend/i.test(`${event.type} ${event.title}`);

  async function collect(url, init) {
    const request = JSON.parse(init.body);
    const { signal, ...options } = init; // Not tied to the app's request lifetime.
    const seen = new Set();
    const dividends = new Map();
    let date = request.variables?.currentDate ?? new Date().toISOString().slice(0, 10);

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = JSON.stringify({ ...request, variables: { ...request.variables, currentDate: date } });
      const json = await (await appFetch(url, { ...options, body })).json();
      const events = json.data?.events?.pastEvents ?? [];
      const fresh = events.filter((e) => !seen.has(JSON.stringify(e)));
      fresh.forEach((e) => seen.add(JSON.stringify(e)));
      const dates = events.map((e) => parseDate(e.date)).filter(Boolean).sort();
      console.log(LOG, `page ${page}: ${events.length} events (${fresh.length} new), ${dates[0]} → ${dates.at(-1)}`);

      for (const e of fresh.filter(isDividend)) {
        const d = { date: parseDate(e.date), usd: parseUsd(e.description) ?? parseUsd(JSON.stringify(e)) };
        if (d.date && d.usd) dividends.set(d.date, d);
        else console.warn(LOG, 'unparsed dividend event:', e);
      }
      // The next page ends where this one started. Stop when nothing new
      // comes back: the server ignores the date or the history is exhausted.
      if (!fresh.length || !dates.length || dates[0] >= date || dates[0] < known) break;
      date = dates[0];
    }

    const found = [...dividends.values()];
    console.log(LOG, `history: ${found.length} dividends:`,
      found.map((d) => `${d.date} ${d.usd} USD`).sort().join(', '));
    window.postMessage({ source: 'dividendes-goog', dividends: found }, location.origin);
  }
})();
