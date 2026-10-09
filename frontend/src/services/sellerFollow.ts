export type FollowSettings={following:boolean;notifyNewDeals:boolean;notifyDealUpdates:boolean};
export type SellerFollow=FollowSettings&{version:1;userId:string;sellerId:string;revision:number;changedAt:number|null;available:boolean;inAppEnabled:boolean;displayName?:string};
export type FollowCheckpoint=FollowSettings&{version:1;origin:string;userId:string;sellerId:string;idempotencyKey:string;expectedRevision:number};
const id=/^[A-Za-z0-9_-]{1,128}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const revision=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=1000000000;
const settings=(v:any):boolean=>v&&['following','notifyNewDeals','notifyDealUpdates'].every(k=>typeof v[k]==='boolean')&&(v.following||!v.notifyNewDeals&&!v.notifyDealUpdates);
export class FollowRequestError extends Error{constructor(public status:number){super('FOLLOW_REQUEST_FAILED');}}
export function readSellerFollow(v:any,userId:string,sellerId?:string):SellerFollow{
 if(!v||v.version!==1||v.userId!==userId||!id.test(v.sellerId)||sellerId&&v.sellerId!==sellerId||!settings(v)||!revision(v.revision)||typeof v.available!=='boolean'||typeof v.inAppEnabled!=='boolean'||v.revision===0&&(v.changedAt!==null||v.following||v.notifyNewDeals||v.notifyDealUpdates)||v.revision>0&&(!Number.isSafeInteger(v.changedAt)||v.changedAt<0||v.changedAt>8640000000000000)||v.displayName!==undefined&&(!v.available||typeof v.displayName!=='string'||!v.displayName.trim()||v.displayName.length>80))throw new Error('FOLLOW_INVALID_RESPONSE');
 return {version:1,userId,sellerId:v.sellerId,revision:v.revision,following:v.following,notifyNewDeals:v.notifyNewDeals,notifyDealUpdates:v.notifyDealUpdates,changedAt:v.changedAt,available:v.available,inAppEnabled:v.inAppEnabled,...(v.displayName?{displayName:v.displayName}:{})};
}
function key(userId:string,sellerId:string){if(!id.test(userId)||!id.test(sellerId))throw Error('FOLLOW_INVALID_SCOPE');return 'groupdeal_follow_'+userId+':'+sellerId;}
export function followCheckpoint(userId:string,sellerId:string):FollowCheckpoint|null{
 const raw=sessionStorage.getItem(key(userId,sellerId));if(!raw)return null;const v=JSON.parse(raw);
 if(!v||v.version!==1||v.origin!==location.origin||v.userId!==userId||v.sellerId!==sellerId||!uuid.test(v.idempotencyKey)||!revision(v.expectedRevision)||v.expectedRevision>=1000000000||!settings(v)||Object.keys(v).sort().join(',')!=='expectedRevision,following,idempotencyKey,notifyDealUpdates,notifyNewDeals,origin,sellerId,userId,version')throw Error('FOLLOW_CHECKPOINT_INVALID');
 return v;
}
export function saveFollowCheckpoint(v:FollowCheckpoint){const old=followCheckpoint(v.userId,v.sellerId);if(old&&old.idempotencyKey!==v.idempotencyKey)throw Error('FOLLOW_CHECKPOINT_PENDING');sessionStorage.setItem(key(v.userId,v.sellerId),JSON.stringify(v));if(followCheckpoint(v.userId,v.sellerId)?.idempotencyKey!==v.idempotencyKey)throw Error('FOLLOW_STORAGE_FAILED');}
export function clearFollowCheckpoint(userId:string,sellerId:string,commandId?:string){if(commandId&&followCheckpoint(userId,sellerId)?.idempotencyKey!==commandId)throw Error('FOLLOW_CHECKPOINT_CHANGED');sessionStorage.removeItem(key(userId,sellerId));if(sessionStorage.getItem(key(userId,sellerId))!==null)throw Error('FOLLOW_STORAGE_FAILED');}
export async function followRequest(path:string,token:string,signal:AbortSignal,body?:unknown):Promise<any>{
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)controller.abort();const timer=setTimeout(abort,15000);
 try{const response=await fetch('/api/follows/sellers'+path,{method:body===undefined?'GET':'POST',body:body===undefined?undefined:JSON.stringify(body),headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});if(!response.ok)throw new FollowRequestError(response.status);return await response.json();}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
export function followCommand(v:any,expected:FollowCheckpoint):SellerFollow{
 const c=v?.command,f=readSellerFollow(v?.follow,expected.userId,expected.sellerId);
 if(!c||c.id!==expected.idempotencyKey||c.userId!==expected.userId||c.sellerId!==expected.sellerId||c.state!=='APPLIED'||c.revision!==expected.expectedRevision+1||!settings(c)||['following','notifyNewDeals','notifyDealUpdates'].some(k=>c[k]!==expected[k as keyof FollowSettings])||f.revision<c.revision||f.revision===c.revision&&['following','notifyNewDeals','notifyDealUpdates'].some(k=>f[k as keyof FollowSettings]!==c[k]))throw Error('FOLLOW_INVALID_ACK');return f;
}
export function followPage(v:any,userId:string){if(!Array.isArray(v?.follows)||v.follows.length>20||v.pagination?.limit!==20||v.pagination.nextCursor!==null&&(typeof v.pagination.nextCursor!=='string'||!v.pagination.nextCursor||v.pagination.nextCursor.length>1024))throw Error('FOLLOW_INVALID_PAGE');const rows=v.follows.map((f:any)=>readSellerFollow(f,userId));if(rows.some((f:SellerFollow)=>!f.following)||new Set(rows.map((f:SellerFollow)=>f.sellerId)).size!==rows.length)throw Error('FOLLOW_INVALID_PAGE');return {rows:rows as SellerFollow[],cursor:v.pagination.nextCursor as string|null};}
