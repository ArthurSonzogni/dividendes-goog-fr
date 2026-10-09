// Detects a newer edition of the 2778-DIV-SD form than the one bundled in
// vendor/2778-div-sd.pdf (whose box positions lib/pdf.js relies on).

export const BUNDLED_FORM_YEAR = 2026;
const PAGE = 'https://www.impots.gouv.fr/formulaire/2778-div-sd/prelevements-forfaitaire-et-prelevements-sociaux-sur-les-revenus-distribues';

// The most recent edition year linked from the official page of the form.
export function latestFormYear(html) {
  const years = [...html.matchAll(/\/2778-div-sd\/(\d{4})\/2778-div-sd_\d+\.pdf/g)].map((m) => Number(m[1]));
  return years.length ? Math.max(...years) : null;
}

export async function fetchLatestFormYear() {
  const res = await fetch(PAGE);
  if (!res.ok) throw new Error(`impots.gouv.fr: HTTP ${res.status}`);
  return latestFormYear(await res.text());
}
