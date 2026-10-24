import {store} from '../db/store';
import {SessionService,SessionError,type SessionProof} from './sessionService';
import {orderDto} from './orderDto';
import {sellerCampaignOverview} from '../domain/sellerInventory';
import {productInventory,productVersionInventory,licenseVersionInventory,rightsInventory} from '../domain/product';
import {workspaceSelection,workspacePagination,type WorkspaceKind} from './workspaceQuery';
import {ZodError} from 'zod';
export function workspaceFailure(res:any,error:unknown){res.setHeader('Cache-Control','private, no-store');if(error instanceof SessionError){res.status(error.status).json({error:error.code});return;}const invalid=error instanceof ZodError||error instanceof Error&&/^WORKSPACE_(DATE|CURSOR)_INVALID$/.test(error.message);res.status(invalid?400:503).json({error:invalid?'WORKSPACE_INPUT_INVALID':'WORKSPACE_UNAVAILABLE'});}

export function financialOrderKnown(o:Record<string,any>){return o.accountingVerified===true&&Number.isSafeInteger(o.quantity)&&o.quantity>0&&['lockedUnitPrice','committedGross','rebateAllocated','buyerRefundAllocated','sellerAllocated','buyerClaimedAmount','sellerClaimedAmount','buyerClaimable','sellerClaimable'].every(k=>typeof o[k]==='string'&&/^\d{1,78}$/.test(o[k])&&BigInt(o[k])<2n**256n)&&BigInt(o.lockedUnitPrice)*BigInt(o.quantity)===BigInt(o.committedGross);}
export function orderSummary(orders:Record<string,any>[]){
 const known=orders.every(financialOrderKnown),sum=(key:string)=>known?orders.reduce((n,o)=>n+BigInt(o[key]),0n).toString():null;
 const buyerKnown=known;
 const rebate=buyerKnown?orders.reduce((n,o)=>n+(BigInt(o.rebateAllocated)>BigInt(o.buyerClaimedAmount)?BigInt(o.rebateAllocated)-BigInt(o.buyerClaimedAmount):0n),0n):null,buyer=sum('buyerClaimable');
 return {totalOrders:orders.length,grossCommitted:sum('committedGross'),sellerAllocated:sum('sellerAllocated'),sellerClaimed:sum('sellerClaimedAmount'),sellerClaimable:sum('sellerClaimable'),buyerClaimable:buyer,claimableRebate:rebate?.toString()??null,claimableRefund:buyer!==null&&rebate!==null?(BigInt(buyer)-rebate).toString():null};
}
export function workspaceList(proof:SessionProof,input:unknown,kind:WorkspaceKind){
 const selection=workspaceSelection(input,proof.account.id,kind),s=store.readWorkspacePage(proof.account.id,proof.key,selection),account=SessionService.assertCommitted(proof,s.auth);
 if(kind.startsWith('seller-')&&!account.roles.includes('seller'))throw new SessionError('SELLER_ROLE_REQUIRED',403);
 if(proof.record.realm==='ADMIN')throw new SessionError('APP_SESSION_REQUIRED',403);
 const page=(s.rows as any[]).slice(0,20),pagination=workspacePagination(account.id,selection,s.total,s.rows),base={serverTime:Date.now(),revision:s.revision,projection:{source:'INDEXER',financialStateChainVerified:false}};
 if(kind==='seller-campaigns')return {...base,sellerAccountId:account.id,campaigns:page.map(r=>sellerCampaignOverview(r.record)),pagination};
 if(kind==='seller-products')return {...base,sellerAccountId:account.id,products:page.map(r=>({...productInventory(r.product),version:productVersionInventory(r.version),license:licenseVersionInventory(r.license),rights:r.rights.map(rightsInventory)})),pagination};
 if(kind==='wallet-trades')return {...base,accountId:account.id,rows:page.map(r=>{
   const f=selection.filters,role=f.direction!=='SELL'&&r.record.buyerAccountId===account.id&&(!f.principal||r.record.buyerPrincipal?.toLowerCase()===f.principal)?'BUY':'SELL',dto=orderDto(r.record) as Record<string,any>,known=financialOrderKnown(dto),field=(k:string)=>known&&typeof dto[k]==='string'&&/^\d{1,78}$/.test(dto[k])?dto[k]:null;
   return {id:role+':'+r.id,orderId:r.id,campaignId:r.record.campaignId,productId:r.record.productSnapshot?.productId??null,title:r.campaign?.title||r.record.campaignId,direction:role,wallet:role==='BUY'?r.record.buyerPrincipal:r.campaign?.sellerPayoutWallet,createdAt:r.record.createdAt,status:r.record.deliveryStatus,campaignStatus:r.campaign?.status??'UNKNOWN',committedGross:field('committedGross'),allocated:field(role==='BUY'?'buyerAllocated':'sellerAllocated'),claimed:field(role==='BUY'?'buyerClaimedAmount':'sellerClaimedAmount'),claimable:field(role==='BUY'?'buyerClaimable':'sellerClaimable'),accountingVerified:known,commitmentTxHash:dto.commitmentTxHash??null};
 }),pagination};
 const orders=page.map(r=>({...orderDto(r.record),hasEntitlement:r.hasEntitlement,managedResourceDelivery:r.managedResourceDelivery,...(kind==='seller-orders'?{sellerAccountId:account.id}:{}),sellerPayoutWallet:r.campaign?.sellerPayoutWallet,campaignTitle:r.campaign?.title||r.record.campaignId,campaignStatus:r.campaign?.status??'UNKNOWN',campaignThumbnail:r.campaign?.thumbnailUrl||'',onchainCampaignId:r.campaign?.onchainCampaignId,finalizedAt:r.campaign?.finalizedAt,deliverySlaSeconds:r.campaign?.deliverySlaSeconds}));
 return {...base,...(kind==='seller-orders'?{sellerAccountId:account.id}:{buyerAccountId:account.id}),orders,pagination};
}
export function buyerSummary(proof:SessionProof){
 const s=store.readBuyerOrderState(proof.account.id,proof.key),account=SessionService.assertCommitted(proof,s.auth);if(proof.record.realm==='ADMIN')throw new SessionError('APP_SESSION_REQUIRED',403);
 return {buyerAccountId:account.id,summary:orderSummary(s.orders.map(r=>orderDto(r.order))),serverTime:Date.now()};
}
export function sellerOverview(proof:SessionProof){
 const s=store.readSellerInventoryState(proof.account.id,proof.key,true),account=SessionService.assertCommitted(proof,s.auth);if(!account.roles.includes('seller')||proof.record.realm==='ADMIN')throw new SessionError('SELLER_ROLE_REQUIRED',403);
 const products=store.readProductInventoryState(account.id,proof.key);SessionService.assertCommitted(proof,products.auth);
 if(s.revision!==products.revision)throw Error('WORKSPACE_CHANGED');
 const now=Math.floor(Date.now()/1000),ready=s.orders.filter(r=>r.order.deliveryStatus==='PENDING'&&r.campaign.status==='FINALIZED');
 return {sellerAccountId:account.id,serverTime:Date.now(),revision:s.revision,summary:{...orderSummary(s.orders.map(r=>orderDto(r.order))),campaignCount:s.campaigns.length,publishedCampaignCount:s.campaigns.filter(c=>c.status!=='DRAFT').length,activeCampaignCount:s.campaigns.filter(c=>['PUBLISHED','ACTIVE'].includes(c.status??'')&&typeof c.startTime==='number'&&c.startTime<=now&&typeof c.endTime==='number'&&now<=c.endTime).length,productCount:products.products.filter(p=>p.product.status!=='ARCHIVED').length,readyToDeliver:ready.length,overdueDelivery:ready.filter(r=>typeof r.campaign.finalizedAt==='number'&&typeof r.campaign.deliverySlaSeconds==='number'&&now>r.campaign.finalizedAt+r.campaign.deliverySlaSeconds).length,disputedOrders:s.orders.filter(r=>r.order.deliveryStatus==='DISPUTED').length},projection:{source:'INDEXER',financialStateChainVerified:false}};
}
