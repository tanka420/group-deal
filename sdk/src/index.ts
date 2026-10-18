import * as crypto from "node:crypto";

export interface GroupDealConfig {baseUrl:string;webhookSecret?:string;webhookSubscriptionId?:string;timeoutMs?:number;}
export type OperationPhase="PREPARED"|"AWAITING_SIGNATURE"|"SUBMITTED"|"RECEIPT_VERIFIED"|"PROJECTED"|"UNKNOWN"|"REVERTED"|"SUPERSEDED"|"EXPIRED";
export interface DeliveryOperation {id:string;action:"DELIVER";resourceId:string;chainId:number;hubAddress:string;principal:string;calldata:string;phase:OperationPhase;txHash?:string;createdAt:number;updatedAt:number;broadcastWitnesses?:{txHash:string;nonce:number;observedAt:number;source:"SIGNED_TRANSACTION"|"RPC_TRANSACTION"}[];replacements?:{previousTxHash:string;txHash:string;nonce:number;blockNumber:number;blockHash:string;kind:"SAME_CALL"|"NONCE_CONSUMED";verifiedAt:number}[];}
export interface BuyOperation extends Omit<DeliveryOperation,"action"> {action:"BUY";authorizationExpiry?:{blockNumber:number;blockHash:string;blockTimestamp:number;deadline:number;authorizationNonce:number;quoteBlockNumber:number;quoteBlockHash:string;authorizationSigner:string;verifiedAt:number};}
export interface DeliveryOperation {deliveryRetry?:{previousOperationId:string;terminal:{phase:"REVERTED"|"SUPERSEDED";txHash:string;blockNumber:number;blockHash:string};capability:{blockNumber:number;blockHash:string;checkedAt:number}};deliveryQuote?:{blockNumber:number;blockHash:string;checkedAt:number};}
export interface PublicLicense {id:string;edition:string;seatsPerUnit:number;usageScope:"PERSONAL"|"COMMERCIAL";durationDays:number|null;activationWindowDays:number|null;regions:string[];transferable:boolean;supportDays:number;usageTerms:string;contentHash:string;}
export interface PublicProduct {id:string;productId:string;title:string;description:string;category:string;vendor:string;thumbnailUrl:string;media:{url:string;alt:string}[];requirements:string[];supportPolicy:string;contentHash:string;license:PublicLicense;}
export interface PublicCampaign {id:string;onchainCampaignId:number;protocolVersion:1|2;chainId:number;hubAddress:string;title:string;description:string;metric:"BUYER_COUNT"|"UNITS_COUNT";status:string;tiers:{threshold:number;price:string}[];currentUnlockedTier:number;totalBuyerCount:number;totalUnitsCommitted:number;totalGrossCommitted:string;platformFeeBps:number;product:PublicProduct|null;campaignUrl:string|null;rights:{status:string;validUntil?:number};seller:{id?:string;profilePath?:string;displayName:string;payoutWallet:string;verifiedSellerBadge:boolean;verifiedRightsBadge:boolean};}
export interface PublicApiMetadata {version:string;network:string;chainId:number;amountEncoding:string;}
/** Public indexer snapshot, never a verified purchase quote or financial authorization. */
export interface PublicWidgetData extends PublicApiMetadata {version:"1.0";id:string;hubAddress:string;visibility:"PUBLIC"|"UNLISTED";title:string;status:"PUBLISHED"|"ACTIVE"|"FINALIZED"|"CANCELLED";metric:"BUYER_COUNT"|"UNITS_COUNT";currentMetric:number;endTime:number;currentPriceBaseUnits:string;currentPriceUSDC:string;nextPriceBaseUnits:string|null;nextPriceUSDC:string|null;nextThreshold:number|null;priceKind:"CURRENT_GROUP_PRICE"|"FINAL_CLEARING_PRICE"|"CANCELLED_LAST_PRICE";priceScope:"PER_UNIT_BEFORE_BUYER_REBATE";platformFeeBps:number;purchaseHeld:boolean;campaignUrl:string|null;widgetUrl:string|null;projection:{source:"INDEXER";financialStateChainVerified:false;fetchedAt:number};thumbnailUrl:string;product:PublicProduct|null;}
export interface CampaignListOptions {limit?:number;cursor?:string;status?:"PUBLISHED"|"ACTIVE"|"FINALIZED"|"CANCELLED";metric?:"BUYER_COUNT"|"UNITS_COUNT";sort?:"newest"|"oldest";q?:string;category?:string;}
export interface PublicCatalog extends PublicApiMetadata {hubAddress:string;campaigns:PublicSellerCampaign[];pagination:Pagination;filters:{q:string;category:string;status:NonNullable<CampaignListOptions['status']>|null;metric:NonNullable<CampaignListOptions['metric']>|null;sort:'newest'|'oldest'};categories:{value:string;label:string;campaignCount:number}[];categoriesScope:'PUBLIC_CURRENT_DEPLOYMENT';summary:{scope:'MATCHING_PUBLIC_CURRENT_DEPLOYMENT';campaignCount:number;openCampaignCount:number;totalGrossCommitted:string;projection:PublicWidgetData['projection']};}
export interface PublicSeller {id:string;chainId:number;hubAddress:string;displayName:string;bio:string;payoutWallet:string;payoutWalletStatus:"ACCOUNT_CREDENTIAL_LINKED"|"UNVERIFIED";verifiedSellerBadge:boolean;profileUrl:string|null;profilePath:string;metrics:{scope:"PUBLIC_CURRENT_DEPLOYMENT";publicCampaignCount:number;openCampaignCount:number;finalizedCampaignCount:number;cancelledCampaignCount:number;productCount:number};projection:{source:"INDEXER";financialStateChainVerified:false;fetchedAt:number};}
export interface PublicSellerCampaign extends PublicCampaign {card:Omit<PublicWidgetData,"network"|"amountEncoding"|"thumbnailUrl"|"product">;}
export interface Pagination {limit:number;sort:"newest"|"oldest";nextCursor:string|null;hasMore:boolean;}
export interface SellerFollow {version:1;userId:string;sellerId:string;revision:number;following:boolean;notifyNewDeals:boolean;notifyDealUpdates:boolean;changedAt:number|null;available:boolean;inAppEnabled:boolean;displayName?:string;}
export interface SellerFollowInput {idempotencyKey:string;expectedRevision:number;following:boolean;notifyNewDeals:boolean;notifyDealUpdates:boolean;}
export interface SellerFollowResult {command:{id:string;userId:string;sellerId:string;state:"APPLIED";revision:number;following:boolean;notifyNewDeals:boolean;notifyDealUpdates:boolean};follow:SellerFollow;}
export type ApiErrorCode="VALIDATION"|"NOT_FOUND"|"FORBIDDEN"|"CONFLICT"|"RATE_LIMITED"|"PROJECTION_UNAVAILABLE"|"SERVICE_UNAVAILABLE"|"HTTP_ERROR";
export interface WebhookEnvelope {id:string;event:string;timestamp:number;createdAt:number;data:Record<string,string|number|boolean>;}
/** Persist the full event into a durable inbox with UNIQUE(subscriptionId,eventId), atomically. Return false for a duplicate. */
export interface WebhookInbox {persist(subscriptionId:string,event:WebhookEnvelope):Promise<boolean>;}
export interface WebhookHeaders {signature:string;timestamp:string;eventId:string;event:string;}
export interface WebhookRecoveryReview {id:string;subscriptionId:string;phase:'PREPARED'|'VERIFYING'|'VERIFIED'|'FAILED'|'CANCELLED'|'INVALIDATED'|'EXPIRED';createdAt:number;expiresAt:number;attempts:number;verifiedAt:number|null;scope:'NEW_EVENTS_ONLY';canVerify:boolean;retryAt:number|null;}
export interface BuyerResourceGrant {id:string;unitIndex:number;seatsPerUnit:number;fileName:string;mimeType:string;byteLength:number;sha256:string;activatedAt:number;redeemedAt:number|null;licenseExpiresAt:number|null;activationDeadline:number|null;requiresRedemption:boolean;canRedeem:boolean;downloadReady:boolean;accessStatus:'DOWNLOAD_READY'|'AWAITING_REDEMPTION'|'LICENSE_EXPIRED'|'ACTIVATION_WINDOW_EXPIRED';}
export class GroupDealApiError extends Error {constructor(public readonly status:number,public readonly code:ApiErrorCode="HTTP_ERROR",public readonly retryAfterSeconds?:number){super(`GroupDeal API rejected the request (HTTP ${status})`);this.name="GroupDealApiError";}}


