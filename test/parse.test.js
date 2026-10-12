import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../extension/content/parse.js';

const { parseDate, parseUsd } = globalThis.DividendesGoogParse;

test('parses the API dates', () => {
  assert.equal(parseDate('2026-09-14'), '2026-09-14');
  assert.equal(parseDate('2026-09-14T00:00:00Z'), '2026-09-14');
  assert.equal(parseDate('14 septembre 2026'), null);
});

test('parses US dollar amounts in both languages', () => {
  for (const [text, usd] of [
    ['Vous avez reçu un dividende de 524,09$US', 524.09],
    ['dividende de 1 234,56 $US', 1234.56],
    ['You received a dividend of $524.09', 524.09],
    ['You received a dividend of US$1,234.56', 1234.56],
    ['Dividend of 1,234.56 USD', 1234.56],
    ['$ 87.5', 87.5],
    ['1.234 USD', 1234],
  ]) assert.equal(parseUsd(text), usd, text);
  assert.equal(parseUsd('Vous avez transféré 100% des espèces'), null);
});
