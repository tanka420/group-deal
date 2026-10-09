import {store} from '../db/store';
import {SessionService,SessionError,SessionProof} from './sessionService';
import {productInventory,productVersionInventory,licenseVersionInventory} from '../domain/product';
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=180&&!['__proto__','prototype','constructor'].includes(value);
const integer=(value:unknown,min=0,max=8640000000000000)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
export class SellerResourceInventoryError extends Error{constructor(readonly code:'RESOURCE_INVENTORY_INPUT_INVALID'|'RESOURCE_INVENTORY_FORBIDDEN'|'RESOURCE_INVENTORY_UNAVAILABLE',readonly status:number){super(code);}}
const unavailable=()=>new SellerResourceInventoryError('RESOURCE_INVENTORY_UNAVAILABLE',503);
function graph(row:{version?:unknown;product?:unknown;license?:unknown},sellerId:string){try{const version=productVersionInventory(row.version),product=productInventory(row.product),license=licenseVersionInventory(row.license);if(version.sellerId!==sellerId||product.sellerId!==sellerId||version.productId!==product.id||version.licenseVersionId!==license.id||license.productId!==product.id||![version.contentHash,license.contentHash].every(s=>/^0x[a-fA-F0-9]{64}$/.test(s)))throw Error();return version;}catch{throw unavailable();}}
export function sellerResourceInventory(sellerId:string,proof:SessionProof,query:unknown){
  if(!object(query)||Object.keys(query).some(k=>k!=='productVersionId')||query.productVersionId!==undefined&&!id(query.productVersionId))throw new SellerResourceInventoryError('RESOURCE_INVENTORY_INPUT_INVALID',400);
  let snapshot:ReturnType<typeof store.readSellerResourceState>;try{snapshot=store.readSellerResourceState(sellerId,proof.key,query.productVersionId);}catch{throw unavailable();}
  const account=SessionService.assertCommitted(proof,snapshot.auth);if(account.id!==sellerId||!account.roles.includes('seller'))throw new SessionError('SELLER_ROLE_REQUIRED',403);
  if(query.productVersionId!==undefined){if(!snapshot.requested?.version||snapshot.requested.version.sellerId!==sellerId)throw new SellerResourceInventoryError('RESOURCE_INVENTORY_FORBIDDEN',403);graph(snapshot.requested,sellerId);}
  const resources=snapshot.resources.map(row=>{const r=row.resource,v=graph(row,sellerId);if(!id(r.id)||r.sellerId!==sellerId||r.productVersionId!==v.id||typeof r.fileName!=='string'||!r.fileName||r.fileName.length>180||/[\x00-\x1f\\/]/.test(r.fileName)||!['application/pdf','application/zip','text/plain','image/png','image/jpeg'].includes(r.mimeType)||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)||!integer(r.byteLength,1,16*1024*1024)||!integer(r.createdAt)||!integer(row.availableLicenses)||row.invalidInventoryBindings!==0)throw unavailable();return{id:r.id,sellerId,productVersionId:v.id,fileName:r.fileName,mimeType:r.mimeType,sha256:r.sha256,byteLength:r.byteLength,createdAt:r.createdAt,availableLicenses:row.availableLicenses};});
  return{sellerAccountId:sellerId,serverTime:Date.now(),revision:snapshot.revision,resources};
}
