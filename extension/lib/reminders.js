// Declaration statuses and the reminders derived from them. Shared by the
// page and the background service worker.

import { deadline } from './tax.js';
import { amount, frDate, monthLabel } from './pdf.js';
import { translate } from './i18n.js';

// 'todo' | 'sent' | 'paid', 'todo' by default.
export const statusOf = (statuses, month) => statuses?.[month] ?? 'todo';

// Statuses for data saved before statuses existed: the declarations whose
// deadline has passed were filed without the extension.
export function initialStatuses(dividends, today) {
  const months = dividends.filter((d) => d.date).map((d) => d.date.slice(0, 7));
  return Object.fromEntries(months.filter((m) => deadline(m) < today).map((m) => [m, 'paid']));
}

export const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

// Alphabet pays its dividend mid-March, June, September and December.
const PAYMENT_MONTHS = ['03', '06', '09', '12'];
const SOON_DAYS = 5;

// The notifications due on `today` ('YYYY-MM-DD'), each with a unique key so
// that it is shown once. `state`: { dividends, statuses, lang }.
export function dueReminders({ dividends = [], statuses = {}, lang = 'fr' }, today) {
  const t = (key, vars) => translate(lang, key, vars);
  const reminders = [];
  const months = [...new Set(dividends.filter((d) => d.date).map((d) => d.date.slice(0, 7)))];
  for (const month of months) {
    if (statusOf(statuses, month) !== 'todo') continue;
    const due = deadline(month);
    const vars = { month: monthLabel(month), deadline: frDate(due) };
    for (const d of dividends.filter((x) => x.date?.startsWith(month))) {
      reminders.push({
        key: `new:${d.date}`,
        title: t('notifyNewTitle'),
        message: t('notifyNew', { ...vars, amount: amount(d.usd, 2), date: frDate(d.date) }),
      });
    }
    const days = daysBetween(today, due);
    if (days < 0) reminders.push({ key: `late:${month}`, title: t('notifyLateTitle'), message: t('notifyLate', vars) });
    else if (days <= SOON_DAYS) reminders.push({ key: `soon:${month}`, title: t('notifySoonTitle'), message: t('notifySoon', vars) });
  }
  const [year, month, day] = today.split('-');
  if (PAYMENT_MONTHS.includes(month) && Number(day) >= 20 && !months.includes(`${year}-${month}`)) {
    reminders.push({ key: `import:${year}-${month}`, title: t('notifyImportTitle'), message: t('notifyImport') });
  }
  return reminders;
}
