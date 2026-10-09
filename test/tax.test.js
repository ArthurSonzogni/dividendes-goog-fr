import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annualReturn, computeTax, deadline } from '../extension/lib/tax.js';

test('matches the community spreadsheet example', () => {
  const tax = computeTax([{ date: '2026-03-16', usd: 145.2, usdEur: 0.8696 }]);
  assert.deepEqual(
    { IK: tax.IK, IL: tax.IL, EA: tax.EA, PQ: tax.PQ, PV: tax.PV, PF: tax.PF, PG: tax.PG, PT: tax.PT, QR: tax.QR },
    { IK: 126, IL: 16, EA: 0, PQ: 13, PV: 1, PF: 14, PG: 9, PT: 23, QR: 39 },
  );
});

test('impatrié: 50 % exempt from the 12.8 %, not from social contributions', () => {
  const tax = computeTax([{ date: '2026-03-16', usd: 145.2, usdEur: 0.8696 }], { impatrie: true });
  assert.equal(tax.IK, 63); // 126.27 / 2 = 63.13
  assert.equal(tax.EA, 63);
  assert.equal(tax.IL, 8);
  assert.equal(tax.socialBase, 126);
  assert.equal(tax.PT, 23);
  assert.equal(tax.QR, 31);
});

test('impatrié annual return splits the taxable and exempt halves', () => {
  const dividends = [{ date: '2025-09-15', usd: 1000, withheld: 150, usdEur: 1 }];
  const r = annualReturn([{ dividends, tax: computeTax(dividends, { impatrie: true }) }], { impatrie: true });
  assert.deepEqual(r, {
    gross: 1000, exempt: 500, withheld: 75, net: 425, capped: 75, credit: 75, exemptCredit: 75, prelevement: 64,
  });
});

test('sums several dividends before rounding', () => {
  const tax = computeTax([{ date: '2026-03-02', usd: 100.4, usdEur: 1 }, { date: '2026-03-16', usd: 100.4, usdEur: 1 }]);
  assert.equal(tax.IK, 201);
});

test('rounds halves up', () => {
  assert.equal(computeTax([{ date: '2026-03-16', usd: 100, usdEur: 1 }]).PV, 1); // 0.50
});

test('CSG is 9.2% before 2026', () => {
  const tax = computeTax([{ date: '2025-12-15', usd: 1000, usdEur: 1 }]);
  assert.equal(tax.PQ, 92);
  assert.equal(tax.PT, 92 + 5 + 75);
  assert.equal(computeTax([{ date: '2026-01-02', usd: 1000, usdEur: 1 }]).PQ, 106);
});

test('deadline is the 15th of the next month', () => {
  assert.equal(deadline('2026-03'), '2026-04-15');
  assert.equal(deadline('2026-12'), '2027-01-15');
});

test('annual return matches the community spreadsheet 2025 example', () => {
  const declarations = [
    [99.43, 14.91, 0.91582, '2025-03-17'],
    [107.22, 16.08, 0.8657, '2025-06-16'],
    [114.43, 17.16, 0.85007, '2025-09-15'],
    [122.32, 18.35, 0.85073, '2025-12-15'],
  ].map(([usd, withheld, usdEur, date]) => {
    const dividends = [{ date, usd, withheld, usdEur }];
    return { dividends, tax: computeTax(dividends) };
  });
  assert.deepEqual(annualReturn(declarations), { gross: 385, exempt: 0, withheld: 58, net: 327, capped: 58, credit: 58, exemptCredit: 0, prelevement: 49 });
});

test('annual credit is capped at 17.6% of the net amount', () => {
  const dividends = [{ date: '2025-03-17', usd: 1000, withheld: 300, usdEur: 1 }];
  const r = annualReturn([{ dividends, tax: computeTax(dividends) }]);
  assert.equal(r.net, 700);
  assert.equal(r.capped, 123);
  assert.equal(r.credit, 123);
});
