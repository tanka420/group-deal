/** Shared presentation fixtures with the committed product/actor graph. */
export function ownedProductFixture(item, sellerId) {
  const licenseId = item.license.id ?? 'fixture-license-' + item.version.id;
  return {
    ...item,
    sellerId,
    version: {...item.version, productId: item.id, sellerId, licenseVersionId: licenseId, media: item.version.media ?? []},
    license: {...item.license, id: licenseId, productId: item.id},
    rights: item.rights.map(right => ({...right, sellerId, productVersionId: item.version.id, licenseVersionId: licenseId})),
  };
}
export function productInventoryFixture(items, sellerId) {
  return {sellerAccountId: sellerId, serverTime: Date.now(), revision: 1, products: items.map(item => ownedProductFixture(item, sellerId))};
}
