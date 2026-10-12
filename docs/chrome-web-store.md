# Chrome Web Store

Texts and images for the Chrome Web Store developer dashboard. The package is
built by `npm run package`, the images by `npm run images`.

## Store listing

- **Category:** Productivity → Tools.
- **Language:** French. Paste both descriptions below, French first: a
  translated listing would require `_locales` in the extension.
- **Icon:** `extension/icon.png` (128 × 128).
- **Screenshots:** the four images of `docs/store/fr/` and `docs/store/en/`
  (1280 × 800, up to 5 allowed).
- **Small promo tile:** `docs/store/promo-small.png` (440 × 280).
- **Marquee promo tile** (optional): `docs/store/promo-large.png` (1400 × 560).

### Description (French)

> Préparez la déclaration de vos dividendes Alphabet (GOOG) reçus via Morgan
> Stanley at Work, si vous êtes résident fiscal français.
>
> • Import automatique de vos dividendes depuis le tableau de bord Morgan
> Stanley at Work, une fois connecté.
> • Conversion au taux de référence de la BCE du jour du paiement.
> • Calcul du prélèvement forfaitaire de 12,8 % et des prélèvements sociaux
> (CSG, CRDS, solidarité), y compris pour le régime des impatriés.
> • Formulaire officiel 2778-DIV-SD pré-rempli, avec votre signature, et
> message prêt à envoyer par la messagerie sécurisée d'impots.gouv.fr.
> • Suivi de chaque déclaration et rappels avant l'échéance du 15.
> • Cases de la déclaration annuelle (2047, 2042, 2042 C) pour chaque année.
>
> Vos données restent dans votre navigateur et ne sont envoyées nulle part.
> Outil personnel, sans valeur de conseil fiscal : vérifiez les montants avant
> toute déclaration.

### Description (English)

> Prepare the French tax declarations for your Alphabet (GOOG) dividends
> received through Morgan Stanley at Work, as a French tax resident.
>
> • Automatic import of your dividends from the Morgan Stanley at Work
> dashboard, once logged in.
> • Conversion at the ECB reference rate of the payment date.
> • Computation of the 12.8 % prélèvement forfaitaire and the social
> contributions (CSG, CRDS, solidarity levy), including the impatriés regime.
> • The official 2778-DIV-SD form, pre-filled with your signature, and a
> message ready to send through the impots.gouv.fr secure messaging.
> • Tracking of each declaration and reminders before the 15th deadline.
> • The boxes of the annual tax return (2047, 2042, 2042 C) for each year.
>
> Your data stays in your browser and is sent nowhere. Personal tool, not tax
> advice: check the amounts before filing.

## Privacy practices

Texts for the **Privacy practices** tab. Keep them in sync with
`extension/manifest.json`: every permission listed there needs its
justification below.

### Single purpose

Prepare the French tax declarations for Alphabet (GOOG) dividends received
through Morgan Stanley at Work: the monthly 2778-DIV-SD form and the boxes of
the annual income tax return.

### Permission justifications

#### `storage`

Stores, only in the browser, the user's dividends, the status of each
declaration (to file, sent, paid), the profile printed on the form (name,
address, birth date and place, optional signature image) and the interface
language.

#### `alarms`

Checks twice a day whether a reminder is due: a declaration deadline
approaching, or a quarterly dividend not imported yet.

#### `notifications`

Shows those reminders: a new dividend was imported, a declaration is due in 5
days or is late, or a dividend has probably been paid but not imported yet.

#### Host permission `https://data-api.ecb.europa.eu/*`

Fetches the European Central Bank reference USD/EUR exchange rate of each
dividend's payment date. French tax rules require the declared amounts in
euros.

#### Content scripts on `https://atwork.morganstanley.com/*`

Imports the user's own dividends from Morgan Stanley at Work, while the user is
logged in and opens the dashboard:

- `content/parse.js` and `content/morgan-stanley-main.js` run in the page.
  When the dashboard requests the user's past events from the site's API, they
  send the same request again with earlier dates, to read the whole history,
  and keep the date and gross amount of each dividend.
- `content/morgan-stanley.js` saves those dividends in `chrome.storage.local`.

The extension never reads, stores or transmits the user's password, session or
access token: it only reuses the page's own request. The dividends never leave
the browser.

#### Remote code

No. All the code is in the package, including pdf-lib and the official
2778-DIV-SD form (`extension/vendor/`).

### Data usage

Data collected, all entered by the user or read from the user's own Morgan
Stanley account, and stored only in `chrome.storage.local`:

| Category | Data | Use |
|---|---|---|
| Personally identifiable information | Name, address, birth date and place | Printed on the 2778-DIV-SD form |
| Financial and payment information | Dividends (date, amount), declaration statuses, US tax withheld | Tax computation, form, reminders |
| Website content | Signature image (optional) | Printed on the form |

Certifications:

- The data is not sold or transferred to third parties.
- The data is not used or transferred for purposes unrelated to the single
  purpose.
- The data is not used or transferred to determine creditworthiness or for
  lending purposes.

### Privacy policy

URL to give: the `docs/privacy.md` page of the GitHub repository:
<https://github.com/ArthurSonzogni/dividendes-goog-fr/blob/main/docs/privacy.md>
