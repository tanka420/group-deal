import {assertNewBusinessAction,AccountAccessError} from '../domain/accountAccess';
import { z } from "zod";
import crypto from "node:crypto";
import {ethers} from 'ethers';
import { store } from "../db/store";
import {SessionService,SessionError} from './sessionService';
import type {SessionProof} from './sessionService';
import {AuthService} from './authService';
import type {ProductMutationState} from '../db/rowPersistence';
import { computeTermsHash } from "../utils/crypto";
import type { ProductSnapshot, RightsRecord,ProductCommandKind,ProductCommandRecord } from "../domain/product";
import {productInventory,productVersionInventory,licenseVersionInventory,rightsInventory,reviewedProductInventory,productCommandKey,productCommandReceipt,productContentDigest,productCommandInputHash} from '../domain/product';

const text = (max:number) => z.string().trim().min(1).max(max);
const httpsUrl = z.string().max(2000).refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
},"A public HTTPS URL is required");
export const productInputSchema = z.object({
  title:text(180), description:text(12000), category:text(80), vendor:text(180),
  thumbnailUrl:httpsUrl, media:z.array(z.object({url:httpsUrl,alt:text(180)}).strict()).max(8),
  requirements:z.array(text(500)).max(20), supportPolicy:text(4000),
  license:z.object({edition:text(180),seatsPerUnit:z.number().int().min(1).max(10000),usageScope:z.enum(["PERSONAL","COMMERCIAL"]),
    durationDays:z.number().int().min(1).max(36500).nullable(),activationWindowDays:z.number().int().min(1).max(3650).nullable(),
    regions:z.array(text(100)).min(1).max(100),transferable:z.boolean(),supportDays:z.number().int().min(0).max(36500),usageTerms:text(8000)}).strict(),
}).strict();
const recordId=z.string().min(1).max(180).refine(id=>!['__proto__','prototype','constructor'].includes(id));
type ReviewAuthorization={proof:SessionProof;stepUp:{walletAddress:string;signature:string;challengeMessage:string}};
const commandIdSchema=recordId.refine(v=>/^[-A-Za-z0-9:_]{8,180}$/.test(v));
type VersionResult={product:ReturnType<typeof productInventory>;version:ReturnType<typeof productVersionInventory>;license:ReturnType<typeof licenseVersionInventory>};
type CommandResult={receipt:ReturnType<typeof productCommandReceipt>};
const commandSelection=(actorId:string,commandId:string|undefined,kind:ProductCommandKind)=>commandId===undefined?{}:{commandKey:productCommandKey(actorId,commandIdSchema.parse(commandId)),commandKind:kind};
function retainedCommand(state:ProductMutationState,actorId:string,commandId:string|undefined,kind:ProductCommandKind,inputHash:string){if(!state.command)return null;if(commandId===undefined||!state.commandAudited||state.command.actorId!==actorId||state.command.commandId!==commandId)throw Error('CONFLICT: product command audit binding changed');const receipt=productCommandReceipt(state.command);if(receipt.status==='CANCELED')throw Error('PRODUCT_COMMAND_CANCELED');if(receipt.kind!==kind||state.command.inputHash!==inputHash)throw Error('CONFLICT: product command input changed');return{result:{receipt},writes:[],audit:[],replay:true};}
const makeCommand=(actorId:string,commandId:string,kind:Exclude<ProductCommandKind,'CANCEL'>,inputHash:string,contentDigest:string,ids:Pick<ProductCommandRecord,'productId'|'productVersionId'|'licenseVersionId'|'previousVersionId'|'rightsId'>,createdAt:number):ProductCommandRecord=>({id:productCommandKey(actorId,commandId),schema:'GroupDealProductCommandV1',actorId,commandId,kind,status:'SUCCEEDED',inputHash,contentDigest,...ids,createdAt});

