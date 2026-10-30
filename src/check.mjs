import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { discoverVariants, checkPickup } from './tmobile.mjs';
import { notification } from './stock.mjs';
import { push } from './pushover.mjs';
import { readZipCodes, publicResults } from './privacy.mjs';

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url)));
config.zipCodes = readZipCodes(process.env.ZIP_CODES);
if (config.productUrl !== 'https://www.t-mobile.com/cell-phone/apple-iphone-duo' ||
    !config.zipCodes.every(z=>/^\d{5}$/.test(z))) throw new Error('Invalid product URL or ZIP configuration.');
const dryRun = process.argv.includes('--dry-run');
if (!dryRun && (!process.env.PUSHOVER_APP_TOKEN || !process.env.PUSHOVER_USER_KEY))
  throw new Error('Configure both Pushover secrets before enabling the daily monitor.');
const results = [];
const deadline = Date.now() + 10 * 60 * 1000;
let fatal;
let browser;
try {
  browser = await chromium.launch({headless:true});
  const variants = await discoverVariants(browser,config);
  for (const variant of variants) {
    for (const zip of config.zipCodes) {
      const result = Date.now() > deadline
        ? {zip,variant:variant.name,sku:variant.sku,status:'unknown',stores:[],error:'Run time limit reached before this check.'}
        : await checkPickup(browser,config,variant,zip);
      results.push(result);
      console.log(`Location ${config.zipCodes.indexOf(zip) + 1} | ${variant.name} | ${result.status}`);
    }
  }
} catch { fatal = 'Product options could not be loaded or verified.'; }
finally { await browser?.close(); }

await mkdir('reports',{recursive:true});
const safeResults = publicResults(results, config.zipCodes);
const report = {checkedAt:new Date().toISOString(),results:safeResults,error:fatal || null};
await writeFile('reports/latest.json',JSON.stringify(report,null,2));
const clean = value => String(value).replace(/[|\r\n<>]/g,' ');
const summary = `# iPhone Duo daily pickup check\n\nChecked: ${report.checkedAt}\n\n` +
  (fatal ? `Unable to check: ${clean(fatal)}\n\n` : '') +
  '| Location | Variant | Result |\n| --- | --- | --- |\n' +
  safeResults.map(r=>`| ${r.location} | ${clean(r.variant)} | ${r.status} |`).join('\n') +
  '\n\nUnknown means the site could not be verified, not out of stock. Search radius: 20 miles.\n';
await writeFile('reports/summary.md',summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
const message = notification(results);
const incomplete = !!fatal || results.some(r=>r.status==='unknown');
if (!dryRun) {
  if (message) await push(message);
  if (incomplete) await push('Some or all T-Mobile pickup checks could not be completed. Open the GitHub Actions run for details. No stock conclusion can be drawn for unknown results.', 'Stock checker needs attention');
}
if (incomplete) process.exitCode=1;
