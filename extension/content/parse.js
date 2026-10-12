// Parsing of the dates and amounts of the Morgan Stanley at Work API, whose
// texts are in French or English. Loaded before content/morgan-stanley-main.js,
// which uses its global; also imported by the tests.

(() => {
  // The API's dates: "2026-09-14" or "2026-09-14T00:00:00Z" → "2026-09-14".
  const parseDate = (text) => String(text ?? '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

  // The US dollar amount of a text, the currency written before or after it:
  // "524,09$US", "1 234,56 $US", "$524.09", "US$ 1,234.56", "524.09 USD".
  function parseUsd(text) {
    const s = String(text ?? '');
    const number = '(\\d[\\d\\s\\u00a0\\u202f.,]*\\d|\\d)';
    const m = s.match(new RegExp(`${number}\\s*(?:\\$\\s*US|US\\$|USD|\\$)`))
      ?? s.match(new RegExp(`(?:US\\$|USD|\\$)\\s*${number}`));
    if (!m) return null;
    let n = m[1].replace(/[\s\u00a0\u202f]/g, '');
    // A last separator followed by 1 or 2 digits is the decimal one; others
    // separate thousands ("1,234.56", "1 234,56", "1.234").
    const d = n.match(/[.,](\d{1,2})$/);
    n = d ? n.slice(0, -d[0].length).replace(/[.,]/g, '') + '.' + d[1] : n.replace(/[.,]/g, '');
    const value = Number(n);
    return value > 0 ? value : null;
  }

  globalThis.DividendesGoogParse = { parseDate, parseUsd };
})();
