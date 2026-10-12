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

  // Shared with content/morgan-stanley.js, from content/parse.js.
  const { parseDate, parseUsd } = globalThis.DividendesGoogParse;

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