export class ProductService {
  private static actor(state:Pick<ProductMutationState,'auth'>,id:string,role:'seller'|'operator',proof?:SessionProof){
    if(role==='operator'&&!proof)throw new SessionError('OPERATOR_ACCESS_REQUIRED',403);
    const account=proof?(role==='operator'?SessionService.assertOperatorCommitted(proof,state.auth):SessionService.assertCommitted(proof,state.auth)):state.auth.user;
    if(!account||account.id!==id||typeof account.email!=='string'||!Array.isArray(account.roles)||account.roles.some(r=>!['buyer','seller','operator'].includes(r))||!account.roles.includes(role)){if(proof)throw new SessionError(role==='seller'?'SELLER_ROLE_REQUIRED':'OPERATOR_ROLE_REQUIRED',403);throw Error('FORBIDDEN: '+role+' role is required');}return account;
  }
  private static graph(state:Pick<ProductMutationState,'product'|'version'|'license'>){
    try{
      const product=productInventory(state.product),version=productVersionInventory(state.version),license=licenseVersionInventory(state.license);
      if(product.id!==version.productId||product.sellerId!==version.sellerId||license.id!==version.licenseVersionId||license.productId!==product.id)throw Error();
      const content={title:version.title,description:version.description,category:version.category,vendor:version.vendor,thumbnailUrl:version.thumbnailUrl,media:version.media,requirements:version.requirements,supportPolicy:version.supportPolicy},licenseContent={edition:license.edition,seatsPerUnit:license.seatsPerUnit,usageScope:license.usageScope,durationDays:license.durationDays,activationWindowDays:license.activationWindowDays,regions:license.regions,transferable:license.transferable,supportDays:license.supportDays,usageTerms:license.usageTerms};
      productInputSchema.parse({...content,license:licenseContent});if(license.contentHash!==computeTermsHash({schema:'GroupDealLicenseV1',...licenseContent})||version.contentHash!==computeTermsHash({schema:'GroupDealProductV1',...content,licenseContentHash:license.contentHash}))throw Error();return{product,version,license};
    }catch{throw Error('CONFLICT: committed product version/license binding is invalid');}
  }
  public static createVersion(sellerId:string,input:unknown,productId?:string,expectedVersionId?:string,proof?:SessionProof):VersionResult;
  public static createVersion(sellerId:string,input:unknown,productId:string|undefined,expectedVersionId:string|undefined,proof:SessionProof|undefined,commandId:string):VersionResult&CommandResult|CommandResult;
  public static createVersion(sellerId:string,input:unknown,productId?:string,expectedVersionId?:string,proof?:SessionProof,commandId?:string) {
    recordId.parse(sellerId);if(productId!==undefined){recordId.parse(productId);recordId.parse(expectedVersionId);}else if(expectedVersionId!==undefined)throw Error('VALIDATION: product version input is invalid');
    const parsed=productInputSchema.parse(input),kind=productId?'VERSION':'CREATE',contentDigest=productContentDigest(parsed),inputHash=productCommandInputHash(kind,contentDigest,productId,expectedVersionId);
    return store.mutateProduct<VersionResult|CommandResult>({actorId:sellerId,sessionKey:proof?.key,productId,...commandSelection(sellerId,commandId,kind)},state=>{
      this.actor(state,sellerId,'seller',proof);const retained=retainedCommand(state,sellerId,commandId,kind,inputHash);if(retained)return retained;assertNewBusinessAction(state.auth.user,'SELLER');const product=state.product;
      if (productId && (!product || product.sellerId !== sellerId)) throw new Error("FORBIDDEN: product is not owned by this seller");
      if (product?.status === "ARCHIVED") throw new Error("CONFLICT: archived product cannot be edited");
      if (product && product.latestVersionId !== expectedVersionId) throw new Error("CONFLICT: product version changed; reload before editing");
      const previous=product?this.graph(state):undefined;if(previous&&previous.version.version>=Number.MAX_SAFE_INTEGER)throw Error('CONFLICT: product version limit reached');
      const id = product?.id || `prd_${crypto.randomUUID()}`, versionId = `pv_${crypto.randomUUID()}`, licenseId = `lv_${crypto.randomUUID()}`, now = Date.now();
      const {license,...content} = parsed;
      const licenseVersion={id:licenseId,productId:id,...license,contentHash:computeTermsHash({schema:'GroupDealLicenseV1',...license}),createdAt:now};
      const version={id:versionId,productId:id,version:previous?previous.version.version+1:1,sellerId,...content,licenseVersionId:licenseId,contentHash:computeTermsHash({schema:'GroupDealProductV1',...content,licenseContentHash:licenseVersion.contentHash}),createdAt:now};
      const nextProduct=product?{...product,latestVersionId:versionId}:{id,sellerId,latestVersionId:versionId,status:'DRAFT',createdAt:now};
      const command=commandId===undefined?undefined:makeCommand(sellerId,commandId,kind,inputHash,contentDigest,{productId:id,productVersionId:versionId,licenseVersionId:licenseId,...(product?{previousVersionId:expectedVersionId}:{})},now);
      return{result:{product:productInventory(nextProduct),version:productVersionInventory(version),license:licenseVersionInventory(licenseVersion),...(command?{receipt:productCommandReceipt(command)}:{})},writes:[{kind:'INSERT',collection:'licenseVersions',key:licenseId,value:licenseVersion},{kind:'INSERT',collection:'productVersions',key:versionId,value:version},product?{kind:'PRODUCT_PATCH',key:id,patch:{latestVersionId:versionId}}:{kind:'INSERT',collection:'products',key:id,value:nextProduct},...(command?[{kind:'INSERT' as const,collection:'productCommands' as const,key:command.id,value:command}]:[])],audit:[{role:'seller',action:'PRODUCT_VERSION_CREATED',details:{productId:id,productVersionId:versionId,licenseVersionId:licenseId,contentHash:version.contentHash}}]};
    });
  }
  public static submitRights(sellerId:string,productVersionId:string,input:unknown,proof?:SessionProof):RightsRecord;
  public static submitRights(sellerId:string,productVersionId:string,input:unknown,proof:SessionProof|undefined,commandId:string):{rights:RightsRecord}&CommandResult|CommandResult;
  public static submitRights(sellerId:string,productVersionId:string,input:unknown,proof?:SessionProof,commandId?:string) {
    recordId.parse(sellerId);recordId.parse(productVersionId);
    const metadata = z.object({declaration:z.enum(["OWNER","AUTHORIZED_RESELLER"]),declarationText:text(4000),evidenceRefs:z.array(httpsUrl).min(1).max(12)}).strict().parse(input);
    const contentDigest=productContentDigest(metadata),inputHash=productCommandInputHash('RIGHTS',contentDigest,productVersionId);
    return store.mutateProduct<RightsRecord|{rights:RightsRecord}&CommandResult|CommandResult>({actorId:sellerId,sessionKey:proof?.key,versionId:productVersionId,...commandSelection(sellerId,commandId,'RIGHTS')},state=>{
      this.actor(state,sellerId,'seller',proof);const retained=retainedCommand(state,sellerId,commandId,'RIGHTS',inputHash);if(retained)return retained;assertNewBusinessAction(state.auth.user,'SELLER');const version=state.version;
      if (!version || version.sellerId !== sellerId) throw new Error("FORBIDDEN: product version is not owned by this seller");
      const graph=this.graph(state);if(graph.product.status==='ARCHIVED')throw Error('CONFLICT: archived product cannot submit rights');
      const records=state.relatedRights.map(rightsInventory);if(records.some(r=>r.sellerId!==sellerId||r.licenseVersionId!==version.licenseVersionId))throw Error('CONFLICT: committed rights binding is invalid');
      const pending=records.find(r=>r.status==='SUBMITTED');
      if (pending) throw new Error("CONFLICT: a rights review is already pending");
      const rights:RightsRecord = {id:`rgt_${crypto.randomUUID()}`,productVersionId,licenseVersionId:version.licenseVersionId,sellerId,...metadata,status:"SUBMITTED",createdAt:Date.now(),decisions:[]};
      const command=commandId===undefined?undefined:makeCommand(sellerId,commandId,'RIGHTS',inputHash,contentDigest,{productId:graph.product.id,productVersionId,licenseVersionId:version.licenseVersionId,rightsId:rights.id},rights.createdAt);
      return{result:command?{rights:rightsInventory(rights),receipt:productCommandReceipt(command)}:rightsInventory(rights),writes:[{kind:'INSERT',collection:'rights',key:rights.id,value:rights},...(command?[{kind:'INSERT' as const,collection:'productCommands' as const,key:command.id,value:command}]:[])],audit:[{role:'seller',action:'RIGHTS_SUBMITTED',details:{rightsId:rights.id,productVersionId}}]};
    });
  }
  public static reviewRights(operatorId:string,rightsId:string,input:unknown,authorization?:ReviewAuthorization) {
    recordId.parse(operatorId);recordId.parse(rightsId);const metadata=z.object({decision:z.enum(['APPROVED','REQUESTED_INFO','REJECTED','REVOKED']),reason:text(4000),validUntil:z.number().int().positive().max(8640000000000).optional()}).strict().parse(input);
    let challengeKey:string|undefined;try{if(authorization)challengeKey=operatorId+':OPERATOR_ACTION:'+ethers.getAddress(authorization.stepUp.walletAddress).toLowerCase();}catch{throw Error('FORBIDDEN: operator step-up input is invalid');}
    return store.mutateProduct({actorId:operatorId,sessionKey:authorization?.proof.key,rightsId,challengeKey},state=>{
      const account=this.actor(state,operatorId,'operator',authorization?.proof);if(!state.rights)throw Error('NOT_FOUND: rights submission');let rights:RightsRecord;try{rights=rightsInventory(state.rights);}catch{throw Error('CONFLICT: rights metadata is invalid');}
      if (rights.sellerId === operatorId) throw new Error("FORBIDDEN: a seller cannot review their own rights");
      if(authorization)AuthService.assertCommittedStepUpSignature(account,state.challenge,authorization.stepUp.walletAddress,authorization.stepUp.signature,authorization.stepUp.challengeMessage);
      if (metadata.decision === "APPROVED" && (!metadata.validUntil || metadata.validUntil <= Math.floor(Date.now()/1000))) throw new Error("VALIDATION: approval must have a future expiry");
      if (metadata.decision === "REVOKED" ? rights.status !== "APPROVED" : rights.status !== "SUBMITTED") throw new Error("CONFLICT: invalid rights review transition");
      const graph=this.graph(state);if(graph.version.sellerId!==rights.sellerId||graph.version.id!==rights.productVersionId||graph.license.id!==rights.licenseVersionId||metadata.decision==='APPROVED'&&graph.product.status==='ARCHIVED')throw Error('CONFLICT: rights product/license binding is invalid');
      if(rights.status==='SUBMITTED'?rights.decisions.length!==0:rights.decisions.length!==1||rights.decisions[0].decision!=='APPROVED'||rights.decisions[0].actorId===rights.sellerId)throw Error('CONFLICT: rights decision provenance is invalid');
      const decision={actorId:operatorId,decision:metadata.decision,reason:metadata.reason,timestamp:Date.now()},validUntil=metadata.decision==='APPROVED'?metadata.validUntil:rights.validUntil,next={...rights,status:metadata.decision,validUntil,decisions:[...rights.decisions,decision]};
      return{result:rightsInventory(next),writes:[{kind:'RIGHTS_REVIEW',key:rightsId,decision,...(metadata.decision==='APPROVED'?{validUntil:metadata.validUntil}:{})}],consumeChallenge:!!authorization,audit:[...(authorization?[{role:'operator' as const,action:'OPERATOR_STEP_UP_VERIFIED',details:{wallet:authorization.stepUp.walletAddress,action:'OPERATOR_ACTION'}}]:[]),{role:'operator',action:'RIGHTS_REVIEWED',details:{rightsId,productVersionId:rights.productVersionId,decision:metadata.decision,validUntil}}]};
    });
  }
  public static snapshot(sellerId:string,productVersionId:string,minimumValidUntil:number,policy?:ReturnType<typeof store.readProductPolicyState>): ProductSnapshot {
    const validId=(id:unknown)=>typeof id==='string'&&id.length>0&&id.length<=180&&!['__proto__','prototype','constructor'].includes(id);
    if(!validId(sellerId)||!validId(productVersionId)||!Number.isSafeInteger(minimumValidUntil)||minimumValidUntil<0||minimumValidUntil>8640000000000)throw Error('VALIDATION: product policy input is invalid');
    let state:ReturnType<typeof store.readProductPolicyState>;
    try{state=policy??store.readProductPolicyState(sellerId,productVersionId);}catch{throw Error('CONFLICT: committed product policy is unavailable');}
    if(state.user?.id!==sellerId||!Array.isArray(state.user.roles)||state.user.roles.some(r=>!['buyer','seller','operator'].includes(r))||!state.user.roles.includes('seller')||!state.version||!state.product||!state.license)throw Error('FORBIDDEN: unavailable product version');
    const cachedSeller=store.db.users[sellerId];
    if(!policy&&(cachedSeller?.id!==sellerId||JSON.stringify(cachedSeller.roles)!==JSON.stringify(state.user.roles)))throw Error('CONFLICT: seller authority changed');
    let version:ReturnType<typeof productVersionInventory>,product:ReturnType<typeof productInventory>,license:ReturnType<typeof licenseVersionInventory>,records:ReturnType<typeof rightsInventory>[];
    try{
      version=productVersionInventory(state.version);product=productInventory(state.product);license=licenseVersionInventory(state.license);records=state.rights.map(rightsInventory);
      const content={title:version.title,description:version.description,category:version.category,vendor:version.vendor,thumbnailUrl:version.thumbnailUrl,media:version.media,requirements:version.requirements,supportPolicy:version.supportPolicy};
      const licenseContent={edition:license.edition,seatsPerUnit:license.seatsPerUnit,usageScope:license.usageScope,durationDays:license.durationDays,activationWindowDays:license.activationWindowDays,regions:license.regions,transferable:license.transferable,supportDays:license.supportDays,usageTerms:license.usageTerms};
      productInputSchema.parse({...content,license:licenseContent});
      if(license.contentHash!==computeTermsHash({schema:'GroupDealLicenseV1',...licenseContent})||version.contentHash!==computeTermsHash({schema:'GroupDealProductV1',...content,licenseContentHash:license.contentHash}))throw Error('Content hash changed');
    }catch{throw Error('CONFLICT: product policy metadata is invalid');}
    if(version.id!==productVersionId||version.sellerId!==sellerId||product.id!==version.productId||product.sellerId!==sellerId||product.status==='ARCHIVED'||license.id!==version.licenseVersionId||license.productId!==product.id)throw Error('FORBIDDEN: unavailable product version');
    const now=Date.now(),minimum=Math.max(minimumValidUntil,Math.floor(now/1000)+1);
    const rights=records.filter(r=>{
      const decision=r.decisions.at(-1);
      return r.sellerId===sellerId&&r.productVersionId===version.id&&r.licenseVersionId===license.id&&r.status==='APPROVED'&&Number.isSafeInteger(r.validUntil)&&(r.validUntil??0)>=minimum&&r.createdAt<=now&&r.decisions.length===1&&decision?.decision==='APPROVED'&&decision.actorId!==sellerId&&decision.timestamp>=r.createdAt&&decision.timestamp<=now;
    }).sort((a,b)=>b.createdAt-a.createdAt||String(a.id).localeCompare(String(b.id)))[0];
    if(!rights)throw Error('RIGHTS_REQUIRED: an independent approval covering this product, license and delivery window is required');
    return {schema:'GroupDealProductSnapshotV1',productId:product.id,productVersionId:version.id,licenseVersionId:license.id,productContentHash:version.contentHash,licenseContentHash:license.contentHash,rightsId:rights.id,rightsApprovedAt:rights.decisions.at(-1)!.timestamp,rightsValidUntil:rights.validUntil!};
  }
  public static assertPublishable(sellerId:string,snapshot:ProductSnapshot|undefined,minimumValidUntil:number,policy?:ReturnType<typeof store.readProductPolicyState>):void {
    if (!snapshot) throw new Error("PRODUCT_REQUIRED: attach a reviewed product/license version before preparing a new campaign");
    const fields=['schema','productId','productVersionId','licenseVersionId','productContentHash','licenseContentHash','rightsId','rightsApprovedAt','rightsValidUntil'] as const;
    if(typeof snapshot!=='object'||Array.isArray(snapshot)||Object.keys(snapshot).length!==fields.length||fields.some(f=>!Object.hasOwn(snapshot,f)))throw Error('CONFLICT: campaign product snapshot is invalid');
    const current = this.snapshot(sellerId,snapshot.productVersionId,minimumValidUntil,policy);
    if(fields.some(f=>current[f]!==snapshot[f]))throw new Error("CONFLICT: campaign product/rights snapshot changed");
  }
  public static archive(sellerId:string,productId:string,proof?:SessionProof):void;
  public static archive(sellerId:string,productId:string,proof:SessionProof|undefined,commandId:string,expectedVersionId:string):CommandResult;
  public static archive(sellerId:string,productId:string,proof?:SessionProof,commandId?:string,expectedVersionId?:string) {
    recordId.parse(sellerId);recordId.parse(productId);
    if(commandId!==undefined)recordId.parse(expectedVersionId);const contentDigest=productContentDigest({expectedVersionId}),inputHash=productCommandInputHash('ARCHIVE',contentDigest,productId,expectedVersionId);
    return store.mutateProduct<void|CommandResult>({actorId:sellerId,sessionKey:proof?.key,productId,...commandSelection(sellerId,commandId,'ARCHIVE')},state=>{
      this.actor(state,sellerId,'seller',proof);const retained=retainedCommand(state,sellerId,commandId,'ARCHIVE',inputHash);if(retained)return retained;const product=state.product;
      if (!product || product.sellerId!==sellerId) throw new Error("FORBIDDEN: product ownership");
      productInventory(product);if(commandId!==undefined&&product.latestVersionId!==expectedVersionId)throw Error('CONFLICT: product version changed before archive');const graph=commandId===undefined?undefined:this.graph(state),command=commandId===undefined?undefined:makeCommand(sellerId,commandId,'ARCHIVE',inputHash,contentDigest,{productId,productVersionId:graph!.version.id,licenseVersionId:graph!.license.id},Date.now());
      return{result:command?{receipt:productCommandReceipt(command)}:undefined,writes:[{kind:'PRODUCT_PATCH',key:productId,patch:{status:'ARCHIVED'}},...(command?[{kind:'INSERT' as const,collection:'productCommands' as const,key:command.id,value:command}]:[])],audit:[{role:'seller',action:'PRODUCT_ARCHIVED',details:{productId}}]};
    });
  }
  public static commandReceipt(sellerId:string,commandId:string,proof:SessionProof){recordId.parse(sellerId);commandIdSchema.parse(commandId);const state=store.readProductCommandState(sellerId,proof.key,productCommandKey(sellerId,commandId));this.actor(state,sellerId,'seller',proof);if(!state.command)throw Error('NOT_FOUND: product command');if(!state.commandAudited)throw Error('PRODUCT_COMMAND_UNAVAILABLE');try{return{receipt:productCommandReceipt(state.command),revision:state.revision,serverTime:Date.now()};}catch{throw Error('PRODUCT_COMMAND_UNAVAILABLE');}}
  public static cancelCommand(sellerId:string,commandId:string,proof:SessionProof){recordId.parse(sellerId);commandIdSchema.parse(commandId);return store.mutateProduct<CommandResult>({actorId:sellerId,sessionKey:proof.key,...commandSelection(sellerId,commandId,'CANCEL')},state=>{this.actor(state,sellerId,'seller',proof);if(state.command){if(!state.commandAudited||state.command.actorId!==sellerId||state.command.commandId!==commandId)throw Error('CONFLICT: product command audit binding changed');return{result:{receipt:productCommandReceipt(state.command)},writes:[],audit:[],replay:true};}const command:ProductCommandRecord={id:productCommandKey(sellerId,commandId),schema:'GroupDealProductCommandV1',actorId:sellerId,commandId,kind:'CANCEL',status:'CANCELED',inputHash:productContentDigest({schema:'GroupDealProductCancellationV1',actorId:sellerId,commandId}),createdAt:Date.now()};return{result:{receipt:productCommandReceipt(command)},writes:[{kind:'INSERT',collection:'productCommands',key:command.id,value:command}],audit:[{role:'seller',action:'PRODUCT_COMMAND_CANCELED',details:{}}]};});}
  /** Explicit public allowlist: rights evidence, declarations and reviewer IDs stay private. */
  public static publicVersion(versionId:string,graph:Pick<import('../db/rowPersistence').PublicProjectionState,'productVersions'|'licenseVersions'>=store.db) {
    const v = Object.hasOwn(graph.productVersions,versionId)?graph.productVersions[versionId]:undefined;
    if (!v) return null;
    const l=graph.licenseVersions[v.licenseVersionId];
    if(v.id!==versionId||!l||l.id!==v.licenseVersionId||l.productId!==v.productId)throw Error('PROJECTION_UNAVAILABLE');
    if(!httpsUrl.safeParse(v.thumbnailUrl).success||!Array.isArray(v.media)||v.media.some(m=>!m||!httpsUrl.safeParse(m.url).success))throw Error('PROJECTION_UNAVAILABLE');
    try{return reviewedProductInventory(v,l);}catch{throw Error('PROJECTION_UNAVAILABLE');}
  }
}
