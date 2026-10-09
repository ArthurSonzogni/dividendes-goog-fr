// Form 2778-DIV-SD: tax on dividends paid by a foreign institution.

// Rates for income received on `date` ('YYYY-MM-DD'). The LFSS 2026 raised
// the CSG on investment income from 9.2% to 10.6% from 2026.
export const ratesFor = (date) => ({
  prelevement: 0.128,
  csg: date < '2026-01-01' ? 0.092 : 0.106,
  crds: 0.005,
  solidarite: 0.075,
});

// The form is filled in whole euros: fractions < 0.50 are dropped, >= 0.50
// count as 1. The epsilon absorbs float noise (e.g. 126 * 0.075 = 9.4499...).
const euros = (x) => Math.floor(x + 0.5 + 1e-9);

// `dividends`: [{ date, usd, usdEur }], all received in the same month.
// Returns the amount of every line of the form, keyed by the form's own codes.
// `impatrie`: the impatriés regime (CGI 155 B), under which 50 % of the
// dividends are exempt from the prélèvement forfaitaire (line EA) but not
// from the social contributions.
export function computeTax(dividends, { impatrie = false } = {}) {
  const RATES = ratesFor(dividends[0].date);
  const grossEur = dividends.reduce((sum, d) => sum + d.usd * d.usdEur, 0);
  const IK = euros(impatrie ? grossEur / 2 : grossEur);
  const EA = euros(grossEur) - IK;
  const IL = euros(IK * RATES.prelevement);
  const socialBase = IK + EA;
  const PQ = euros(socialBase * RATES.csg);
  const PV = euros(socialBase * RATES.crds);
  const PF = PQ + PV;
  const PG = euros(socialBase * RATES.solidarite);
  const PT = PF + PG;
  return { rates: RATES, grossEur, IK, IL, EA, socialBase, PQ, PV, PF, PG, PT, QR: IL + PT };
}

// Declaration and payment are due on the 15th of the month after the income
// was received. `month` is 'YYYY-MM'.
export function deadline(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10);
}

// Amounts of the annual income tax return (2047 and 2042) for the dividends
// received in one calendar year. `declarations`: [{ dividends, tax }], the
// monthly 2778-DIV-SD declarations of that year. For impatriés, lines 203 to
// 208 cover the taxable half, lines 275 and 276 the exempt half.
export function annualReturn(declarations, { impatrie = false } = {}) {
  const sum = (f) => declarations.reduce((total, r) => total + f(r), 0);
  const gross = sum(({ tax }) => tax.socialBase);
  const exempt = sum(({ tax }) => tax.EA); // Line 275, 2DM.
  // US tax withheld, converted at the rate of each payment.
  const withheldTotal = euros(sum(({ dividends }) =>
    dividends.reduce((s, d) => s + (d.withheld ?? 0) * d.usdEur, 0)));
  const withheld = impatrie ? euros(withheldTotal / 2) : withheldTotal;
  // 2047 lines 203 to 207: the credit is the US tax, capped at the rate of
  // the treaty applied to the net amount (17.6% for the United States).
  const credit = (taxed, tax) => Math.min(euros((taxed - tax) * 0.176), tax);
  const net = gross - exempt - withheld;
  const capped = euros(net * 0.176);
  const exemptCredit = impatrie ? credit(exempt, withheldTotal - withheld) : 0; // Line 276.
  return {
    gross, exempt, withheld, net, capped, credit: Math.min(capped, withheld), exemptCredit,
    prelevement: sum(({ tax }) => tax.IL),
  };
}
