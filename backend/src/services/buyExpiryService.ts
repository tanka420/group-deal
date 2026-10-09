import {ethers} from "ethers";
import {config} from "../config";
import {store} from "../db/store";
import {deriveCampaignIdentity} from "../utils/crypto";
import {TransactionOperation} from "../domain/operation";
import {ArcReadProvider} from "./arcReadProvider";
import {OperationService} from "./operationService";
import {HUB_ABI} from "../contracts/hubAbi";

const iface=new ethers.Interface(HUB_ABI),equal=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const buyTypes={BuyAuthorization:[{name:"chainId",type:"uint256"},{name:"hubContract",type:"address"},{name:"campaignId",type:"uint256"},{name:"termsHash",type:"bytes32"},{name:"campaignIdentity",type:"bytes32"},{name:"buyerWallet",type:"address"},{name:"nonce",type:"uint256"},{name:"maxQuantity",type:"uint256"},{name:"deadline",type:"uint256"}]};
function scoped(userId:string,id:string):TransactionOperation {
  const operation=OperationService.owned(userId,id);
  if(operation.action!=="BUY"||operation.chainId!==config.arcChainId||!equal(operation.hubAddress,config.hubAddress))throw new Error("CONFLICT: BUY expiry requires the original account and deployment");
  return operation;
}
function eligible(operation:TransactionOperation){return ["PREPARED","AWAITING_SIGNATURE","SUBMITTED","UNKNOWN"].includes(operation.phase);}
function block(raw:any,number:number){
  try{if(!raw||Number(BigInt(raw.number))!==number||!ethers.isHexString(raw.hash,32)||!Number.isSafeInteger(Number(BigInt(raw.timestamp)))||BigInt(raw.timestamp)<0n)throw new Error();}
  catch{throw new Error("RPC_UNAVAILABLE: expiry canonical block is invalid");}
  return {number,hash:raw.hash as string,timestamp:Number(BigInt(raw.timestamp))};
}

