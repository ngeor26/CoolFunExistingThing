import { classify } from './stock.mjs';

const COLORS = 'main .color-swatch-card input[name="color"]';
const MEMORY = 'main #pay-monthly-tabpanel input[type="radio"][data-upf-product-sku]';
const MODAL = '#bopis-store-locator';

async function dismissOverlays(page) {
  for (const selector of ['#tnt269975_BtMdL_INS_Cta', '#onetrust-reject-all-handler']) {
    const button = page.locator(selector);
    if (await button.isVisible()) await button.click();
  }
}

async function openProduct(page, url) {
  console.log('Product stage: navigation');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissOverlays(page);
  console.log('Product stage: color options');
  await page.locator(COLORS).first().waitFor({ state: 'attached', timeout: 45000 });
  console.log('Product stage: storage options');
  await page.locator(MEMORY).first().waitFor({ state: 'attached', timeout: 30000 });
  await dismissOverlays(page);
  if (!await page.getByRole('heading', {name:'iPhone Duo',exact:true}).isVisible())
    throw new Error('Expected iPhone Duo product page was not displayed.');
}

async function selectRadio(page, locator) {
  await dismissOverlays(page);
  if (await locator.isDisabled()) throw new Error('Variant cannot currently be selected; local stock is unknown.');
  const id = await locator.getAttribute('id');
  await page.locator(`label[for="${id}"]`).click();
  await locator.waitFor({state:'attached'});
  await page.waitForFunction(id => {
    const input = document.getElementById(id);
    return input?.checked === true || input?.closest('label')?.classList.contains('selected');
  }, id);
}

async function waitForSearchReady(page) {
  // Opening the dialog can kick off a delayed initial search that replaces its
  // contents. Wait for the visible form to settle before entering a location.
  await page.evaluate(selector => {
    window.__stockReadyObserver?.disconnect();
    window.__stockReadySince = performance.now();
    const root = document.querySelector(selector);
    window.__stockReadyObserver = new MutationObserver(() => {
      window.__stockReadySince = performance.now();
    });
    window.__stockReadyObserver.observe(root, {childList:true,subtree:true,attributes:true,characterData:true});
  }, MODAL);
  await page.waitForFunction(selector => {
    const root = document.querySelector(selector);
    const field = root?.querySelector('#field-bopis-store-locator-address');
    const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    return visible(root) && visible(field) && !field.disabled &&
      ![...root.querySelectorAll('.skeleton-loader')].some(visible) &&
      performance.now() - window.__stockReadySince >= 2000;
  }, MODAL, {timeout:30000});
  await page.evaluate(() => window.__stockReadyObserver?.disconnect());
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
      const memory = await page.locator(MEMORY).evaluateAll(els => els.map(e => ({storage:e.value,disabled:e.disabled})));
      for (const item of memory) {
        if (config.storage.length && !config.storage.includes(item.storage)) continue;
        if (!/^[0-9]+(?:GB|TB)$/.test(item.storage)) throw new Error('T-Mobile returned an unrecognized storage option.');
        variants.push({...item, color, name:`${color} ${item.storage}`, sku:`${color}:${item.storage}`});
      }
    }
    console.log(`Product stage: discovered ${variants.length} variants`);
    if (!variants.length || variants.length > config.maxVariants) throw new Error('No matching variants, or unexpected variant count. Review config.json.');
    if (new Set(variants.map(v => v.sku)).size !== variants.length) throw new Error('Variant SKU mapping is ambiguous.');
    return variants;
  } catch (error) {
    const message = String(error.message);
    console.log('Product failure category:', /intercepts pointer events/.test(message) ? 'overlay' : /strict mode violation/.test(message) ? 'ambiguous selector' : /Timeout|timeout/.test(message) ? 'timeout' : 'unrecognized product state');
    throw error;
  } finally { await context.close(); }
}

