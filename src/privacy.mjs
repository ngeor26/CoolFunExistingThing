export function readZipCodes(value = '') {
  const codes = value.split(',').map(v => v.trim());
  if (codes.length !== 2 || !codes.every(v => /^\d{5}$/.test(v)) || new Set(codes).size !== 2)
    throw new Error('Set ZIP_CODES to two distinct five-digit ZIP codes separated by a comma.');
  return codes;
}

// Allowlist public fields. Raw browser errors, store names and addresses can reveal locations.
export function publicResults(results, zipCodes) {
  return results.map(r => ({
    location: `Location ${zipCodes.indexOf(r.zip) + 1}`,
    variant: r.variant,
    status: r.status,
    ...(r.status === 'unknown' ? {error: 'Pickup check could not be verified.'} : {})
  }));
}
