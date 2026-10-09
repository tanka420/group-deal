import {ethers} from 'ethers';
import {BridgeTransferError,readBridgeTransferRecord,type BridgeTransferRecord} from './bridgeTransfer';
import {isCurrentServerBridgeInspection,type ServerBridgeInspection} from './bridgeReceipt';
export type BridgeClosureMode='complete'|'stop-before-burn';
const seals=new WeakMap<object,{priorHash:string;nextHash:string;checkedAt:number}>();
const digest=(r:BridgeTransferRecord)=>ethers.id(JSON.stringify(readBridgeTransferRecord(r)));
const freeze=<T>(v:T):T=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v;};
const denied=(code='BRIDGE_TRANSFER_WRITE_UNRESOLVED'):never=>{throw new BridgeTransferError(code)};
/** The opaque in-process capability is checked again against the committed row, inside BEGIN IMMEDIATE. */
export function prepareBridgeClosure(input:BridgeTransferRecord,mode:BridgeClosureMode,inspection?:ServerBridgeInspection):BridgeTransferRecord {
 const r=readBridgeTransferRecord(input);if(r.phase!=='RESERVED'||!['complete','stop-before-burn'].includes(mode))return denied();
 let outcome:'MINTED'|'NO_BURN'|'CANCELLED',basis:'FINALIZED_MINT'|'FINALIZED_REVERTED_BURN'|'NO_WRITE_ISSUED'|'BURN_NOT_ISSUED';
 if(mode==='stop-before-burn'&&r.writes.length===0){outcome='CANCELLED';basis='NO_WRITE_ISSUED';}
 else{if(!inspection||!isCurrentServerBridgeInspection(inspection,r))return denied('BRIDGE_TRANSFER_PROOF_REQUIRED');
  if(mode==='complete'&&inspection.state==='MINTED'){outcome='MINTED';basis='FINALIZED_MINT';}
  else if(mode==='complete'&&inspection.state==='NO_BURN'){outcome='NO_BURN';basis='FINALIZED_REVERTED_BURN';}
  else if(mode==='stop-before-burn'&&inspection.state==='APPROVED'&&r.writes.every(w=>w.kind==='approve')){outcome='CANCELLED';basis='BURN_NOT_ISSUED';}
  else return denied();}
 const checkedAt=inspection?.inspectedAt??Date.now(),receipts=(inspection?.proofs??[]).map(({writeId,proof})=>({writeId,chainId:r.writes.find(w=>w.id===writeId)!.chainId,hash:proof.hash,blockNumber:proof.blockNumber,blockHash:proof.blockHash,finalizedBlock:structuredClone(proof.finalizedBlock),reverted:proof.reverted}));
 const next=freeze(readBridgeTransferRecord({...r,phase:'CLOSED',revision:r.revision+1,completion:{outcome,basis,checkedAt,receipts}}));seals.set(next,{priorHash:digest(r),nextHash:digest(next),checkedAt});return next;
}
export function isPreparedBridgeClosure(value:unknown,prior:BridgeTransferRecord):boolean {
 if(!value||typeof value!=='object')return false;const s=seals.get(value);if(!s||Date.now()<s.checkedAt||Date.now()-s.checkedAt>30000)return false;return s.priorHash===digest(prior)&&s.nextHash===digest(value as BridgeTransferRecord);
}
/** Stored completion is historical metadata. Reusing a released identity requires a fresh, independently verified observation. */
export function isFreshClosedBridgeHistory(inspection:ServerBridgeInspection,record:BridgeTransferRecord):boolean {
 const r=readBridgeTransferRecord(record),t=r.completion;if(r.phase!=='CLOSED'||!t||!isCurrentServerBridgeInspection(inspection,r))return false;
 const state=t.outcome==='MINTED'?'MINTED':t.outcome==='NO_BURN'?'NO_BURN':t.basis==='NO_WRITE_ISSUED'?'UNKNOWN':'APPROVED';if(inspection.state!==state||inspection.proofs.length!==t.receipts.length)return false;
 return t.receipts.every(p=>{const fresh=inspection.proofs.find(q=>q.writeId===p.writeId)?.proof;return !!fresh&&fresh.hash===p.hash&&fresh.blockHash===p.blockHash&&BigInt(fresh.blockNumber)===BigInt(p.blockNumber)&&fresh.reverted===p.reverted});
}
