/** Search normalisation changes neither stored terms nor product identities. */
export function normalizeCatalogText(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
}
