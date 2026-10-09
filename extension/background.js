import { dueReminders, initialStatuses } from './lib/reminders.js';
import { BUNDLED_FORM_YEAR, fetchLatestFormYear } from './lib/form-version.js';
import { translate } from './lib/i18n.js';

const today = () => new Date().toISOString().slice(0, 10);
const WEEK = 7 * 864e5;

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: 'app.html' }));
chrome.notifications.onClicked.addListener(() => chrome.tabs.create({ url: 'app.html' }));

// Checks twice a day, and as soon as the Morgan Stanley content script saves a
// dividend or the page changes a status.
const schedule = () => chrome.alarms.create('check', { delayInMinutes: 1, periodInMinutes: 720 });
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener(check);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.dividends || changes.statuses) check();
});

async function check() {
  const state = await chrome.storage.local.get(['dividends', 'statuses', 'lang', 'notified', 'formCheck']);
  if (!state.statuses) {
    state.statuses = initialStatuses(state.dividends ?? [], today());
    await chrome.storage.local.set({ statuses: state.statuses });
  }
  const notified = new Set(state.notified ?? []);
  const reminders = dueReminders(state, today());

  // New edition of the 2778-DIV-SD form, checked weekly.
  let formCheck = state.formCheck;
  if (!formCheck || Date.now() - formCheck.time > WEEK) {
    try {
      formCheck = { time: Date.now(), latestYear: await fetchLatestFormYear() };
      await chrome.storage.local.set({ formCheck });
    } catch (e) {
      console.warn('[dividendes-goog] form check failed:', e);
    }
  }
  if (formCheck?.latestYear > BUNDLED_FORM_YEAR) {
    const t = (key, vars) => translate(state.lang ?? 'fr', key, vars);
    reminders.push({ key: `form:${formCheck.latestYear}`, title: t('notifyFormTitle'), message: t('notifyForm', { year: formCheck.latestYear }) });
  }

  const fresh = reminders.filter((r) => !notified.has(r.key));
  for (const r of fresh) {
    chrome.notifications.create(r.key, { type: 'basic', iconUrl: 'icon.png', title: r.title, message: r.message });
    notified.add(r.key);
  }
  if (fresh.length) await chrome.storage.local.set({ notified: [...notified] });
}
