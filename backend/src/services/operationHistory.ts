import {createHash} from "node:crypto";
import {z} from "zod";
import {ethers} from "ethers";
import {OperationTrackingService} from "./operationTrackingService";
import type {SessionProof} from "./sessionService";
import {config} from "../config";

const querySchema=z.object({limit:z.string().regex(/^\d{1,3}$/).transform(Number).refine(n=>n>=1&&n<=100).default("20"),cursor:z.string().max(2048).optional(),action:z.enum(["PUBLISH","DELIVER","BUY","BUYER_CLAIM","SELLER_CLAIM","DISPUTE","RESOLVE","CONFIRM","BREACH","SETTLE"]).optional(),phase:z.enum(["PREPARED","AWAITING_SIGNATURE","SUBMITTED","RECEIPT_VERIFIED","PROJECTED","UNKNOWN","REVERTED","SUPERSEDED","EXPIRED"]).optional(),resourceId:z.string().min(1).max(180).optional(),principal:z.string().refine(ethers.isAddress).transform(s=>s.toLowerCase()).optional()}).strict();
export function operationHistory(userId:string,query:unknown,proof?:SessionProof){
  const {cursor,limit,...filters}=querySchema.parse(query);
  if(proof?.record.realm==='ADMIN'){if(filters.action&&filters.action!=='RESOLVE')throw new Error('ADMIN_OPERATION_SCOPE_REQUIRED');filters.action='RESOLVE';}
  const scope=createHash("sha256").update(JSON.stringify({userId,chainId:config.arcChainId,hubAddress:config.hubAddress.toLowerCase(),filters})).digest("hex");
  let boundary:{createdAt:number;id:string}|undefined;
  if(cursor){
    if(!/^[A-Za-z0-9_-]+$/.test(cursor))throw new Error("Invalid history cursor");
    let decoded:any;try{decoded=JSON.parse(Buffer.from(cursor,"base64url").toString("utf8"));}catch{throw new Error("Invalid history cursor");}
    if(!decoded||decoded.version!==1||decoded.scope!==scope||!Number.isSafeInteger(decoded.createdAt)||decoded.createdAt<0||typeof decoded.id!=="string"||!decoded.id||decoded.id.length>180||Object.keys(decoded).length!==4)throw new Error("Invalid history cursor scope/boundary");
    boundary=decoded;
  }
  const matching=OperationTrackingService.history({actorId:userId,limit,filters,boundary},proof);
  const page=matching.slice(0,limit),last=page.at(-1);
  return {operations:page,pagination:{limit,nextCursor:matching.length>limit&&last?Buffer.from(JSON.stringify({version:1,scope,createdAt:last.createdAt,id:last.id})).toString("base64url"):null}};
}
