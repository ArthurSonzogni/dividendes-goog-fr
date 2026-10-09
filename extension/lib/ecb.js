// ECB reference rate on `date` ('YYYY-MM-DD'), or the last one published
// before it: there is no fixing on weekends and TARGET holidays.
export async function ecbRate(date) {
  const start = new Date(Date.parse(date) - 10 * 864e5).toISOString().slice(0, 10);
  const url = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A'
    + `?startPeriod=${start}&endPeriod=${date}&format=csvdata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ECB API: HTTP ${res.status}`);
  const [header, ...rows] = (await res.text()).trim().split('\n').map((l) => l.split(','));
  if (!rows.length) throw new Error(`ECB API: no rate before ${date}`);
  const last = rows.at(-1);
  const eurUsd = Number(last[header.indexOf('OBS_VALUE')]);
  return { rateDate: last[header.indexOf('TIME_PERIOD')], usdEur: 1 / eurUsd };
}
