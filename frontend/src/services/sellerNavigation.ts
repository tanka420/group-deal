export const sellerSections={OVERVIEW:'',CAMPAIGNS:'campaigns',FULFILLMENT:'orders',REVENUE:'revenue',DISPUTES:'disputes',PRODUCTS:'products',PROFILE:'profile',WEBHOOKS:'integrations',TRANSACTIONS:'transactions',CREATE:'create'} as const;
export type SellerSection=keyof typeof sellerSections;
export function sellerSection(path=window.location.pathname):SellerSection{return (Object.keys(sellerSections) as SellerSection[]).find(key=>path.replace(/\/$/,'')==='/seller'+(sellerSections[key]?'/'+sellerSections[key]:''))??'OVERVIEW';}
export function sellerPath(section:SellerSection){return '/seller'+(sellerSections[section]?'/'+sellerSections[section]:'');}
