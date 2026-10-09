import {ethers} from 'ethers';
import manifest from '../../../shared/manifests/arc-testnet.json';
export const operatorDeployment={chainId:manifest.chainId,hubAddress:ethers.getAddress(manifest.contracts.GroupDealHub.address),operatorAddress:ethers.getAddress(manifest.roles.operator.address)};
export type OperatorAccessFailure='SESSION'|'WALLET'|'AUTHORITY'|'LIMIT'|'INVALID'|'NETWORK'|'STORAGE';
export class OperatorAccessError extends Error{constructor(public readonly kind:OperatorAccessFailure){super(kind);}}
const invalid=():never=>{throw new OperatorAccessError('INVALID');};
const addr=(v:unknown)=>typeof v==='string'&&ethers.isAddress(v)?ethers.getAddress(v):invalid();
const hash=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-fA-F]{64}$/.test(v)?v:invalid();
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:invalid();
export interface OperatorAuthority{chainId:number;hubAddress:string;protocolVersion:number;operatorAddress:string;authorizedSigner:string;ownerAddress:string;securityAuthority:string;bytecodeHash:string;blockNumber:number;blockHash:string;observedAt:number}
export const enrollmentDigest=(value:unknown)=>ethers.sha256(ethers.toUtf8Bytes(JSON.stringify(value))).slice(2);
export function readOperatorAuthority(value:any,now=Date.now()):OperatorAuthority{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const a={chainId:integer(value.chainId),hubAddress:addr(value.hubAddress),protocolVersion:integer(value.protocolVersion),operatorAddress:addr(value.operatorAddress),authorizedSigner:addr(value.authorizedSigner),ownerAddress:addr(value.ownerAddress),securityAuthority:addr(value.securityAuthority),bytecodeHash:hash(value.bytecodeHash),blockNumber:integer(value.blockNumber),blockHash:hash(value.blockHash),observedAt:integer(value.observedAt)};
 if(a.chainId!==operatorDeployment.chainId||a.hubAddress!==operatorDeployment.hubAddress||a.protocolVersion!==((manifest as any).protocolVersion??1)||a.operatorAddress!==operatorDeployment.operatorAddress||a.authorizedSigner!==addr(manifest.roles.authorizedSigner.address)||a.ownerAddress!==addr(manifest.roles.owner.address)||a.securityAuthority!==addr(manifest.roles.securityAuthority.address)||a.bytecodeHash.toLowerCase()!==manifest.contracts.GroupDealHub.bytecodeHash.toLowerCase()||a.blockNumber<manifest.contracts.GroupDealHub.deploymentBlock||a.observedAt>now+30000||now-a.observedAt>30000||new Set([a.operatorAddress,a.authorizedSigner,a.ownerAddress,a.securityAuthority]).size!==4)return invalid();
 return a;
}
export interface EnrollmentStatus{accountId:string;status:'READY'|'WALLET_MISMATCH'|'ENROLLED';expectedWallet:string;activeWallet:string|null;chainId:number;hubAddress:string;authority:OperatorAuthority;eligible:boolean;operatorRolePresent:boolean;enrolled:boolean;enrollmentNonceDigest:string|null;controllerSignatureRequired:boolean}
export function readEnrollmentStatus(value:any,scope:{accountId:string;wallet:string|null},now=Date.now()):EnrollmentStatus{
 if(!value||value.accountId!==scope.accountId||!['READY','WALLET_MISMATCH','ENROLLED'].includes(value.status)||typeof value.eligible!=='boolean'||typeof value.operatorRolePresent!=='boolean'||typeof value.enrolled!=='boolean'||typeof value.controllerSignatureRequired!=='boolean')return invalid();
 const authority=readOperatorAuthority(value.authority,now),expectedWallet=addr(value.expectedWallet),activeWallet=value.activeWallet===null?null:addr(value.activeWallet),eligible=value.eligible;
 if(expectedWallet!==authority.operatorAddress||value.chainId!==authority.chainId||addr(value.hubAddress)!==authority.hubAddress||activeWallet!==(scope.wallet===null?null:addr(scope.wallet))||eligible&&activeWallet!==expectedWallet||value.enrolled!==(value.status==='ENROLLED')||value.controllerSignatureRequired===value.enrolled||value.status==='READY'&&!eligible||value.status==='WALLET_MISMATCH'&&eligible||value.enrolled&&(!value.operatorRolePresent||!eligible||typeof value.enrollmentNonceDigest!=='string'||!/^[a-f0-9]{64}$/.test(value.enrollmentNonceDigest))||!value.enrolled&&value.enrollmentNonceDigest!==null)return invalid();
 return{accountId:value.accountId,status:value.status,expectedWallet,activeWallet,chainId:authority.chainId,hubAddress:authority.hubAddress,authority,eligible,operatorRolePresent:value.operatorRolePresent,enrolled:value.enrolled,enrollmentNonceDigest:value.enrollmentNonceDigest,controllerSignatureRequired:value.controllerSignatureRequired};
}
export interface EnrollmentChallenge{challengeMessage:string;nonce:string;expiresAt:number;authority:OperatorAuthority}
export function readEnrollmentChallenge(value:any,scope:{accountId:string;wallet:string;origin:string},now=Date.now()):EnrollmentChallenge{
 if(!value||typeof value.challengeMessage!=='string'||value.challengeMessage.length>4096||typeof value.nonce!=='string'||!/^[a-f0-9]{32}$/.test(value.nonce))return invalid();
 const authority=readOperatorAuthority(value.authority,now),wallet=addr(scope.wallet),expiresAt=integer(value.expiresAt),lines=value.challengeMessage.split('\n'),timestamp=Number(/^Timestamp: (\d+)$/.exec(lines[12]??'')?.[1]);
 if(wallet!==authority.operatorAddress||!Number.isSafeInteger(timestamp)||expiresAt!==timestamp+300||expiresAt<=Math.floor(now/1000)||timestamp>Math.floor(now/1000)+30||![15,16].includes(lines.length))return invalid();
 const context=lines.length===16?(/^Recovery context: ([A-Za-z0-9_-]{1,1024})$/.exec(lines[14])?.[1]??invalid()):undefined;
 const expected=['=== GroupDeal Operator Enrollment ===','Action: OPERATOR_ENROLLMENT','Role: operator','Account: '+scope.accountId,'Wallet: '+wallet,'Chain ID: '+authority.chainId,'Hub: '+authority.hubAddress,'Origin: '+scope.origin,'Authority block: '+authority.blockNumber,'Authority hash: '+authority.blockHash,'Authority digest: '+enrollmentDigest(authority),'Nonce: '+value.nonce,'Timestamp: '+timestamp,'Expires: '+expiresAt,...(context?['Recovery context: '+context]:[]),'This signature requests GroupDeal operator access for this account. It does not submit a transaction or spend funds.'].join('\n');
 if(expected!==value.challengeMessage)return invalid();
 return{challengeMessage:expected,nonce:value.nonce,expiresAt,authority};
}
export interface EnrollmentCheckpoint{version:1;nonceDigest:string;expiresAt:number}
export function readEnrollmentCheckpoint(value:unknown):EnrollmentCheckpoint{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const v=value as any;
 if(Object.keys(v).sort().join(',')!=='expiresAt,nonceDigest,version'||v.version!==1||typeof v.nonceDigest!=='string'||!/^[a-f0-9]{64}$/.test(v.nonceDigest)||!Number.isSafeInteger(v.expiresAt)||v.expiresAt<=0)return invalid();
 return{version:1,nonceDigest:v.nonceDigest,expiresAt:v.expiresAt};
}
export const enrollmentCheckpointKey=(accountId:string,wallet:string|null)=>'groupdeal_operator_enrollment:'+encodeURIComponent(accountId)+':'+(wallet?.toLowerCase()??'none')+':'+operatorDeployment.hubAddress.toLowerCase();
export function enrollmentReadback(status:EnrollmentStatus,pending:EnrollmentCheckpoint){
 if(status.enrolled&&status.enrollmentNonceDigest===pending.nonceDigest)return'CONFIRMED' as const;
 if(Math.floor(status.authority.observedAt/1000)>=pending.expiresAt)return'EXPIRED_CHECKED' as const;
 return'UNCONFIRMED' as const;
}
export async function enrollmentRequest(token:string,path:string,body?:unknown){
 let response:Response;try{response=await fetch('/api/auth/operator/enrollment'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}catch{throw new OperatorAccessError('NETWORK');}
 const data=await response.json().catch(()=>invalid());
 if(!response.ok){const kind=response.status===401?'SESSION':response.status===429?'LIMIT':response.status===403&&typeof data.error==='string'&&data.error.includes('WALLET')?'WALLET':response.status===403?'AUTHORITY':response.status===400?'INVALID':'NETWORK';throw new OperatorAccessError(kind);}
 return data;
}
