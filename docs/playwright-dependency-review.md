# Playwright dependency review

Reviewed 2026-09-26 for local browser testing only, under [the dependency policy](dependency-safety.md).

Adopt `@playwright/test` **1.58.2**, with exact `playwright` and `playwright-core` **1.58.2** resolutions from registry.npmjs.org. Rails Minitest cannot drive the requested cross-browser JavaScript flows. No production JavaScript dependency is added.

## Evidence

- [Microsoft's versioned source](https://github.com/microsoft/playwright/tree/v1.58.2) matches the npm repository metadata. Registry maintainers are pavelfeldman, yurys, dgozman-ms and playwright-bot; this matches the upstream contributor/release identities reviewed. No unexplained ownership change was found in the reviewed evidence.
- [Release 1.58.2](https://github.com/microsoft/playwright/releases/tag/v1.58.2), published February 6, fixes trace-viewer stdin paths and macOS Chromium SwiftShader handling. This is an established patch release, not an automatic latest-version adoption. There is no previously vetted Playwright version in this repository.
- [GitHub's gh-aw adoption record](https://github.com/github/gh-aw/issues/14877) independently records this exact release in its tooling updates. Microsoft's published security response and the independent Socket report below provide concrete scrutiny beyond download counts; they do not prove absence of defects.
- Reviewed the three versioned upstream package manifests and npm registry dependency/script metadata. Required graph is test → playwright → playwright-core, all pinned 1.58.2, with no install hooks. Optional `fsevents` 2.3.2 has a native `node-gyp rebuild` hook: `.npmrc` omits optional dependencies and disables lifecycle scripts. Its lock entry is retained for reproducibility but is not installed or executed.
- [CVE-2025-59288](https://github.com/advisories/GHSA-7mvr-c777-76hp) affected browser installer certificate verification before 1.55.1; this version includes the fix. `npm audit --json` on the resolved lock returned zero advisories on the review date. npm 11.11.0 is the existing installed audit client; no separate audit package was adopted.
- Lockfile URLs and SHA-512 integrity fields were inspected. Browser installation is an explicit separate command using upstream HTTPS downloads. Do not disable TLS verification or use arbitrary browser download mirrors. Browser binaries execute locally and retain their own security limitations; tests only visit the local fixture app.

## Commands

```sh
npm ci --ignore-scripts --omit=optional
npx playwright install chromium firefox webkit
npm audit
npm run test:e2e
```

Re-review exact versions, source changes and advisories before updates. A clean advisory result is not a security guarantee. No hosted data or real Meta credentials are needed.
