import {ethers} from "ethers";
import {ARC_NETWORK as manifest,assertDeploymentConfigured} from '../../../shared/network.mjs';
import {HUB_ABI} from "../contracts/hubAbi";
import {readArcRpc} from "./arcRpc";
import {fallbackGasBudget,fallbackFeeIsFresh,type FallbackFeeBudget} from "./fallbackFeeReview";

const iface=new ethers.Interface(HUB_ABI),hub=manifest.contracts.GroupDealHub;
export const fallbackDeployment={chainId:manifest.chainId,hub:hub.address,deploymentBlock:hub.deploymentBlock,bytecodeHash:hub.bytecodeHash};
export type FallbackAction="DISPUTE"|"BREACH"|"BUYER_CLAIM"|"SELLER_CLAIM";
export interface FallbackIntent {action:FallbackAction;campaignId:string;orderId:string;principal:string;calldata:string;expectedFunction:string;expectedEvent:string;reasonHash?:string;amount?:string;blockNumber:number;blockHash:string;gasBudget:string;feeReview?:FallbackFeeBudget}
const names={DISPUTE:["openDispute","OrderDisputed"],BREACH:["claimDeliveryBreach","DeliveryBreached"],BUYER_CLAIM:["claimBuyerFunds","FundsClaimed"],SELLER_CLAIM:["claimSellerProceeds","FundsClaimed"]} as const;
const equal=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const quantity=(value:unknown):value is string=>typeof value==="string"&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value);
export async function fallbackBlock(){
  assertDeploymentConfigured();
  const tag=await readArcRpc<string>("eth_blockNumber"),block=await readArcRpc<any>("eth_getBlockByNumber",[tag,false]);
  const number=Number(BigInt(tag));
  if(!Number.isSafeInteger(number)||number<hub.deploymentBlock||!block||BigInt(block.number)!==BigInt(tag)||!ethers.isHexString(block.hash,32)||Math.abs(Math.floor(Date.now()/1000)-Number(BigInt(block.timestamp)))>120)throw new Error("Chưa xác minh được block Arc hiện tại.");
  const code=await readArcRpc<string>("eth_getCode",[hub.address,tag]);
  if(!ethers.isHexString(code)||ethers.keccak256(code).toLowerCase()!==hub.bytecodeHash.toLowerCase())throw new Error("Bytecode Hub không khớp manifest; chưa được ký.");
  return {tag,number,hash:block.hash,timestamp:Number(BigInt(block.timestamp))};
}
export async function prepareFallback(action:FallbackAction,campaignId:string,orderId:string,principal:string,reason:string,preparedReasonHash?:string):Promise<FallbackIntent>{
  if(!Object.prototype.hasOwnProperty.call(names,action)||![campaignId,orderId].every(s=>/^[1-9]\d{0,77}$/.test(s)&&BigInt(s)<=ethers.MaxUint256)||!ethers.isAddress(principal))throw new Error("Action, ID onchain hoặc principal không hợp lệ.");
  if(action==="DISPUTE"&&(preparedReasonHash?!ethers.isHexString(preparedReasonHash,32):!reason.trim()||reason.length>4000))throw new Error("Lý do dispute cần 1–4000 ký tự; giữ bản riêng để bổ sung bằng chứng sau.");
  const requestedAt=Date.now(),block=await fallbackBlock(),caller=ethers.getAddress(principal);
  const call=async(fn:string,args:unknown[])=>iface.decodeFunctionResult(fn,await readArcRpc<string>("eth_call",[{to:hub.address,data:iface.encodeFunctionData(fn,args)},block.tag]));
  const [order]=await call("getOrderDetails",[orderId]),terms=await call("campaignTerms",[campaignId]);
  if(order.orderId!==BigInt(orderId)||order.campaignId!==BigInt(campaignId))throw new Error("ID campaign/order không khớp trên chain.");
  if(!equal(action==="SELLER_CLAIM"?terms.sellerPayoutWallet:order.buyerPrincipal,caller))throw new Error("Kết nối đúng principal của order hoặc ví payout seller.");
  const [expectedFunction,expectedEvent]=names[action],reasonHash=action==="DISPUTE"?preparedReasonHash||ethers.keccak256(ethers.toUtf8Bytes(reason)):undefined;
  const args=action.includes("CLAIM")?[campaignId,[orderId]]:reasonHash?[campaignId,orderId,reasonHash]:[campaignId,orderId];
  const calldata=iface.encodeFunctionData(expectedFunction,args),tx={to:hub.address,from:caller,data:calldata,value:"0x0"};
  const result=iface.decodeFunctionResult(expectedFunction,await readArcRpc<string>("eth_call",[tx,block.tag]));
  const amount=action.includes("CLAIM")?BigInt(result[0]).toString():undefined;if(amount!==undefined&&BigInt(amount)<=0n)throw new Error("Chưa có khoản rút được chain xác minh.");
  const [gas,price,balance]=await Promise.all([readArcRpc<unknown>('eth_estimateGas',[tx,block.tag]),readArcRpc<unknown>('eth_gasPrice'),readArcRpc<unknown>('eth_getBalance',[caller,block.tag])]);
  const feeReview=fallbackGasBudget(gas,price,balance,requestedAt),budget=BigInt(feeReview.feeReserve);if(BigInt(feeReview.balance)<budget)throw new Error("Chưa đủ USDC native để trả gas theo ước tính và margin.");
  const repeated=await readArcRpc<any>("eth_getBlockByNumber",[block.tag,false]);if(!equal(repeated?.hash,block.hash))throw new Error("Block quote đã đổi; kiểm tra lại trước chữ ký.");
  if(!fallbackFeeIsFresh(feeReview))throw new Error('Ngân sách gas đã hết hạn. Đọc lại và đồng ý mới.');
  return {action,campaignId,orderId,principal:caller,calldata,expectedFunction,expectedEvent,...(reasonHash?{reasonHash}:{}),...(amount!==undefined?{amount}:{}),blockNumber:block.number,blockHash:block.hash,gasBudget:budget.toString(),feeReview};
}
/** Import a public, already sent transaction without simulating the action again after its state changed. */
export async function fallbackIntentFromTransaction(action:FallbackAction,campaignId:string,orderId:string,hash:string):Promise<FallbackIntent>{
  if(!Object.prototype.hasOwnProperty.call(names,action)||!ethers.isHexString(hash,32)||![campaignId,orderId].every(s=>/^[1-9]\d{0,77}$/.test(s)&&BigInt(s)<=ethers.MaxUint256))throw new Error("Action, ID hoặc hash không hợp lệ.");
  const block=await fallbackBlock(),tx=await readArcRpc<any>("eth_getTransactionByHash",[hash]);
  if(!tx||!equal(tx.hash,hash)||!equal(tx.to,hub.address)||BigInt(tx.chainId)!==BigInt(manifest.chainId)||BigInt(tx.value)!==0n)throw new Error("Chưa tìm thấy transaction đúng chain/Hub để phục hồi.");
  const [expectedFunction,expectedEvent]=names[action],parsed=iface.parseTransaction({data:tx.input});
  if(!parsed||parsed.name!==expectedFunction||String(parsed.args[0])!==campaignId||(action.includes("CLAIM")?parsed.args[1].length!==1||String(parsed.args[1][0])!==orderId:String(parsed.args[1])!==orderId))throw new Error("Transaction không khớp action/campaign/order đã chọn.");
  const [order]=iface.decodeFunctionResult("getOrderDetails",await readArcRpc<string>("eth_call",[{to:hub.address,data:iface.encodeFunctionData("getOrderDetails",[orderId])},block.tag]));
  const terms=iface.decodeFunctionResult("campaignTerms",await readArcRpc<string>("eth_call",[{to:hub.address,data:iface.encodeFunctionData("campaignTerms",[campaignId])},block.tag]));
  if(order.orderId!==BigInt(orderId)||order.campaignId!==BigInt(campaignId)||!equal(tx.from,action==="SELLER_CLAIM"?terms.sellerPayoutWallet:order.buyerPrincipal))throw new Error("Transaction không đúng principal của order/campaign.");
  return {action,campaignId,orderId,principal:ethers.getAddress(tx.from),calldata:tx.input,expectedFunction,expectedEvent,...(action==="DISPUTE"?{reasonHash:String(parsed!.args[2])}:{}),blockNumber:block.number,blockHash:block.hash,gasBudget:"0"};
}
/** Read-only receipt verification: a hash, wallet status or DB flag cannot finish a fallback action. */
export async function verifyFallback(intent:FallbackIntent,hash:string):Promise<"RECEIPT_VERIFIED"|"REVERTED">{
  if(!ethers.isHexString(hash,32))throw new Error("Hash phải có 32 bytes.");
  if(!Object.prototype.hasOwnProperty.call(names,intent.action)||!ethers.isAddress(intent.principal)||![intent.campaignId,intent.orderId].every(s=>/^[1-9]\d{0,77}$/.test(s)))throw new Error("Intent phục hồi không hợp lệ.");
  const [fn,eventName]=names[intent.action],args=intent.action.includes("CLAIM")?[intent.campaignId,[intent.orderId]]:intent.action==="DISPUTE"?[intent.campaignId,intent.orderId,intent.reasonHash]:[intent.campaignId,intent.orderId];
  if(intent.expectedFunction!==fn||intent.expectedEvent!==eventName||!equal(iface.encodeFunctionData(fn,args),intent.calldata))throw new Error("Intent phục hồi không canonical.");
  await fallbackBlock();
  const [tx,receipt]=await Promise.all([readArcRpc<any>("eth_getTransactionByHash",[hash]),readArcRpc<any>("eth_getTransactionReceipt",[hash])]);
  if(!tx||!receipt)throw new Error("Receipt chưa có; giữ intent/hash và kiểm tra lại, chưa ký lại.");
  if(![tx.value,tx.nonce,tx.chainId,tx.blockNumber,tx.transactionIndex,receipt.blockNumber,receipt.transactionIndex,receipt.status].every(quantity)||!ethers.isHexString(receipt.blockHash,32))throw new Error("Receipt/transaction thiếu canonical quantity hoặc nonce.");
  if(!equal(tx.hash,hash)||!equal(receipt.transactionHash,hash)||!equal(tx.to,hub.address)||!equal(receipt.to,hub.address)||!equal(tx.from,intent.principal)||!equal(receipt.from,intent.principal)||!equal(tx.input,intent.calldata)||BigInt(tx.value)!==0n||BigInt(tx.chainId)!==BigInt(manifest.chainId)||!equal(tx.blockHash,receipt.blockHash)||tx.blockNumber!==receipt.blockNumber||tx.transactionIndex!==receipt.transactionIndex||!Array.isArray(receipt.logs))throw new Error("Receipt không khớp exact intent/chain/Hub/principal/calldata.");
  const number=Number(BigInt(receipt.blockNumber));if(!Number.isSafeInteger(number)||number<hub.deploymentBlock)throw new Error("Block receipt không hợp lệ.");
  const block=await readArcRpc<any>("eth_getBlockByNumber",[receipt.blockNumber,false]);if(!equal(block?.hash,receipt.blockHash)||BigInt(block.number)!==BigInt(receipt.blockNumber))throw new Error("Receipt chưa thuộc block canonical.");
  const status=BigInt(receipt.status);if(status!==0n&&status!==1n)throw new Error("Trạng thái receipt chưa xác minh.");
  if(status===0n&&receipt.logs.length)throw new Error("Revert proof có logs không hợp lệ.");
  if(status===1n){
    const indices=new Set<string>();
    for(const log of receipt.logs){
      if(!ethers.isAddress(log.address)||!ethers.isHexString(log.data)||!Array.isArray(log.topics)||!log.topics.every((topic:unknown)=>typeof topic==="string"&&ethers.isHexString(topic,32))||!quantity(log.logIndex)||indices.has(log.logIndex.toLowerCase())||log.removed!==false||!equal(log.transactionHash,hash)||!equal(log.blockHash,receipt.blockHash)||log.blockNumber!==receipt.blockNumber||log.transactionIndex!==receipt.transactionIndex)throw new Error("Log receipt thiếu exact identity/index hoặc đã bị removed.");
      indices.add(log.logIndex.toLowerCase());
    }
    const matches=receipt.logs.filter((log:any)=>equal(log.address,hub.address)&&equal(log.transactionHash,hash)&&equal(log.blockHash,receipt.blockHash)&&log.blockNumber===receipt.blockNumber&&log.transactionIndex===receipt.transactionIndex&&log.removed!==true).map((log:any)=>{try{return iface.parseLog(log);}catch{return null;}}).filter((event:any)=>event?.name===intent.expectedEvent&&String(event.args.campaignId)===intent.campaignId);
    if(matches.length!==1)throw new Error("Chưa có đúng một event hợp lệ cho intent.");
    const event=matches[0]!;
    if(intent.action.includes("CLAIM")){
      if(!equal(event.args.recipient,intent.principal)||event.args.claimType!==BigInt(intent.action==="BUYER_CLAIM"?0:2)||event.args.amount<=0n)throw new Error("Claim event không khớp recipient/type/amount.");
    }else if(String(event.args.orderId)!==intent.orderId||intent.reasonHash&&(!equal(event.args.reasonHash,intent.reasonHash)||!equal(event.args.disputedBy,intent.principal)))throw new Error("Event không khớp order/reason/principal.");
  }
  if(!equal((await readArcRpc<any>("eth_getBlockByNumber",[receipt.blockNumber,false]))?.hash,block.hash))throw new Error("Block receipt đã đổi; giữ hash để kiểm tra lại.");
  return status===0n?"REVERTED":"RECEIPT_VERIFIED";
}
