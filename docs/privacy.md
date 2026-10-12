# Privacy policy

*dividendes-goog-fr* is a Chrome extension that prepares French tax
declarations for Alphabet (GOOG) dividends received through Morgan Stanley at
Work.

## Data handled

- **Profile**, entered by you: name, address, birth date and place, and an
  optional signature image. Used only to fill in the 2778-DIV-SD form.
- **Dividends**, read from your own Morgan Stanley at Work account while you
  are logged in and open its dashboard: date and gross amount of each dividend.
- **Declaration statuses** (to file, sent, paid), the amounts you enter from
  the 1042-S form, and the interface language.

## Where it is stored

Only in your browser, in the extension's local storage
(`chrome.storage.local`). The extension has no server and sends this data
nowhere.

## Network requests

- **European Central Bank** (`data-api.ecb.europa.eu`): the USD/EUR exchange
  rate of each payment date. The request contains only the dates, no personal
  data.
- **Morgan Stanley at Work**: the extension sends again the dashboard's own
  request for your past events, with earlier dates, from your logged-in page.
  It never reads, stores or sends your password, session or access token.

## Sharing

The data is not sold, shared or transferred to anyone.

## Deletion

Removing the extension deletes all its data.

## Contact

Questions and requests: open an issue on
<https://github.com/ArthurSonzogni/dividendes-goog-fr/issues>.
