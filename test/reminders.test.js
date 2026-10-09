import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, initialStatuses, statusOf } from '../extension/lib/reminders.js';
import { latestFormYear } from '../extension/lib/form-version.js';

const dividends = [
  { date: '2026-06-15', usd: 510.2 },
  { date: '2026-09-14', usd: 524.09 },
];
const keys = (state, today) => dueReminders(state, today).map((r) => r.key);

test('statuses default to todo, past deadlines of older data to paid', () => {
  assert.equal(statusOf({}, '2026-09'), 'todo');
  assert.equal(statusOf({ '2026-09': 'sent' }, '2026-09'), 'sent');
  assert.deepEqual(initialStatuses(dividends, '2026-10-09'), { '2026-06': 'paid' });
});

test('announces a new dividend, then the deadline, then the delay', () => {
  assert.deepEqual(keys({ dividends, statuses: { '2026-06': 'paid' } }, '2026-10-01'), ['new:2026-09-14']);
  assert.deepEqual(keys({ dividends, statuses: { '2026-06': 'paid' } }, '2026-10-10'), ['new:2026-09-14', 'soon:2026-09']);
  assert.deepEqual(keys({ dividends, statuses: { '2026-06': 'paid' } }, '2026-10-16'), ['new:2026-09-14', 'late:2026-09']);
  assert.deepEqual(keys({ dividends, statuses: { '2026-06': 'paid', '2026-09': 'sent' } }, '2026-10-10'), []);
});

test('asks to import when a payment month has no dividend', () => {
  const statuses = { '2026-06': 'paid', '2026-09': 'paid' };
  assert.deepEqual(keys({ dividends, statuses }, '2026-12-19'), []);
  assert.deepEqual(keys({ dividends, statuses }, '2026-12-20'), ['import:2026-12']);
  assert.deepEqual(keys({ dividends, statuses }, '2026-09-25'), []); // September is imported.
});

test('texts follow the language', () => {
  const statuses = { '2026-06': 'paid' };
  const [fr] = dueReminders({ dividends, statuses }, '2026-10-01');
  const [en] = dueReminders({ dividends, statuses, lang: 'en' }, '2026-10-01');
  assert.equal(fr.message, '524,09 $ reçus le 14/09/2026. Déclarez-les avant le 15/10/2026.');
  assert.equal(en.message, '524,09 $ received on 14/09/2026. Declare it before 15/10/2026.');
});

test('finds the latest edition of the form', () => {
  const html = `<a href="/sites/default/files/formulaires/2778-div-sd/2021/2778-div-sd_3465.pdf">
    <a href="/sites/default/files/formulaires/2778-div-sd/2026/2778-div-sd_5389.pdf">`;
  assert.equal(latestFormYear(html), 2026);
  assert.equal(latestFormYear('<html></html>'), null);
});
