# WhatIsMyIOP

WhatIsMyIOP is a browser-based viewer for home eye-pressure measurements. It currently reads CSV exports from the iCare HOME2 tonometer and turns them into charts that are easier to inspect than the original spreadsheet.

The app can:

- show raw readings or group nearby readings into sessions
- calculate median and average session values
- draw trends from raw readings or session values for either eye
- plot pressure by date and time of day as a heatmap
- mark treatment periods and annotations
- compare saved periods with short comparison expressions
- generate and reopen editable `.whatismyiop` reports

Imported files stay in the browser. The app keeps only the measurement fields it uses, along with saved periods and annotations, so the work is still there after a refresh. It discards the original CSV text and does not upload imported data to an application server. Use **Clear data** in the app to remove the browser copy.

## Run it locally

You need Node.js and npm.

```sh
npm install
npm run dev
```

Vite will print the local address when the development server starts.

## Useful commands

```sh
npm test       # run the test suite
npm run build  # type-check and build the site
npm run deploy # build and deploy with Wrangler
```

Cloudflare deployment settings live in `wrangler.jsonc`.

## A medical note

This is a charting tool, not a medical device. It does not diagnose an eye condition, decide whether a pressure is safe, or recommend treatment. Keep the original measurements and discuss them with an eye-care professional.

WhatIsMyIOP is independent and is not affiliated with or endorsed by the manufacturer of iCare HOME2.
