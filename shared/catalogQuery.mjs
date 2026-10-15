/** Search normalisation changes neither stored terms nor product identities. */
export function normalizeCatalogText(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
}

/** Parse user-entered USDC without floating point or exponent notation. */
export function catalogPriceUnits(value) {
  if(typeof value!=='string'||value.length>85||!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))return null;
  const [whole,fraction='']=value.split('.');
  const units=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
  return units<2n**256n?units:null;
}