export type SupportTicketState='OPEN'|'WAITING_BUYER'|'WAITING_SELLER'|'RESOLVED'|'CLOSED';
export interface SupportUpload {filename:string;mimeType:'application/pdf'|'image/png'|'image/jpeg'|'text/plain';dataBase64:string;}
export interface SupportTicketSummary {version:1;id:string;kind:'ACCOUNT'|'ORDER';accountId:string;sellerId:string|null;orderId:string|null;createdBy:string;subject:string;state:SupportTicketState;assignedOperatorId:string|null;revision:number;createdAt:number;updatedAt:number;closedAt:number|null;attachmentRetainUntil:number|null;}
export interface SupportTicket extends SupportTicketSummary {viewerRole:'buyer'|'seller'|'operator';canAssign:boolean;canReply:boolean;messages:{id:string;ticketId:string;authorId:string;authorRole:'buyer'|'seller'|'operator';text:string;attachmentIds:string[];createdAt:number}[];attachments:{id:string;ticketId:string;messageId:string;uploadedBy:string;filename:string;mimeType:SupportUpload['mimeType'];byteLength:number;sha256:string;state:'AVAILABLE'|'REMOVED'|'PURGED';canDownload:boolean;createdAt:number;removedAt:number|null;purgedAt:number|null}[];}
export interface SupportCommandResult {command:{version:1;id:string;userId:string;action:'CREATE'|'REPLY'|'STATUS'|'ASSIGN'|'REMOVE_ATTACHMENT';ticketId:string;requestHash:string;appliedRevision:number;messageId:string|null;attachmentId:string|null;createdAt:number;state:'APPLIED'};ticket:SupportTicket;}
export interface SupportCreateInput {idempotencyKey:string;kind:'ACCOUNT'|'ORDER';orderId:string|null;subject:string;message:string;attachments?:SupportUpload[];}
export interface SupportRevisionInput {idempotencyKey:string;expectedRevision:number;}