export async function checkPickup(browser, config, variant, zip) {
  const context = await browser.newContext(); // No location or stale store results carried between ZIPs.
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  let stage = 'open-product-and-select-variant';
  try {
    await openProduct(page, config.productUrl);
    stage = 'select-color';
    await selectRadio(page, page.locator(COLORS).and(page.locator(`[value="${variant.color}"]`)));
    await page.waitForTimeout(1200);
    stage = 'select-storage';
    await selectRadio(page, page.locator(MEMORY).and(page.locator(`[value="${variant.storage}"]`)));
    stage = 'verify-variant';
    await page.waitForFunction(({colors,memory,variant}) => {
      const c = [...document.querySelectorAll(colors)].find(e=>e.closest('label')?.classList.contains('selected'));
      const m = [...document.querySelectorAll(memory)].find(e=>e.checked);
      return c?.value === variant.color && m?.value === variant.storage;
    }, {colors:COLORS,memory:MEMORY,variant}, {timeout:20000});
    console.log('Pickup stage: open store search');
    stage = 'open-store-search';
    const trigger = page.locator('[data-publish-event-topic="INITIATE_BOPIS_STORE_LOCATOR_MODAL"]:visible').first();
    if (!await trigger.isVisible()) {
      const pickup = page.locator('label[data-radiofieldid="BOPIS"]:visible');
      await pickup.click();
    }
    await trigger.click();
    const modal = page.locator(MODAL);
    await modal.waitFor({state:'visible'});
    const input = modal.locator('#field-bopis-store-locator-address');
    let locationVerified = false;
    for (let searchAttempt = 1; searchAttempt <= 3; searchAttempt++) {
    stage = 'wait-stable-search-form';
    await waitForSearchReady(page);
    stage = 'fill-and-submit-location';
    await input.fill(zip);
    if (await input.inputValue() !== zip) throw new Error('ZIP search was not retained.');
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
    console.log('Pickup stage: await fresh search results');
    stage = 'wait-search-completion';
    await page.waitForFunction(() => window.__stockSearch?.finished, null, {timeout:30000});
    // The first loading cycle may belong to late dialog initialization. Let all
    // pending rendering finish, then require the submitted location to survive.
    stage = 'wait-stable-search-result';
    await waitForSearchReady(page);
    stage = 'verify-location';
    if (await input.inputValue() === zip) {
      locationVerified = true;
      break;
    }
    console.log(`Pickup recovery: search form reset after submission; attempt ${searchAttempt} of 3`);
    }
    if (!locationVerified) throw new Error('ZIP search was not retained.');
    stage = 'read-store-rows';
    const snapshot = await modal.evaluate(root => {
      const visible = e => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const rows = [...root.querySelectorAll('.tdds-styled-radio')].filter(visible).map(row => ({
        name:row.querySelector('.upf-bopisStoreLocator__store-name')?.innerText.trim() || '',
        address:row.querySelector('.upf-bopisStoreSelector__store-info')?.innerText.trim() || '',
        status:[...row.querySelectorAll('.upf-inventory-status-highlight')].filter(visible).map(e=>e.innerText.trim()).join(' ')
      })).filter(r=>r.name && r.address);
      return {rows,text:root.innerText,complete:true};
    });
    console.log('Pickup stage: classify fresh results');
    return {zip,variant:variant.name,sku:variant.sku,...classify(snapshot)};
  } catch (error) {
    // Log only fixed categories and boolean state, never raw errors or page text.
    const message = String(error?.message || '');
    const category = message.includes('ZIP search was not retained.') ? 'location-field-changed'
      : /Timeout|timeout/.test(message) ? 'timeout'
      : /strict mode violation/.test(message) ? 'ambiguous-selector'
      : /intercepts pointer events/.test(message) ? 'overlay'
      : /Cannot read properties of undefined/.test(message) ? 'undefined-property'
      : /Cannot read properties of null/.test(message) ? 'null-property'
      : /Target.*closed|context.*closed/i.test(message) ? 'browser-closed'
      : /Execution context was destroyed/.test(message) ? 'navigation-during-read'
      : 'other-exception';
    let state = {probeFailed:true};
    try {
      state = await page.evaluate(({selector,expectedZip}) => {
        const root = document.querySelector(selector);
        const field = root?.querySelector('#field-bopis-store-locator-address');
        const value = field?.value || '';
        return {
          dialogPresent:!!root, inputPresent:!!field,
          inputEmpty:value.length === 0,
          inputExactMatch:value === expectedZip,
          inputTrimmedMatch:value.trim() === expectedZip,
          inputContainsExpectedZip:value.includes(expectedZip),
          inputIsFiveDigits:/^\d{5}$/.test(value),
          loadingStarted:window.__stockSearch?.started === true,
          loadingFinished:window.__stockSearch?.finished === true,
          visibleLoader:!!root && [...root.querySelectorAll('.skeleton-loader')].some(e=>e.getClientRects().length>0),
          storeRowsPresent:!!root?.querySelector('.tdds-styled-radio')
        };
      }, {selector:MODAL,expectedZip:zip});
    } catch {}
    console.log('Pickup diagnostic:', JSON.stringify({stage,category,...state}));
    return {zip,variant:variant.name,sku:variant.sku,status:'unknown',stores:[],error:error.message.split('\n')[0]};
  } finally { await context.close(); }
}
