# Single-row header verification

Regenerate the iPad portrait captures (light and dark) and the phone captures:

```sh
bunx playwright test tests/e2e/header-single-row.spec.ts --project=chromium
bunx playwright test tests/e2e/phone-header-single-row.spec.ts --project=phone-chromium
```

The specs write screenshots to `testInfo.outputPath(...)` in Playwright's
output directory. The old 834 px touch header measured 112 px; the fixed
header measures 56 px. Local execution used Chromium 153 with touch
emulation and also checked fine-pointer widths. WebKit and physical iPad
Safari were not run; the WebKit system dependencies are missing locally.