export class GroupDealSDK {
  private readonly baseUrl:string;
  private readonly timeoutMs:number;
  constructor(private readonly config:GroupDealConfig) {
    const url=new URL(config.baseUrl);
    if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||url.protocol!=="https:"&&!(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)))throw new Error("Configure an HTTPS API origin, or an explicit local development origin");
    this.baseUrl=url.toString().replace(/\/$/,"");this.timeoutMs=config.timeoutMs??10000;
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>60000)throw new Error("Invalid SDK request timeout");
  }
  private id(value:string):string {if(typeof value!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new Error("Invalid GroupDeal resource identifier");return encodeURIComponent(value);}
  private async request<T>(route:string,token?:string,body?:unknown):Promise<T> {
    if(body!==undefined&&(typeof token!=="string"||!token||/\s/.test(token)))throw new Error("A valid authenticated session token is required");
    const response=await fetch(this.baseUrl+route,{method:body===undefined?"GET":"POST",headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(this.timeoutMs),redirect:"error"});
    if(!response.ok){
      let code:ApiErrorCode="HTTP_ERROR";
      try{const body=await response.json() as {code?:string};if(["VALIDATION","NOT_FOUND","FORBIDDEN","CONFLICT","RATE_LIMITED","PROJECTION_UNAVAILABLE","SERVICE_UNAVAILABLE"].includes(body.code||""))code=body.code as ApiErrorCode;}catch{/* Only allowlisted codes are exposed; remote error text is private. */}
      const retry=Number(response.headers.get("Retry-After"));throw new GroupDealApiError(response.status,code,Number.isSafeInteger(retry)&&retry>0&&retry<=3600?retry:undefined);
    }
    return response.json() as Promise<T>;
  }
  public verifyWebhookSignature(rawBody:string,signatureHeader:string,timestampHeader:string,toleranceSeconds=300):boolean {
    if(!this.config.webhookSecret)throw new Error("Webhook secret is not configured");
    if(!/^[0-9]{1,12}$/.test(timestampHeader)||!/^sha256=[a-f0-9]{64}$/.test(signatureHeader)||!Number.isSafeInteger(toleranceSeconds)||toleranceSeconds<0||toleranceSeconds>3600)return false;
    const timestamp=Number(timestampHeader),now=Math.floor(Date.now()/1000);
    if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>toleranceSeconds)return false;
    const expected=crypto.createHmac("sha256",this.config.webhookSecret).update(`${timestampHeader}.${rawBody}`).digest();
    return crypto.timingSafeEqual(expected,Buffer.from(signatureHeader.slice(7),"hex"));
  }
  /** A separate challenge response proves possession of the existing secret; it never enters the order-event inbox. */
  public answerWebhookRecoveryChallenge(rawBody:string,headers:WebhookHeaders):{response:string}|null{
    if(!this.config.webhookSubscriptionId||Buffer.byteLength(rawBody)>4096||headers.event!=='subscription.review'||!this.verifyWebhookSignature(rawBody,headers.signature,headers.timestamp,60))return null;
    try{
      const e=JSON.parse(rawBody),d=e?.data,now=Date.now();
      if(!e||Object.keys(e).sort().join(',')!=='createdAt,data,event,id,timestamp,version'||e.version!==1||e.event!==headers.event||!/^evt_[A-Za-z0-9_-]{1,80}$/.test(e.id)||e.id!==headers.eventId||e.timestamp!==Number(headers.timestamp)||!Number.isSafeInteger(e.createdAt)||e.createdAt>now+30000||e.createdAt<now-60000||!d||Object.keys(d).sort().join(',')!=='chainId,expiresAt,hubAddress,nonce,reviewId,scope,subscriptionId'||!/^whr_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(d.reviewId)||d.subscriptionId!==this.config.webhookSubscriptionId||! /^[A-Za-z0-9_-]{43}$/.test(d.nonce)||!Number.isSafeInteger(d.expiresAt)||d.expiresAt<=now||d.expiresAt>e.createdAt+30000||d.scope!=='NEW_EVENTS_ONLY'||!Number.isSafeInteger(d.chainId)||d.chainId<1||!/^0x[a-f0-9]{40}$/.test(d.hubAddress))return null;
      return {response:crypto.createHmac('sha256',this.config.webhookSecret!).update('groupdeal:webhook-recovery-response:v1:'+crypto.createHash('sha256').update(rawBody).digest('hex')).digest('hex')};
    }catch{return null;}
  }
  private webhookReviewId(value:string){if(typeof value!=='string'||!/^whr_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value))throw Error('Invalid webhook review identifier');return value;}
  public prepareWebhookRecoveryReview(sessionToken:string,idempotencyKey:string):Promise<{review:WebhookRecoveryReview}>{
    if(typeof idempotencyKey!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(idempotencyKey))throw Error('Invalid webhook review command key');
    return this.request('/api/seller/webhooks/recovery-reviews',sessionToken,{idempotencyKey});
  }
  public getWebhookRecoveryReview(sessionToken:string,reviewId?:string):Promise<{review:WebhookRecoveryReview|null;enabledForNewEvents:boolean;serverTime:number}>{
    if(typeof sessionToken!=='string'||!sessionToken||/\s/.test(sessionToken))throw Error('A valid authenticated session token is required');
    return this.request('/api/seller/webhooks/recovery-reviews'+(reviewId?'/'+this.webhookReviewId(reviewId):''),sessionToken);
  }
  public verifyWebhookRecoveryReview(sessionToken:string,reviewId:string):Promise<{review:WebhookRecoveryReview}>{return this.request('/api/seller/webhooks/recovery-reviews/'+this.webhookReviewId(reviewId)+'/verify',sessionToken,{});}
  private resourceGrant(value:any):BuyerResourceGrant{
    const time=(v:any)=>Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000,nullable=(v:any)=>v===null||time(v);
    if(!value||typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.id)||!Number.isSafeInteger(value.unitIndex)||value.unitIndex<0||!Number.isSafeInteger(value.seatsPerUnit)||value.seatsPerUnit<1||value.seatsPerUnit>10000||typeof value.fileName!=='string'||!value.fileName||value.fileName.length>180||/[\u0000-\u001f\u007f\\/]/.test(value.fileName)||!['application/pdf','application/zip','text/plain','image/png','image/jpeg'].includes(value.mimeType)||!Number.isSafeInteger(value.byteLength)||value.byteLength<1||value.byteLength>16*1024*1024||!/^[a-f0-9]{64}$/.test(value.sha256)||!time(value.activatedAt)||![value.redeemedAt,value.licenseExpiresAt,value.activationDeadline].every(nullable)||![value.requiresRedemption,value.canRedeem,value.downloadReady].every(v=>typeof v==='boolean')||!['DOWNLOAD_READY','AWAITING_REDEMPTION','LICENSE_EXPIRED','ACTIVATION_WINDOW_EXPIRED'].includes(value.accessStatus)||value.canRedeem!==(value.accessStatus==='AWAITING_REDEMPTION')||value.downloadReady!==(value.accessStatus==='DOWNLOAD_READY')||value.downloadReady&&value.requiresRedemption||value.canRedeem&&!value.requiresRedemption||value.requiresRedemption&&value.redeemedAt!==null)throw Error('Resource access response was not verified');
    return {id:value.id,unitIndex:value.unitIndex,seatsPerUnit:value.seatsPerUnit,fileName:value.fileName,mimeType:value.mimeType,byteLength:value.byteLength,sha256:value.sha256,activatedAt:value.activatedAt,redeemedAt:value.redeemedAt,licenseExpiresAt:value.licenseExpiresAt,activationDeadline:value.activationDeadline,requiresRedemption:value.requiresRedemption,canRedeem:value.canRedeem,downloadReady:value.downloadReady,accessStatus:value.accessStatus};
  }
  private async resourceRequest(route:string,token:string,body?:unknown):Promise<any>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try{
      const response=await fetch(this.baseUrl+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal,redirect:'error',cache:'no-store'});
      if(!response.ok)throw new GroupDealApiError(response.status);
      if(!response.body)throw Error('Resource access response was not verified');reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>1024*1024)throw Error('Resource access response was not verified');chunks.push(result.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      if(controller.signal.aborted)throw Error('Resource access response was not verified');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('Resource access response was not verified');}
    }finally{clearTimeout(timer);if(reader)try{await reader.cancel();}catch{}}
  }
  public async getResourceGrants(token:string,orderId:string):Promise<{orderId:string;buyerAccountId:string;grants:BuyerResourceGrant[];serverTime:number}>{
    this.followToken(token);const data=await this.resourceRequest('/api/delivery/orders/'+this.id(orderId)+'/grants',token);
    if(data?.orderId!==orderId||typeof data.buyerAccountId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(data.buyerAccountId)||!Number.isSafeInteger(data.serverTime)||data.serverTime<0||!Array.isArray(data.grants)||data.grants.length>1000)throw Error('Resource access response was not verified');
    const grants=data.grants.map((g:any)=>this.resourceGrant(g));if(new Set(grants.map((g:BuyerResourceGrant)=>g.id)).size!==grants.length||new Set(grants.map((g:BuyerResourceGrant)=>g.unitIndex)).size!==grants.length)throw Error('Resource access response was not verified');
    return {orderId,buyerAccountId:data.buyerAccountId,grants,serverTime:data.serverTime};
  }
  public async redeemResourceGrant(token:string,grantId:string,key:string):Promise<{success:true}>{
    this.followToken(token);if(typeof key!=='string'||!/^[-A-Za-z0-9_]{12,128}$/.test(key))throw Error('Invalid resource access key');const result=await this.resourceRequest('/api/delivery/grants/'+this.id(grantId)+'/redeem',token,{key});if(result?.success!==true)throw Error('Resource activation was not verified');return {success:true};
  }
  public async downloadResourceGrant(token:string,expected:BuyerResourceGrant):Promise<Uint8Array>{
    this.followToken(token);const grant=this.resourceGrant(expected);if(!grant.downloadReady)throw Error('Resource download is unavailable');
    const base='/api/delivery/grants/'+this.id(grant.id)+'/download',link=await this.resourceRequest(base+'-link',token);
    if(link?.grantId!==grant.id||link.fileName!==grant.fileName||link.mimeType!==grant.mimeType||link.byteLength!==grant.byteLength||link.sha256!==grant.sha256||typeof link.url!=='string'||!link.url.startsWith(base+'?')||!Number.isSafeInteger(link.expiresAt))throw Error('Resource download link was not verified');
    const url=new URL(link.url,this.baseUrl),query=url.searchParams;if(url.origin!==this.baseUrl||url.pathname!==base||url.hash||[...query.keys()].length!==3||['expiresAt','keyId','signature'].some(k=>query.getAll(k).length!==1)||query.get('expiresAt')!==String(link.expiresAt)||!/^[-A-Za-z0-9_]{1,64}$/.test(query.get('keyId')??'')||!/^[a-f0-9]{64}$/.test(query.get('signature')??''))throw Error('Resource download link was not verified');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try{
      const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:controller.signal,redirect:'error'});if(!response.ok)throw new GroupDealApiError(response.status);
      if(!response.body||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!==grant.mimeType)throw Error('Resource download was not verified');reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
      while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>grant.byteLength)throw Error('Resource download was not verified');chunks.push(result.value);}
      if(size!==grant.byteLength)throw Error('Resource download was not verified');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      if(controller.signal.aborted||crypto.createHash('sha256').update(bytes).digest('hex')!==grant.sha256)throw Error('Resource download was not verified');return bytes;
    }finally{clearTimeout(timer);if(reader)try{await reader.cancel();}catch{}}
  }
  /** Signature/time validation alone cannot stop a replay inside the window. Persist into an inbox before acknowledging HTTP. */
  public async receiveWebhook(rawBody:string,headers:WebhookHeaders,inbox:WebhookInbox):Promise<{accepted:boolean;duplicate:boolean;event?:WebhookEnvelope}> {
    if(!this.config.webhookSubscriptionId)throw new Error("Configure a stable webhook subscription ID for the inbox namespace");
    if(Buffer.byteLength(rawBody,"utf8")>1048576||!this.verifyWebhookSignature(rawBody,headers.signature,headers.timestamp))return {accepted:false,duplicate:false};
    let event:WebhookEnvelope;
    try {event=JSON.parse(rawBody);}catch{return {accepted:false,duplicate:false};}
    if(!event||event.event==='subscription.review'||!/^evt_[A-Za-z0-9_-]{1,80}$/.test(event.id)||event.id!==headers.eventId||event.event!==headers.event||!/^([a-z]+\.)+[a-z_]+$/.test(event.event)
      ||event.timestamp!==Number(headers.timestamp)||!Number.isSafeInteger(event.createdAt)||event.createdAt<0||!event.data||typeof event.data!=="object"||Array.isArray(event.data)
      ||Object.entries(event.data).some(([key,value])=>["__proto__","constructor","prototype"].includes(key)||!["string","number","boolean"].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)))return {accepted:false,duplicate:false};
    const inserted=await inbox.persist(this.config.webhookSubscriptionId,event);
    return {accepted:true,duplicate:!inserted,...(inserted?{event}:{})};
  }
  public getCampaign(campaignId:string):Promise<PublicApiMetadata & {campaign:PublicCampaign}> {return this.request(`/api/v1/campaigns/${this.id(campaignId)}`);}
  public getWidgetData(campaignId:string):Promise<PublicWidgetData> {return this.request(`/api/v1/campaigns/${this.id(campaignId)}/widget-data`);}
  public getSeller(sellerId:string):Promise<PublicApiMetadata & {seller:PublicSeller}> {return this.request(`/api/v1/sellers/${this.id(sellerId)}`);}
  private campaignQuery(options:CampaignListOptions):string {
    const query=new URLSearchParams();
    if(options.limit!==undefined){if(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>100)throw new Error("Invalid campaign page limit");query.set("limit",String(options.limit));}
    if(options.cursor!==undefined){if(!/^[A-Za-z0-9_-]{1,512}$/.test(options.cursor))throw new Error("Invalid campaign cursor");query.set("cursor",options.cursor);}
    const allowed={status:["PUBLISHED","ACTIVE","FINALIZED","CANCELLED"],metric:["BUYER_COUNT","UNITS_COUNT"],sort:["newest","oldest"]};
    for(const key of ["status","metric","sort"] as const)if(options[key]!==undefined){if(!allowed[key].includes(options[key]!))throw new Error("Invalid campaign filter");query.set(key,options[key]!);}
    for(const [key,max] of [['q',120],['category',80]] as const)if(options[key]!==undefined){const value=options[key];if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Invalid catalog filter');query.set(key,value);}
    return query.size?"?"+query.toString():"";
  }
  public listCampaigns(options:CampaignListOptions={}):Promise<PublicApiMetadata & {campaigns:PublicCampaign[];pagination:Pagination}> {return this.request("/api/v1/campaigns"+this.campaignQuery(options));}
  public getCatalog(options:CampaignListOptions={}):Promise<PublicCatalog>{return this.request('/api/v1/catalog'+this.campaignQuery(options));}
  public listSellerCampaigns(sellerId:string,options:CampaignListOptions={}):Promise<PublicApiMetadata & {campaigns:PublicSellerCampaign[];pagination:Pagination}> {return this.request(`/api/v1/sellers/${this.id(sellerId)}/campaigns`+this.campaignQuery(options));}
  /** Account preferences; in-app only. Retain the input and UUID until the exact command is acknowledged. */
  public getSellerFollow(token:string,sellerId:string):Promise<{follow:SellerFollow}>{this.followToken(token);return this.request(`/api/follows/sellers/${this.followId(sellerId)}`,token);}
  public getSellerFollowCommand(token:string,sellerId:string,commandId:string):Promise<SellerFollowResult>{this.followToken(token);this.followUuid(commandId);return this.request(`/api/follows/sellers/${this.followId(sellerId)}/commands/${commandId}`,token);}
  public updateSellerFollow(token:string,sellerId:string,input:SellerFollowInput):Promise<SellerFollowResult>{this.followToken(token);this.followUuid(input.idempotencyKey);if(Object.keys(input).sort().join(',')!=="expectedRevision,following,idempotencyKey,notifyDealUpdates,notifyNewDeals"||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=1000000000||[input.following,input.notifyNewDeals,input.notifyDealUpdates].some(v=>typeof v!=="boolean")||!input.following&&(input.notifyNewDeals||input.notifyDealUpdates))throw new Error("Invalid follow preferences");return this.request(`/api/follows/sellers/${this.followId(sellerId)}`,token,input);}
  public listSellerFollows(token:string,options:{limit?:number;cursor?:string}={}):Promise<{follows:SellerFollow[];pagination:{limit:number;nextCursor:string|null}}>{this.followToken(token);const q=new URLSearchParams();if(options.limit!==undefined){if(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>100)throw Error("Invalid follow page limit");q.set('limit',String(options.limit));}if(options.cursor!==undefined){if(!/^[A-Za-z0-9_-]{1,960}\.[a-f0-9]{64}$/.test(options.cursor)||options.cursor.length>1024)throw Error("Invalid follow cursor");q.set('cursor',options.cursor);}return this.request('/api/follows/sellers'+(q.size?'?'+q:'') ,token);}

  /** Private support only. Retain the exact input/UUID until its owned command receipt is confirmed. */
  public getSupportTicket(token:string,ticketId:string):Promise<{ticket:SupportTicket}>{this.followToken(token);return this.request('/api/support/tickets/'+this.supportTicketId(ticketId),token);}
  public getSupportCommand(token:string,commandId:string):Promise<SupportCommandResult>{this.followToken(token);this.followUuid(commandId);return this.request('/api/support/commands/'+commandId,token);}
  public listSupportTickets(token:string,options:{limit?:number;cursor?:string;view?:'MINE'|'ALL'|'ASSIGNED';state?:SupportTicketState;orderId?:string}={}):Promise<{userId:string;tickets:SupportTicketSummary[];pagination:{limit:number;nextCursor:string|null}}>{this.followToken(token);const q=new URLSearchParams();if(Object.keys(options).some(k=>!['limit','cursor','view','state','orderId'].includes(k)))throw Error('Invalid support query');if(options.limit!==undefined){if(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>50)throw Error('Invalid support page size');q.set('limit',String(options.limit));}if(options.cursor!==undefined){if(typeof options.cursor!=='string'||!options.cursor||options.cursor.length>1024)throw Error('Invalid support cursor');q.set('cursor',options.cursor);}if(options.view!==undefined){if(!['MINE','ALL','ASSIGNED'].includes(options.view))throw Error('Invalid support view');q.set('view',options.view);}if(options.state!==undefined){this.supportState(options.state);q.set('state',options.state);}if(options.orderId!==undefined)q.set('orderId',this.supportId(options.orderId));return this.request('/api/support/tickets'+(q.size?'?'+q:''),token);}
  public createSupportTicket(token:string,input:SupportCreateInput):Promise<SupportCommandResult>{this.followToken(token);this.supportKeys(input,['idempotencyKey','kind','orderId','subject','message'],['attachments']);this.followUuid(input.idempotencyKey);if(!['ACCOUNT','ORDER'].includes(input.kind)||(input.kind==='ORDER')!==(input.orderId!==null))throw Error('Invalid support kind/order');if(input.orderId!==null)this.supportId(input.orderId);this.supportText(input.subject,160);this.supportText(input.message,4000);this.supportFiles(input.attachments);return this.request('/api/support/tickets',token,input);}
  public replySupportTicket(token:string,ticketId:string,input:SupportRevisionInput&{message:string;attachments?:SupportUpload[]}):Promise<SupportCommandResult>{this.followToken(token);this.supportKeys(input,['idempotencyKey','expectedRevision','message'],['attachments']);this.supportRevision(input);this.supportText(input.message,4000);this.supportFiles(input.attachments);return this.request('/api/support/tickets/'+this.supportTicketId(ticketId)+'/messages',token,input);}
  public setSupportTicketState(token:string,ticketId:string,input:SupportRevisionInput&{state:SupportTicketState}):Promise<SupportCommandResult>{this.followToken(token);this.supportKeys(input,['idempotencyKey','expectedRevision','state']);this.supportRevision(input);this.supportState(input.state);return this.request('/api/support/tickets/'+this.supportTicketId(ticketId)+'/status',token,input);}
  public assignSupportTicket(token:string,ticketId:string,input:SupportRevisionInput&{assignedOperatorId:string|null}):Promise<SupportCommandResult>{this.followToken(token);this.supportKeys(input,['idempotencyKey','expectedRevision','assignedOperatorId']);this.supportRevision(input);if(input.assignedOperatorId!==null)this.supportId(input.assignedOperatorId);return this.request('/api/support/tickets/'+this.supportTicketId(ticketId)+'/assignment',token,input);}
  public removeSupportAttachment(token:string,ticketId:string,input:SupportRevisionInput&{attachmentId:string}):Promise<SupportCommandResult>{this.followToken(token);this.supportKeys(input,['idempotencyKey','expectedRevision','attachmentId']);this.supportRevision(input);if(!/^tatt_[a-f0-9-]{36}$/.test(input.attachmentId))throw Error('Invalid support attachment');return this.request('/api/support/tickets/'+this.supportTicketId(ticketId)+'/attachments/remove',token,input);}
  public listSupportOperators(token:string):Promise<{userId:string;operators:{id:string;displayName:string}[]}>{this.followToken(token);return this.request('/api/support/operators',token);}
  public async downloadSupportAttachment(token:string,ticketId:string,attachmentId:string,expected:{byteLength:number;sha256:string}):Promise<Uint8Array>{
    this.followToken(token);this.supportTicketId(ticketId);
    if(!/^tatt_[a-f0-9-]{36}$/.test(attachmentId)||!Number.isSafeInteger(expected.byteLength)||expected.byteLength<1||expected.byteLength>1048576||!/^[a-f0-9]{64}$/.test(expected.sha256))throw Error('Invalid support download metadata');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try{
      const r=await fetch(this.baseUrl+'/api/support/tickets/'+ticketId+'/attachments/'+attachmentId,{headers:{Authorization:'Bearer '+token},signal:controller.signal,redirect:'error'});
      if(!r.ok)throw new GroupDealApiError(r.status);
      if(!r.body||r.headers.get('content-type')!=='application/octet-stream'||Number(r.headers.get('content-length'))!==expected.byteLength)throw Error('Support download was not verified');
      reader=r.body.getReader();const bytes=new Uint8Array(expected.byteLength);let size=0;
      while(true){const chunk=await reader.read();if(chunk.done)break;if(chunk.value.byteLength>expected.byteLength-size)throw Error('Support download was not verified');bytes.set(chunk.value,size);size+=chunk.value.byteLength;}
      if(controller.signal.aborted||size!==expected.byteLength||crypto.createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Support download was not verified');
      return bytes;
    }finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
  }
  private supportId(v:string){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(v))throw Error('Invalid support identifier');return v;}
  private supportTicketId(v:string){if(typeof v!=='string'||!/^tkt_[a-f0-9-]{36}$/.test(v))throw Error('Invalid support ticket');return v;}
  private supportRevision(v:SupportRevisionInput){this.followUuid(v.idempotencyKey);if(!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<1||v.expectedRevision>=1e9)throw Error('Invalid support revision');}
  private supportText(v:string,max:number){if(typeof v!=='string'||!v.trim()||v.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw Error('Invalid support text');}
  private supportState(v:SupportTicketState){if(!['OPEN','WAITING_BUYER','WAITING_SELLER','RESOLVED','CLOSED'].includes(v))throw Error('Invalid support state');}
  private supportKeys(v:unknown,required:string[],optional:string[]=[]){if(!v||typeof v!=='object'||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))throw Error('Invalid support fields');}
  private supportFiles(v?:SupportUpload[]){if(v===undefined)return;if(!Array.isArray(v)||v.length>3)throw Error('Invalid support attachments');for(const f of v){this.supportKeys(f,['filename','mimeType','dataBase64']);if(typeof f.filename!=='string'||!f.filename.trim()||f.filename.length>120||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\\/]/.test(f.filename)||!['application/pdf','image/png','image/jpeg','text/plain'].includes(f.mimeType)||typeof f.dataBase64!=='string'||f.dataBase64.length>1398104||!f.dataBase64||Buffer.from(f.dataBase64,'base64').toString('base64')!==f.dataBase64)throw Error('Invalid support attachment');}}

  private followId(value:string){if(!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw Error("Invalid seller ID");return value;}
  private followUuid(value:string){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error("Invalid follow command ID");}
  private followToken(value:string){if(typeof value!=="string"||!value||/\s/.test(value))throw Error("An account session token is required");}
  /** Stage actual managed resources. The SDK never signs or holds the buyer/seller wallet key. */
  public prepareDelivery(token:string,orderId:string,idempotencyKey:string):Promise<{operation:DeliveryOperation}> {
    if(typeof idempotencyKey!=="string"||!/^[a-zA-Z0-9:_-]{8,180}$/.test(idempotencyKey))throw new Error("An immutable delivery retry key is required");
    return this.request(`/api/delivery/orders/${this.id(orderId)}/prepare`,token,{idempotencyKey});
  }
  public readyOperation(token:string,operationId:string):Promise<{operation:DeliveryOperation}> {return this.request(`/api/transactions/${this.id(operationId)}/ready`,token,{});}
  public retryDelivery(token:string,previousOperationId:string,idempotencyKey:string):Promise<{operation:DeliveryOperation}> {if(typeof idempotencyKey!=="string"||!/^[a-zA-Z0-9:_-]{8,180}$/.test(idempotencyKey))throw new Error("An immutable delivery retry key is required");return this.request(`/api/delivery/operations/${this.id(previousOperationId)}/retry`,token,{idempotencyKey});}
  /** Read-only chain proof of expired, unconsumed BUY authorization; never signs or creates a financial outcome. */
  public expireBuyOperation(token:string,operationId:string):Promise<{operation:BuyOperation}> {return this.request(`/api/transactions/${this.id(operationId)}/expire`,token,{});}
  public submitOperation(token:string,operationId:string,txHash:string):Promise<{operation:DeliveryOperation}> {this.tx(txHash);return this.request(`/api/transactions/${this.id(operationId)}/submit`,token,{txHash});}
  public observeOperation(token:string,operationId:string,txHash:string,rawTransaction?:string):Promise<{operation:DeliveryOperation}> {this.tx(txHash);this.signedEnvelope(rawTransaction);return this.request(`/api/transactions/${this.id(operationId)}/observe`,token,{txHash,...(rawTransaction===undefined?{}:{rawTransaction})});}
  public replaceOperation(token:string,operationId:string,previousTxHash:string,txHash:string,rawOriginalTransaction?:string):Promise<{operation:DeliveryOperation}> {this.tx(previousTxHash);this.tx(txHash);if(previousTxHash.toLowerCase()===txHash.toLowerCase())throw new Error("Distinct replacement transaction hashes are required");this.signedEnvelope(rawOriginalTransaction);return this.request(`/api/transactions/${this.id(operationId)}/replace`,token,{previousTxHash,txHash,...(rawOriginalTransaction===undefined?{}:{rawOriginalTransaction})});}
  private signedEnvelope(raw?:string){if(raw!==undefined&&(typeof raw!=="string"||!/^0x(?:[0-9a-fA-F]{2})+$/.test(raw)||raw.length>131074))throw new Error("Invalid signed transaction envelope");}
  public recoverOperation(token:string,operationId:string,txHash:string):Promise<{operation:DeliveryOperation}> {this.tx(txHash);return this.request(`/api/transactions/${this.id(operationId)}/recover`,token,{txHash});}
  public finishDelivery(token:string,operationId:string,txHash:string):Promise<{success:boolean;operation:DeliveryOperation}> {this.tx(txHash);return this.request(`/api/delivery/operations/${this.id(operationId)}/finish`,token,{txHash});}
  /** External-provider/manual fulfillment requires an already confirmed recordDelivery for this exact content proof. Managed resources use prepareDelivery/finishDelivery. */
  public fulfillOrder(token:string,orderId:string,secretContent:string,txHash:string):Promise<{success:boolean;order:Record<string,unknown>}> {
    this.tx(txHash);if(!secretContent)throw new Error("Delivered content is required");
    return this.request(`/api/seller/orders/${this.id(orderId)}/deliver`,token,{secretContent,txHash});
  }
  private tx(hash:string):void {if(!/^0x[a-fA-F0-9]{64}$/.test(hash||""))throw new Error("A valid broadcast transaction hash is required");}
}
