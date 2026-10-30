export function classify({ rows = [], text = '', complete = false }) {
  if (!complete || /technical issue|please try again|access denied|captcha/i.test(text))
    return { status: 'unknown', stores: [] };
  const stores = rows.filter(r => /\bin stock\b|hurry, only a few left/i.test(r.status)
    && !/out of stock|not available/i.test(r.status));
  if (stores.length) return { status: 'available', stores };
  if (/isn't available for pickup at stores within 20 miles/i.test(text))
    return { status: 'unavailable', stores: [] };
  return { status: 'unknown', stores: [] };
}

export function notification(results) {
  const found = results.filter(r => r.status === 'available');
  if (!found.length) return null;
  return found.map(r => `${r.zip}: ${r.variant}\n${r.stores.map(s => `${s.name} — ${s.address} (${s.status})`).join('\n')}`).join('\n\n');
}
