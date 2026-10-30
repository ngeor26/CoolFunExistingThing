import { classify } from './stock.mjs';

const COLORS = 'main input[name="color"]';
const MEMORY = 'main #pay-monthly-tabpanel input[type="radio"][data-upf-product-sku]';
const MODAL = '#bopis-store-locator';

async function openProduct(page, url) {
  console.log('Product stage: navigation');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (const selector of ['#tnt269975_BtMdL_INS_Cta', '#onetrust-reject-all-handler']) {
    const button = page.locator(selector);
    if (await button.isVisible()) await button.click();
  }
  console.log('Product stage: color options');
  await page.locator(COLORS).first().waitFor({ state: 'attached', timeout: 45000 });
  console.log('Product stage: storage options');
  await page.locator(MEMORY).first().waitFor({ state: 'attached', timeout: 30000 });
  if (!await page.getByRole('heading', {name:'iPhone Duo',exact:true}).isVisible())
    throw new Error('Expected iPhone Duo product page was not displayed.');
}

async function selectRadio(page, locator) {
  if (await locator.isDisabled()) throw new Error('Variant cannot currently be selected; local stock is unknown.');
  const id = await locator.getAttribute('id');
  await page.locator(`label[for="${id}"]`).click();
  await locator.waitFor({state:'attached'});
  await page.waitForFunction(id => document.getElementById(id)?.checked === true, id);
}

export async function discoverVariants(browser, config) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    await openProduct(page, config.productUrl);
    const colors = await page.locator(COLORS).evaluateAll(els => els.map(e => e.value));
    const variants = [];
    for (const color of colors) {
      if (config.colors.length && !config.colors.includes(color)) continue;
      console.log('Product stage: select color');
      await selectRadio(page, page.locator(COLORS).and(page.locator(`[value="${color}"]`)));
      // Wait for the visible selection and storage options to settle before reading SKU attributes.
      await page.waitForTimeout(1200);
      const memory = await page.locator(MEMORY).evaluateAll(els => els.map(e => ({storage:e.value,sku:e.getAttribute('data-upf-product-sku'),disabled:e.disabled})));
      for (const item of memory) {
        if (config.storage.length && !config.storage.includes(item.storage)) continue;
        if (!item.sku || !/^[a-zA-Z0-9_-]+$/.test(item.sku)) throw new Error('T-Mobile returned an unrecognized SKU.');
        variants.push({...item, color, name:`${color} ${item.storage}`});
      }
    }
    console.log(`Product stage: discovered ${variants.length} variants`);
    if (!variants.length || variants.length > config.maxVariants) throw new Error('No matching variants, or unexpected variant count. Review config.json.');
    if (new Set(variants.map(v => v.sku)).size !== variants.length) throw new Error('Variant SKU mapping is ambiguous.');
    return variants;
  } finally { await context.close(); }
}

export async function checkPickup(browser, config, variant, zip) {
  const context = await browser.newContext(); // No location or stale store results carried between ZIPs.
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    const url = new URL(config.productUrl);
    url.searchParams.set('sku', variant.sku);
    await openProduct(page, url.href);
    await page.waitForFunction(({colors,memory,variant}) => {
      const c = [...document.querySelectorAll(colors)].find(e=>e.checked);
      const m = [...document.querySelectorAll(memory)].find(e=>e.checked);
      return c?.value === variant.color && m?.value === variant.storage && m?.getAttribute('data-upf-product-sku') === variant.sku;
    }, {colors:COLORS,memory:MEMORY,variant}, {timeout:20000});
    const trigger = page.locator('[data-publish-event-topic="INITIATE_BOPIS_STORE_LOCATOR_MODAL"]:visible').first();
    if (!await trigger.isVisible()) {
      const pickup = page.locator('label[data-radiofieldid="BOPIS"]:visible');
      await pickup.click();
    }
    await trigger.click();
    const modal = page.locator(MODAL);
    await modal.waitFor({state:'visible'});
    await page.waitForFunction(selector => ![...document.querySelectorAll(`${selector} .skeleton-loader`)].some(e => e.getClientRects().length), MODAL, {timeout:30000});
    const input = modal.locator('#field-bopis-store-locator-address');
    await input.fill(zip);
    // Observe the loading transition before submission. Never read initial location results.
    await page.evaluate(selector => {
      const root = document.querySelector(selector);
      const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      window.__stockSearch = {started:false, finished:false};
      window.__stockObserver?.disconnect();
      window.__stockObserver = new MutationObserver(() => {
        const busy = [...root.querySelectorAll('.skeleton-loader')].some(visible);
        if (busy) window.__stockSearch.started = true;
        if (window.__stockSearch.started && !busy) window.__stockSearch.finished = true;
      });
      window.__stockObserver.observe(root,{childList:true,subtree:true,attributes:true,characterData:true});
    }, MODAL);
    await input.press('Enter');
    await page.waitForFunction(() => window.__stockSearch?.finished, null, {timeout:30000});
    if (await input.inputValue() !== zip) throw new Error('ZIP search was not retained.');
    const snapshot = await modal.evaluate(root => {
      const visible = e => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const rows = [...root.querySelectorAll('.tdds-styled-radio')].filter(visible).map(row => ({
        name:row.querySelector('.upf-bopisStoreLocator__store-name')?.innerText.trim() || '',
        address:row.querySelector('.upf-bopisStoreSelector__store-info')?.innerText.trim() || '',
        status:[...row.querySelectorAll('.upf-inventory-status-highlight')].filter(visible).map(e=>e.innerText.trim()).join(' ')
      })).filter(r=>r.name && r.address);
      return {rows,text:root.innerText,complete:true};
    });
    return {zip,variant:variant.name,sku:variant.sku,...classify(snapshot)};
  } catch (error) {
    return {zip,variant:variant.name,sku:variant.sku,status:'unknown',stores:[],error:error.message.split('\n')[0]};
  } finally { await context.close(); }
}
