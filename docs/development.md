# Local development

This guide covers the commands and project structure needed to work on WhatIsMyIOP. For the product overview, start with the [README](../README.md).

## Prerequisites

- Node.js 22
- npm

The continuous integration workflow uses Node.js 22. Using the same major version locally avoids differences in dependency installation and builds.

## Install and run

From the repository root:

```sh
npm ci
npm run dev
```

Vite prints the local address when the development server starts. Measurement data remains in that browser profile.

## Checks and builds

| Command | Purpose |
| --- | --- |
| `npm test` | Run the Vitest test suite once |
| `npm run build` | Type-check and create a production build |
| `npm run preview:worker` | Build and serve through the local Cloudflare Worker |
| `npm run deploy:check` | Build and validate the Wrangler deployment without publishing |
| `npm run deploy` | Deploy with Wrangler credentials configured on the machine |

Run the tests and production build before opening a pull request.

## Showcase report

The repository includes a deterministic synthetic report for demos and product screenshots. Generate it with:

```sh
npm run showcase:generate
```

The command writes `output/showcase-history.whatismyiop`. Open that file through the app's **Open WhatIsMyIOP report** action. The `output/` directory is ignored by Git.

The showcase report contains no patient data. Keep real exports and reports out of the repository, issues, and pull requests.

## Project map

| Path | Contents |
| --- | --- |
| `src/client/src/features/` | Product areas such as measurements, charts, annotations, comparison, and reports |
| `src/client/src/shared/` | Shared layout, controls, styles, and small utilities |
| `src/client/public/` | Files served directly by the site, including the logo and favicon |
| `docs/` | Product specifications, architectural decisions, and contributor documentation |
| `scripts/` | Reproducible local utilities such as showcase-data generation |
| `wrangler.jsonc` | Cloudflare Worker and static-asset configuration |

## Data and report behavior

The app reads iCare HOME2 semicolon-delimited CSV exports. It keeps only the parsed fields used by the interface and stores the active workspace in browser storage.

Editable reports use the `.whatismyiop` extension and a versioned JSON format. Changes to that format need compatibility tests and an architectural decision record under `docs/adr/`.

Terminology for periods, annotations, reports, and comparison segments is defined in [CONTEXT.md](../CONTEXT.md).

## Deployment

Production assets are built by Vite and served by a Cloudflare Worker configured in `wrangler.jsonc`. Contributors normally only need `npm run build` and `npm run preview:worker`. Publishing requires maintainer-owned Cloudflare credentials.