/** Proves this signed authorization cannot make a future commitment and was not consumed at B. No financial projection. */
export class BuyExpiryService {
  static async expire(userId:string,id:string):Promise<TransactionOperation>{
    const original=scoped(userId,id);
    if(original.phase==="EXPIRED"&&original.authorizationExpiry)return original;
    if(!eligible(original))throw new Error("CONFLICT: recover the existing receipt/outcome before checking expiry");
    const operation=structuredClone(original),quote=operation.purchaseQuote;let call:ethers.TransactionDescription|null;
    try{call=iface.parseTransaction({data:operation.calldata});}catch{throw new Error("CONFLICT: immutable BUY calldata is invalid");}
    if(!quote||call?.name!=="commitToBuy"||operation.expectedFunction!=="commitToBuy"||operation.expectedEvent!=="CommitmentMade"
      ||iface.encodeFunctionData(call.name,Array.from(call.args)).toLowerCase()!==operation.calldata.toLowerCase()
      ||!Number.isSafeInteger(quote.authorizationNonce)||quote.authorizationNonce<0||!ethers.isHexString(quote.termsHash,32)
      ||!Number.isSafeInteger(quote.blockNumber)||quote.blockNumber<config.deploymentBlock||!ethers.isHexString(quote.blockHash,32)
      ||!equal(call.args.campaignIdentity,deriveCampaignIdentity(userId,operation.resourceId))||!ethers.isAddress(operation.principal)
      ||String(call.args.campaignId)!==String(operation.expectedEventArgs.campaignId)||!equal(call.args.campaignIdentity,operation.expectedEventArgs.campaignIdentity)
      ||!equal(operation.principal,operation.expectedEventArgs.buyerPrincipal)||String(call.args.quantity)!==String(operation.expectedEventArgs.quantity)
      ||!Number.isSafeInteger(Number(call.args.authDeadline))||call.args.authDeadline<0n)throw new Error("CONFLICT: immutable BUY authorization binding is incomplete");
    const provider=new ArcReadProvider();
    try{
      const tag=await provider.send("eth_blockNumber",[]),number=Number(BigInt(tag));
      if(!Number.isSafeInteger(number)||number<quote.blockNumber)throw new Error("RPC_UNAVAILABLE: expiry head precedes its quote");
      const [headRaw,quoteRaw]=await Promise.all([provider.send("eth_getBlockByNumber",[tag,false]),provider.send("eth_getBlockByNumber",[ethers.toQuantity(quote.blockNumber),false])]);
      const head=block(headRaw,number),origin=block(quoteRaw,quote.blockNumber);
      if(!equal(origin.hash,quote.blockHash)||origin.timestamp>head.timestamp||Math.abs(Math.floor(Date.now()/1000)-head.timestamp)>120)throw new Error("RPC_UNAVAILABLE: expiry quote/head block is stale or inconsistent");
      if(BigInt(head.timestamp)<=call.args.authDeadline)throw new Error("PENDING: the signed BUY authorization has not expired on chain");
      const read=async(fn:string,args:unknown[],blockTag:string)=>iface.decodeFunctionResult(fn,await provider.send("eth_call",[{to:operation.hubAddress,data:iface.encodeFunctionData(fn,args)},blockTag]));
      const args=[call.args.campaignId,call.args.campaignIdentity],originTag=ethers.toQuantity(origin.number);
      const [historicalNonce,nonce,historicalTerms,signer,principal,oldReceipt]=await Promise.all([
        read("identityNonces",args,originTag),read("identityNonces",args,tag),read("campaignTerms",[call.args.campaignId],originTag),read("authorizedSigner",[],originTag),read("campaignIdentityPrincipals",args,tag),
        operation.txHash?provider.send("eth_getTransactionReceipt",[operation.txHash]):Promise.resolve(null),
      ]);
      if(oldReceipt)throw new Error("CONFLICT: this hash has a receipt; recover its canonical outcome first");
      if(historicalNonce[0]!==BigInt(quote.authorizationNonce)||nonce[0]!==historicalNonce[0])throw new Error("CONFLICT: the purchase nonce changed; recover commitments before preparing another purchase");
      if(!equal(historicalTerms.termsHash,quote.termsHash)||!ethers.isAddress(signer[0])||signer[0]===ethers.ZeroAddress
        ||principal[0]!==ethers.ZeroAddress&&!equal(principal[0],operation.principal))throw new Error("CONFLICT: BUY terms/signer/principal chain binding changed");
      let recovered:string;
      try{recovered=ethers.verifyTypedData({name:"GroupDealHub",version:"1",chainId:operation.chainId,verifyingContract:operation.hubAddress},buyTypes,
        {chainId:operation.chainId,hubContract:operation.hubAddress,campaignId:call.args.campaignId,termsHash:quote.termsHash,campaignIdentity:call.args.campaignIdentity,buyerWallet:operation.principal,nonce:quote.authorizationNonce,maxQuantity:call.args.maxAuthQuantity,deadline:call.args.authDeadline},call.args.authSignature);}
      catch{throw new Error("CONFLICT: original BUY signature is not bound to the recorded nonce and deadline");}
      if(!equal(recovered,signer[0]))throw new Error("CONFLICT: original BUY signature is not bound to its historical chain signer");
      const [headAgain,originAgain]=await Promise.all([provider.send("eth_getBlockByNumber",[tag,false]),provider.send("eth_getBlockByNumber",[originTag,false])]);
      const repeatedHead=block(headAgain,head.number),repeatedOrigin=block(originAgain,origin.number);
      if(!equal(repeatedHead.hash,head.hash)||repeatedHead.timestamp!==head.timestamp||!equal(repeatedOrigin.hash,origin.hash)||repeatedOrigin.timestamp!==origin.timestamp)throw new Error("RPC_UNAVAILABLE: expiry canonical block changed");
      return store.transaction(()=>{
        const current=scoped(userId,id);if(current.phase==="EXPIRED"&&current.authorizationExpiry)return current;
        if(!eligible(current)||current.txHash!==operation.txHash||current.calldata!==operation.calldata||current.payloadHash!==operation.payloadHash||current.principal!==operation.principal||JSON.stringify(current.purchaseQuote)!==JSON.stringify(quote))throw new Error("CONFLICT: BUY intent changed during expiry verification");
        if(current.projectedOrderId||Object.values(store.db.orders).some(order=>order.commitmentTxHash&&equal(order.commitmentTxHash,current.txHash)))throw new Error("CONFLICT: existing commitment projection requires reconciliation");
        current.authorizationExpiry={blockNumber:head.number,blockHash:head.hash,blockTimestamp:head.timestamp,deadline:Number(call.args.authDeadline),authorizationNonce:quote.authorizationNonce,quoteBlockNumber:origin.number,quoteBlockHash:origin.hash,authorizationSigner:ethers.getAddress(signer[0]),verifiedAt:Date.now()};
        current.phase="EXPIRED";current.errorCode="BUY_AUTHORIZATION_EXPIRED_UNCONSUMED";current.updatedAt=Date.now();
        store.addAuditLog(userId,"buyer","BUY_AUTHORIZATION_EXPIRY_VERIFIED",{operationId:id,blockNumber:head.number,blockHash:head.hash,deadline:Number(call.args.authDeadline),authorizationNonce:quote.authorizationNonce},`expiry:${id}`);
        return current;
      });
    }catch(error){if(error instanceof Error&&/^(CONFLICT|PENDING|RPC_UNAVAILABLE):/.test(error.message))throw error;throw new Error("RPC_UNAVAILABLE: BUY expiry could not be verified; retain the existing intent");}
    finally{provider.destroy();}
  }
}
