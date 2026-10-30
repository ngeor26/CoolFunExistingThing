# iPhone Duo daily pickup alerts

A cloud-run Node.js app using GitHub Actions and Pushover. Your computer and browser can be closed. This is not a browser extension and does not need an always-on paid server.

## Current status

The checker and daily workflow are implemented. Activation requires the three repository secrets below and a successful live run. Unit tests cover stock classification, public report privacy and Pushover response handling. Live end-to-end pickup verification is still required: T-Mobile's product options remained loading in the inspection browser. A blocked or changed website produces `unknown`, never an invented stock result.

## What it checks

- Product: https://www.t-mobile.com/cell-phone/apple-iphone-duo
- Local pickup within T-Mobile's 20-mile search radius around two ZIP codes stored in the `ZIP_CODES` secret.
- All discovered color/storage combinations by default. Set exact color names or storage labels in `config.json` to narrow the search. Empty arrays mean all options.
- A fresh browser context per variant and ZIP, with the selected variant verified before searching.
- Only a visible store result marked **In Stock** or **Hurry, only a few left** triggers an availability notification.
- The search must show a fresh loading/completion cycle after submitting the ZIP. If this cannot be verified, the result is unknown.
- One combined stock alert per daily run; stock remaining available on another day produces another daily alert. There is no persistent deduplication database.
- A separate attention alert for incomplete checks. Errors also fail the Actions run. Setup failures/timeouts before the checker executes rely on GitHub's workflow-failure notifications.

## Activate in GitHub

1. Create `iphone-duo-stock-checker` in your GitHub account, or choose an existing dedicated repository. Grant the GitHub connection access if publishing through this chat.
2. Upload these source files, including `.github/workflows/daily-stock.yml`, to the repository's **default branch**. Do not upload the downloaded `tmobile-page.html`, reports, `.env`, or credentials.
3. Visit https://pushover.net/ and copy your **User Key**. Register a free application at https://pushover.net/apps/build named `iPhone Duo Stock Checker` to obtain an **API Token/Key**. Your existing Pushover license covers your client app; the API uses these separate keys.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**. Add:

   | Secret | Value |
   | --- | --- |
   | `PUSHOVER_USER_KEY` | Your Pushover user key |
   | `PUSHOVER_APP_TOKEN` | The application's API token |
   | `ZIP_CODES` | Your two ZIP codes, separated by a comma |

   Enter secrets directly in GitHub. They do not belong in source code or chat.

   Public logs, summaries and reports identify searches only as `Location 1` and `Location 2`. Store names, addresses, ZIP codes and raw browser errors are excluded from saved reports. Full location details are sent only in your Pushover alerts (and to T-Mobile for the searches). GitHub stores the secret and makes it available to the runner; this hides locations from public repository visitors, not from those services or people with permission to modify your workflow. Do not enable browser debug logging, traces or screenshots in public runs.

5. Open **Actions → Daily iPhone Duo pickup check → Run workflow**. Select the notification test checkbox and run it. Confirm the test arrives on your phone.
6. Run the workflow again without the checkbox. Inspect its summary and downloadable `stock-report`. A successful run with real store results verifies the integration; `unknown` means it still needs investigation. Do not treat this setup as working until this live run succeeds.

## Daily schedule and cost

The workflow requests a run at **16:17 UTC daily** (9:17 a.m. PDT / 8:17 a.m. PST). GitHub schedules may be delayed and are not exact-time guarantees. You can change the cron entry in `.github/workflows/daily-stock.yml`. Disable the workflow from its Actions menu to stop checks.

Standard GitHub-hosted Actions runners are free for public repositories. A private repository uses your account's included allowance, shared with other workflows. Each run has a 15-minute cap: at most 465 scheduled runner minutes in a 31-day month, plus manual runs. Reports are small and retained for seven days. Keep paid overage disabled in GitHub billing to enforce a $0 spending limit. This project provisions no paid hosting or SMS services.

GitHub can disable public repository schedules after 60 days without repository activity. Re-enable the workflow if this happens. Keep GitHub workflow-failure notifications enabled so infrastructure failures are visible.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm install --ignore-scripts
npx playwright install chromium
npm test
node src/check.mjs --dry-run
```

Set the `ZIP_CODES` environment variable before a dry run; there are no location defaults in source. Dry runs never send notifications. Real runs also need the two Pushover environment variables. `npm run test:push` sends one explicitly labeled setup test. Reports are written under `reports/` and ignored by Git.

The parser is intentionally conservative. T-Mobile may block cloud browsers or change its selectors. No CAPTCHA bypass, proxy service, account sign-in, reservation, or purchase is included. If the live workflow cannot load the page, its report must be investigated before this can be considered an operational monitor.

## References

- [T-Mobile product](https://www.t-mobile.com/cell-phone/apple-iphone-duo)
- [Pushover API](https://pushover.net/api)
- [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
