export const sellerSections={CAMPAIGNS:'',FULFILLMENT:'orders',REVENUE:'revenue',DISPUTES:'disputes',PRODUCTS:'products',PROFILE:'profile',WEBHOOKS:'integrations',CREATE:'create'} as const;
export type SellerSection=keyof typeof sellerSections;
export function sellerSection(path=window.location.pathname):SellerSection{return (Object.keys(sellerSections) as SellerSection[]).find(key=>path.replace(/\/$/,'')==='/seller'+(sellerSections[key]?'/'+sellerSections[key]:''))??'CAMPAIGNS';}
export function sellerPath(section:SellerSection){return '/seller'+(sellerSections[section]?'/'+sellerSections[section]:'');}
