import {ethers} from 'ethers';
import {readPublicWidget,type PublicWidget} from '../../../shared/publicWidget.mjs';
import {normalizeCatalogText} from '../../../shared/catalogQuery.mjs';

export type CatalogFilters={q:string;category:string;status:''|'PUBLISHED'|'ACTIVE'|'FINALIZED'|'CANCELLED';metric:''|'BUYER_COUNT'|'UNITS_COUNT';sort:'newest'|'oldest'};
export const defaultCatalogFilters:CatalogFilters={q:'',category:'',status:'',metric:'',sort:'newest'};
export type CatalogDeal={card:PublicWidget;description:string;category:string;thumbnailUrl:string|null;deliverySlaSeconds:number;earlyRebateEnabled:boolean;rightsApproved:boolean;product:{vendor:string;edition:string;seatsPerUnit:number;usageScope:'PERSONAL'|'COMMERCIAL';durationDays:number|null}|null;seller:{displayName:string;profilePath:string|null}};
export type CatalogPage={hubAddress:string;deals:CatalogDeal[];categories:{value:string;label:string;campaignCount:number}[];nextCursor:string|null;summary:{campaignCount:number;openCampaignCount:number;totalGrossCommitted:string;fetchedAt:number}};
const validText=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max;
const integer=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const fail=():never=>{throw Error('CATALOG_RESPONSE_INVALID');};
const preferenceKey='groupdeal_catalog_filters_v1';
export function catalogFilters(value:unknown):CatalogFilters {
 if(!value||typeof value!=='object')return {...defaultCatalogFilters};
 const v=value as CatalogFilters;
 if(!validText(v.q,120)||!validText(v.category,80)||/[\u0000-\u001f\u007f]/.test(v.q+v.category)||!['','PUBLISHED','ACTIVE','FINALIZED','CANCELLED'].includes(v.status)||!['','BUYER_COUNT','UNITS_COUNT'].includes(v.metric)||!['newest','oldest'].includes(v.sort))return {...defaultCatalogFilters};
 return {q:v.q.trim(),category:v.category.trim(),status:v.status,metric:v.metric,sort:v.sort};
}
export function readCatalogPreference():CatalogFilters {
 const query=new URLSearchParams(window.location.search);
 if(window.location.pathname==='/explore')return catalogFilters(Object.fromEntries(Object.entries(defaultCatalogFilters).map(([key,value])=>[key,query.get(key)??value])));
 try{return catalogFilters(JSON.parse(sessionStorage.getItem(preferenceKey)||'null'));}catch{return {...defaultCatalogFilters};}
}
export function catalogHref(value:CatalogFilters):string {
 const query=new URLSearchParams();for(const [key,item] of Object.entries(value))if(item&&item!==defaultCatalogFilters[key as keyof CatalogFilters])query.set(key,item);
 return '/explore'+(query.size?'?'+query.toString():'');
}
export function saveCatalogPreference(value:CatalogFilters){try{sessionStorage.setItem(preferenceKey,JSON.stringify(value));}catch{/* Filters remain usable when storage is unavailable. */}}
function imageUrl(value:unknown):string|null {
 if(!validText(value,2048)||!value)return null;
 try{const url=new URL(value,window.location.origin);return !url.username&&!url.password&&(url.protocol==='https:'||url.origin===window.location.origin)?url.href:null;}catch{return null;}
}
export class CatalogUnavailable extends Error {constructor(public status:number){super('CATALOG_UNAVAILABLE');}}
export function readCatalog(value:unknown,filters:CatalogFilters,cursor:string|null,expectedHub?:string):CatalogPage {
 const v=value as any,requested={q:filters.q,category:filters.category,status:filters.status||null,metric:filters.metric||null,sort:filters.sort};
 if(!v||v.version!=='1.0'||v.chainId!==5042002||!ethers.isAddress(v.hubAddress)||v.hubAddress===ethers.ZeroAddress||expectedHub&&v.hubAddress.toLowerCase()!==expectedHub.toLowerCase()||v.amountEncoding!=='USDC base-unit integer strings (6 decimals)'||!v.filters||Object.keys(requested).some(k=>v.filters[k]!==requested[k as keyof typeof requested])||!Array.isArray(v.campaigns)||v.campaigns.length>12||!v.pagination||v.pagination.limit!==12||v.pagination.sort!==filters.sort||typeof v.pagination.hasMore!=='boolean')fail();
 const next=v.pagination.nextCursor;
 if(next!==null&&(!validText(next,512)||!/^[A-Za-z0-9_-]+$/.test(next)||next===cursor)||v.pagination.hasMore!==(next!==null))fail();
 const s=v.summary,p=s?.projection;
 if(s?.scope!=='MATCHING_PUBLIC_CURRENT_DEPLOYMENT'||!integer(s.campaignCount)||!integer(s.openCampaignCount)||s.openCampaignCount>s.campaignCount||!validText(s.totalGrossCommitted,90)||!/^(0|[1-9]\d*)$/.test(s.totalGrossCommitted)||p?.source!=='INDEXER'||p.financialStateChainVerified!==false||!integer(p.fetchedAt)||s.campaignCount<v.campaigns.length||v.categoriesScope!=='PUBLIC_CURRENT_DEPLOYMENT'||!Array.isArray(v.categories))fail();
 const categoryIds=new Set<string>(),categories=v.categories.map((c:any)=>{
  if(!validText(c.value,80)||!c.value.trim()||categoryIds.has(normalizeCatalogText(c.value))||!validText(c.label,80)||!c.label.trim()||normalizeCatalogText(c.label)!==normalizeCatalogText(c.value)||!integer(c.campaignCount)||c.campaignCount===0)fail();
  categoryIds.add(normalizeCatalogText(c.value));return {value:c.value,label:c.label,campaignCount:c.campaignCount};
 });
 const ids=new Set<string>(),deals:CatalogDeal[]=v.campaigns.map((c:any)=>{
  const card=readPublicWidget(c.card,c.id,{chainId:5042002,hubAddress:v.hubAddress});
  if(ids.has(card.id)||c.visibility!=='PUBLIC'||c.chainId!==v.chainId||c.hubAddress?.toLowerCase()!==v.hubAddress.toLowerCase()||card.visibility!=='PUBLIC'||card.title!==c.title||card.status!==c.status||card.metric!==c.metric||card.endTime!==c.endTime||card.platformFeeBps!==c.platformFeeBps||card.endTime>8640000000000||!validText(c.description,12000)||!validText(c.category,80)||!integer(c.deliverySlaSeconds)||![86400,172800].includes(c.deliverySlaSeconds)||typeof c.earlyRebateEnabled!=='boolean'||typeof c.termsPolicyReviewRequired!=='boolean'||!c.rights||!validText(c.rights.status,32)||!validText(c.seller?.displayName,80))fail();
  if(!card.purchaseHeld&&(c.product===null||c.termsPolicyReviewRequired||c.rights.status!=='APPROVED'||!integer(c.rights.validUntil)||c.rights.validUntil<c.endTime+c.deliverySlaSeconds))fail();
  ids.add(card.id);let product:CatalogDeal['product']=null;
  if(c.product!==null){const x=c.product,license=x?.license;if(!validText(x?.vendor,180)||!validText(license?.edition,180)||!integer(license.seatsPerUnit)||license.seatsPerUnit===0||!['PERSONAL','COMMERCIAL'].includes(license.usageScope)||license.durationDays!==null&&(!integer(license.durationDays)||license.durationDays===0))fail();product={vendor:x.vendor,edition:license.edition,seatsPerUnit:license.seatsPerUnit,usageScope:license.usageScope,durationDays:license.durationDays};}
  const path=c.seller.profilePath;
  if(path!==undefined&&path!==null&&(typeof path!=='string'||!/^#seller-profile-[A-Za-z0-9_-]{1,128}$/.test(path)))fail();
  return {card,description:c.description,category:c.category,thumbnailUrl:imageUrl(c.thumbnailUrl),deliverySlaSeconds:c.deliverySlaSeconds,earlyRebateEnabled:c.earlyRebateEnabled,rightsApproved:c.rights.status==='APPROVED',product,seller:{displayName:c.seller.displayName,profilePath:path??null}};
 });
 return {hubAddress:ethers.getAddress(v.hubAddress),deals,categories,nextCursor:next,summary:{campaignCount:s.campaignCount,openCampaignCount:s.openCampaignCount,totalGrossCommitted:s.totalGrossCommitted,fetchedAt:p.fetchedAt}};
}
export async function getCatalog(filters:CatalogFilters,cursor:string|null,signal:AbortSignal,expectedHub?:string):Promise<CatalogPage>{
 const params=new URLSearchParams({limit:'12',sort:filters.sort});
 for(const key of ['q','category','status','metric'] as const)if(filters[key])params.set(key,filters[key]);
 if(cursor)params.set('cursor',cursor);
 const response=await fetch('/api/v1/catalog?'+params,{signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)]),credentials:'omit',cache:'no-store',redirect:'error'});
 if(!response.ok)throw new CatalogUnavailable(response.status);
 return readCatalog(await response.json(),filters,cursor,expectedHub);
}
/** Exact six-decimal token representation, including values above Number.MAX_SAFE_INTEGER. */
export function catalogUSDC(baseUnits:string,language:'vi'|'en'):string {
 const value=BigInt(baseUnits),whole=(value/1000000n).toLocaleString(language==='vi'?'vi-VN':'en-US'),fraction=(value%1000000n).toString().padStart(6,'0').replace(/0+$/,'');
 return whole+(fraction?(language==='vi'?',':'.')+fraction:'');
}
