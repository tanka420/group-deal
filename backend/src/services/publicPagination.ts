import crypto from "node:crypto";
import {z} from "zod";
import {config} from "../config";
import {CampaignRecord} from "../db/store";
import {accessiblePublicCampaignRecord} from "./publicCampaign";
import {store} from '../db/store';
import type {PublicProjectionState} from '../db/rowPersistence';
import {campaignDto} from './campaignDto';
import {normalizeCatalogText} from '../../../shared/catalogQuery.mjs';

const querySchema=z.object({limit:z.string().regex(/^(?:[1-9]\d?|100)$/).optional(),cursor:z.string().max(512).optional(),status:z.enum(["PUBLISHED","ACTIVE","FINALIZED","CANCELLED"]).optional(),metric:z.enum(["BUYER_COUNT","UNITS_COUNT"]).optional(),sort:z.enum(["newest","oldest"]).optional(),q:z.string().max(120).regex(/^[^\u0000-\u001f\u007f]*$/).optional(),category:z.string().max(80).regex(/^[^\u0000-\u001f\u007f]*$/).optional()}).strict();
const compare=(a:CampaignRecord,b:CampaignRecord)=>a.startTime-b.startTime||(a.id<b.id?-1:a.id>b.id?1:0);

export function pagePublicCampaigns(records:CampaignRecord[],query:unknown,sellerId?:string,state:PublicProjectionState=store.readPublicProjectionState(sellerId===undefined?{}:{sellerId},config.arcChainId,config.hubAddress)){
  const parsed=querySchema.safeParse(query);if(!parsed.success)throw new Error("VALIDATION");
  const options=parsed.data,limit=Number(options.limit??20),sort=options.sort??"newest";
  const q=normalizeCatalogText(options.q??''),category=normalizeCatalogText(options.category??'');
  const baseScope=[config.arcChainId,config.hubAddress.toLowerCase(),sort,options.status??null,options.metric??null];
  // Preserve issued scopes when these new, optional filters are absent.
  if(q||category)baseScope.push('CATALOG_FILTERS',q||null,category||null);
  const scope=crypto.createHash("sha256").update(JSON.stringify(sellerId===undefined?baseScope:[...baseScope,"SELLER",sellerId])).digest("hex");
  let boundary:{startTime:number;id:string}|undefined;
  if(options.cursor){
    try {
      if(!/^[A-Za-z0-9_-]+$/.test(options.cursor))throw new Error();
      const bytes=Buffer.from(options.cursor,"base64url");if(bytes.toString("base64url")!==options.cursor)throw new Error();
      const decoded=JSON.parse(bytes.toString("utf8"));
      if(!Array.isArray(decoded)||decoded.length!==4||decoded[0]!==1||decoded[1]!==scope||!Number.isSafeInteger(decoded[2])||decoded[2]<0||typeof decoded[3]!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(decoded[3]))throw new Error();
      boundary={startTime:decoded[2],id:decoded[3]};
    }catch{throw new Error("VALIDATION");}
  }
  const publicRecords=records.map(c=>state.campaigns[c.id]).filter(c=>!!c&&c.visibility==="PUBLIC"&&accessiblePublicCampaignRecord(c,state.products));
  const categories=new Map<string,{value:string;label:string;campaignCount:number}>();
  for(const c of publicRecords){
    if(typeof c.category!=='string'||c.category.length>80)throw new Error('PROJECTION_UNAVAILABLE');
    const key=normalizeCatalogText(c.category),previous=categories.get(key),label=previous?.label??c.category.trim();
    if(key)categories.set(key,{value:label,label,campaignCount:(previous?.campaignCount??0)+1});
  }
  const eligible=publicRecords.filter(c=>{
    if(options.status&&c.status!==options.status||options.metric&&c.metric!==options.metric||category&&normalizeCatalogText(c.category)!==category)return false;
    if(!q)return true;
    const product=campaignDto(c,state).product;
    const text=normalizeCatalogText([c.title,c.description,c.category,product?.title,product?.vendor,product?.license?.edition].filter(v=>typeof v==='string').join(' '));
    return q.split(' ').every(term=>text.includes(term));
  });
  eligible.sort((a,b)=>compare(a,b)*(sort==="newest"?-1:1));
  const filtered=boundary?eligible.filter(c=>compare(c,boundary as CampaignRecord)*(sort==="newest"?-1:1)>0):eligible;
  const selected=filtered.slice(0,limit),last=selected.at(-1),hasMore=filtered.length>limit;
  const nextCursor=hasMore&&last?Buffer.from(JSON.stringify([1,scope,last.startTime,last.id])).toString("base64url"):null;
  return {selected,matching:eligible,categories:[...categories.values()].sort((a,b)=>a.value<b.value?-1:a.value>b.value?1:0),filters:{q:(options.q??'').trim(),category:(options.category??'').trim(),status:options.status??null,metric:options.metric??null,sort},pagination:{limit,sort,nextCursor,hasMore}};
}
