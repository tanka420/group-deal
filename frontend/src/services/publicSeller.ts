import deployment from '../../../shared/contracts.json';
import {PublicSeller,readPublicSeller} from '../../../shared/publicSeller.mjs';
import {PublicWidget,readPublicWidget} from '../../../shared/publicWidget.mjs';
export type {PublicSeller};
export interface SellerDeal {card:PublicWidget;openingPriceBaseUnits:string|null;participantCount:number|null;thumbnailUrl:string|null;edition:string;supportPolicy:string;}
export interface SellerDealPage {deals:SellerDeal[];nextCursor:string|null;}
const scope={chainId:deployment.chainId,hubAddress:deployment.contracts.GroupDealHub.address};
export class PublicSellerUnavailable extends Error {constructor(public readonly status:number){super('PUBLIC_SELLER_UNAVAILABLE');}}
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
async function get(path:string,signal:AbortSignal):Promise<any>{
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)controller.abort();const timer=setTimeout(abort,10000);
 try{const response=await fetch('/api/v1'+path,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});if(!response.ok)throw new PublicSellerUnavailable(response.status);const value=await response.json();if(value?.version!=='1.0'||value.chainId!==scope.chainId)throw new Error('PUBLIC_SELLER_INVALID');return value;}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
export async function getPublicSeller(id:string,signal:AbortSignal):Promise<PublicSeller>{if(!validId(id))throw new PublicSellerUnavailable(404);const data=await get('/sellers/'+encodeURIComponent(id),signal);return readPublicSeller(data.seller,id,scope);}
function imageUrl(value:unknown):string|null{if(typeof value!=='string'||value.length>2000)return null;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export async function getSellerDeals(id:string,cursor:string|null,signal:AbortSignal):Promise<SellerDealPage>{
 if(!validId(id))throw new PublicSellerUnavailable(404);if(cursor!==null&&!/^[A-Za-z0-9_-]{1,512}$/.test(cursor))throw new Error('PUBLIC_SELLER_INVALID');
 const data=await get('/sellers/'+encodeURIComponent(id)+'/campaigns?limit=12&sort=newest'+(cursor?'&cursor='+encodeURIComponent(cursor):''),signal),p=data.pagination;
 if(!Array.isArray(data.campaigns)||data.campaigns.length>12||p?.limit!==12||p.sort!=='newest'||typeof p.hasMore!=='boolean'||(p.hasMore?typeof p.nextCursor!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(p.nextCursor)||p.nextCursor===cursor||data.campaigns.length!==12:p.nextCursor!==null))throw new Error('PUBLIC_SELLER_INVALID');
 const ids=new Set<string>(),deals:SellerDeal[]=data.campaigns.map((c:any)=>{
  if(!validId(c?.id)||ids.has(c.id)||c.seller?.id!==id||c.visibility!=='PUBLIC')throw new Error('PUBLIC_SELLER_INVALID');ids.add(c.id);const card=readPublicWidget(c.card,c.id,scope);if(card.visibility!=='PUBLIC')throw new Error('PUBLIC_SELLER_INVALID');
  const opening=c.tiers?.[0]?.price??null,participants=c.totalBuyerCount??null;if(opening!==null&&(typeof opening!=='string'||!/^\d{1,78}$/.test(opening)||BigInt(opening)<=0n)||participants!==null&&(!Number.isSafeInteger(participants)||participants<0))throw new Error('PUBLIC_SELLER_INVALID');
  return {card,openingPriceBaseUnits:opening,participantCount:participants,thumbnailUrl:imageUrl(c.thumbnailUrl),edition:typeof c.product?.license?.edition==='string'&&c.product.license.edition.length<=80?c.product.license.edition:'',supportPolicy:typeof c.product?.supportPolicy==='string'&&c.product.supportPolicy.length<=2000?c.product.supportPolicy:''};
 });return {deals,nextCursor:p.nextCursor};
}
