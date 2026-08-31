# WhatIsMyIOP

WhatIsMyIOP is a browser-based viewer for home eye-pressure measurements. It currently reads CSV exports from the iCare HOME2 tonometer and turns them into charts that are easier to inspect than the original spreadsheet.

The app can:

- show raw readings or group nearby readings into sessions
- calculate median and average session values
- draw trends from raw readings or session values for either eye
- plot pressure by date and time of day as a heatmap
- mark treatment periods and events
- compare saved periods with short comparison expressions

The imported CSV stays in the browser. The app stores a local copy so the work is still there after a refresh, but it does not upload the measurement file to an application server. Use **Clear data** in the app to remove that browser copy.

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
