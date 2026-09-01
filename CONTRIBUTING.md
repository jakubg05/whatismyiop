# Contributing to WhatIsMyIOP

Thanks for taking the time to improve WhatIsMyIOP. Small, focused changes are easiest to review and safest for a project that handles personal health measurements in the browser.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue before a large visual, behavioral, or data-format change.
- Never post real patient exports, `.whatismyiop` reports, or identifiable screenshots.
- Keep the app's medical scope clear. It presents measurements and context but does not diagnose, recommend treatment, or classify a pressure as safe.

## Local setup

Follow the [development guide](docs/development.md) to install dependencies and run the app.

## Making a change

1. Create a branch from `dev`.
2. Match the terminology in [CONTEXT.md](CONTEXT.md).
3. Add or update tests when behavior changes.
4. Run the test suite and production build.
5. Open a pull request against `dev` with a short explanation and screenshots for visible changes.

```sh
npm test
npm run build
```

Generated files, local reports, and temporary screenshots belong in `output/`, which Git ignores. Commit selected documentation images under `docs/assets/`.