import {ARC_CIRCLE_BLOCKCHAIN} from '../../../shared/network.mjs';
import type {User} from "../context/AuthContext";
export interface AppSession {id:string;userId:string;kind:"MANAGED"|"LEGACY";loginMethod:"CIRCLE_EMAIL"|"EVM_WALLET"|"UNKNOWN";createdAt:number;expiresAt:number;idleExpiresAt:number;state:"ACTIVE"|"EXPIRED"|"REVOKED";current:boolean;revokedAt?:number;}
export type SessionScope="ONE"|"OTHERS"|"ALL";
export interface SessionIntent {requestId:string;scope:SessionScope;targetId?:string;}
const id=/^ses_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const time=(value:unknown):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
export function readUser(value:any):User {
 if(!value||typeof value.id!=="string"||!value.id||value.id.length>128||!(typeof value.email==="string"||value.email===null)||!Array.isArray(value.roles)||value.roles.some((r:unknown)=>!["buyer","seller","operator"].includes(r as string))||!(["CIRCLE_EMAIL","EVM_WALLET"].includes(value.loginMethod)||value.loginMethod===undefined)||!(value.activeWallet===null||value.activeWallet===undefined||/^0x[a-fA-F0-9]{40}$/.test(value.activeWallet)))throw new Error("AUTH_RESPONSE_INVALID");
 const result:User={id:value.id,email:value.email,roles:[...value.roles],loginMethod:value.loginMethod??"EVM_WALLET",activeWallet:value.activeWallet??null};
 if(value.circleWallet){const w=value.circleWallet;if(typeof w.walletId!=="string"||!/^0x[a-fA-F0-9]{40}$/.test(w.address)||w.blockchain!==ARC_CIRCLE_BLOCKCHAIN)throw new Error("AUTH_RESPONSE_INVALID");result.circleWallet={address:w.address,walletId:w.walletId,blockchain:w.blockchain};}
 if(value.sellerProfile){const p=value.sellerProfile;if(![p.displayName,p.bio,p.payoutWallet].every(v=>typeof v==="string")||typeof p.verifiedSellerBadge!=="boolean"||typeof p.verifiedRightsBadge!=="boolean")throw new Error("AUTH_RESPONSE_INVALID");result.sellerProfile={displayName:p.displayName,bio:p.bio,payoutWallet:p.payoutWallet,verifiedSellerBadge:p.verifiedSellerBadge,verifiedRightsBadge:p.verifiedRightsBadge};}
 return result;
}
export function readSession(value:any,userId:string):AppSession {
 if(!value||!id.test(value.id)||value.userId!==userId||!["MANAGED","LEGACY"].includes(value.kind)||!["CIRCLE_EMAIL","EVM_WALLET","UNKNOWN"].includes(value.loginMethod)||!["ACTIVE","EXPIRED","REVOKED"].includes(value.state)||typeof value.current!=="boolean"||![value.createdAt,value.expiresAt,value.idleExpiresAt].every(time)||value.expiresAt<=value.createdAt||value.idleExpiresAt>value.expiresAt||value.idleExpiresAt<value.createdAt||value.revokedAt!==undefined&&!time(value.revokedAt))throw new Error("AUTH_RESPONSE_INVALID");
 return {id:value.id,userId,kind:value.kind,loginMethod:value.loginMethod,createdAt:value.createdAt,expiresAt:value.expiresAt,idleExpiresAt:value.idleExpiresAt,state:value.state,current:value.current,...(value.revokedAt===undefined?{}:{revokedAt:value.revokedAt})};
}
export function readSessionPage(value:any,userId:string){
 if(!value||value.userId!==userId||!id.test(value.currentSessionId)||!Array.isArray(value.sessions)||value.sessions.length>100||typeof value.legacySessionsMayBeUnlisted!=="boolean"||!time(value.serverTime)||!value.pagination||!(value.pagination.nextCursor===null||typeof value.pagination.nextCursor==="string"&&value.pagination.nextCursor.length<=1024))throw new Error("AUTH_RESPONSE_INVALID");
 const sessions=value.sessions.map((r:unknown)=>readSession(r,userId));if(new Set(sessions.map((r:AppSession)=>r.id)).size!==sessions.length||sessions.some((r:AppSession)=>r.current!==(r.id===value.currentSessionId)))throw new Error("AUTH_RESPONSE_INVALID");
 return {sessions:sessions as AppSession[],currentSessionId:value.currentSessionId as string,cursor:value.pagination.nextCursor as string|null,legacyUnlisted:value.legacySessionsMayBeUnlisted as boolean};
}
export function readSessionAck(value:any,userId:string,intent:SessionIntent){
 if(!value||value.userId!==userId||value.requestId!==intent.requestId||value.scope!==intent.scope||value.targetId!==intent.targetId||value.committed!==true||typeof value.currentSessionRevoked!=="boolean"||!Number.isSafeInteger(value.affectedCount)||value.affectedCount<0||intent.scope==="ALL"&&!value.currentSessionRevoked||intent.scope==="OTHERS"&&value.currentSessionRevoked)throw new Error("AUTH_RESPONSE_INVALID");
 return {currentRevoked:value.currentSessionRevoked as boolean,affectedCount:value.affectedCount as number};
}
