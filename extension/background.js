import { dueReminders } from './lib/reminders.js';

const today = () => new Date().toISOString().slice(0, 10);

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
  const state = await chrome.storage.local.get(['dividends', 'statuses', 'lang', 'notified']);
  const notified = new Set(state.notified ?? []);
  const reminders = dueReminders(state, today());

  const fresh = reminders.filter((r) => !notified.has(r.key));
  for (const r of fresh) {
    chrome.notifications.create(r.key, { type: 'basic', iconUrl: 'icon.png', title: r.title, message: r.message });
    notified.add(r.key);
  }
  if (fresh.length) await chrome.storage.local.set({ notified: [...notified] });
}
