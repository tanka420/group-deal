export type OrderSummary={totalOrders:number;grossCommitted:string|null;sellerAllocated:string|null;sellerClaimed:string|null;sellerClaimable:string|null;buyerClaimable:string|null;claimableRebate:string|null;claimableRefund:string|null};
export type SellerSummary=OrderSummary&{campaignCount:number;publishedCampaignCount:number;activeCampaignCount:number;productCount:number;readyToDeliver:number;overdueDelivery:number;disputedOrders:number};
const amount=(v:unknown)=>v===null||typeof v==='string'&&/^\d{1,78}$/.test(v)&&BigInt(v)<2n**256n;
export function readSummary(value:any,owner:string,seller=false):OrderSummary|SellerSummary{
 const s=value?.summary;if((seller?value?.sellerAccountId:value?.buyerAccountId)!==owner||!s||!Number.isSafeInteger(s.totalOrders)||s.totalOrders<0||['grossCommitted','sellerAllocated','sellerClaimed','sellerClaimable','buyerClaimable','claimableRebate','claimableRefund'].some(k=>!amount(s[k])))throw Error('SUMMARY_INVALID');
 if(s.sellerAllocated!==null&&s.sellerClaimed!==null&&s.sellerClaimable!==null&&BigInt(s.sellerAllocated)!==BigInt(s.sellerClaimed)+BigInt(s.sellerClaimable)||s.buyerClaimable!==null&&s.claimableRebate!==null&&s.claimableRefund!==null&&BigInt(s.buyerClaimable)!==BigInt(s.claimableRebate)+BigInt(s.claimableRefund))throw Error('SUMMARY_INVALID');
 if(seller&&['campaignCount','publishedCampaignCount','activeCampaignCount','productCount','readyToDeliver','overdueDelivery','disputedOrders'].some(k=>!Number.isSafeInteger(s[k])||s[k]<0))throw Error('SUMMARY_INVALID');
 return s;
}
