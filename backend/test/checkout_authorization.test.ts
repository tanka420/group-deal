import assert from "node:assert/strict";
import { ethers } from "ethers";
import { config } from "../src/config";
import { store } from "../src/db/store";
import { AuthService } from "../src/services/authService";
import { AuthorizationService } from "../src/services/authorizationService";
import { CampaignEditorService } from "../src/services/campaignEditorService";
import { reviewedProductVerified } from "./fixtures/product";
import { ProductService } from "../src/services/productService";
import { HUB_ABI } from "../src/contracts/hubAbi";

async function run() {
  assert.ok(store.isIsolated);
  const originalFetch=globalThis.fetch,originalConfig={arcRpcUrl:config.arcRpcUrl,arcChainId:config.arcChainId,hubAddress:config.hubAddress,authorizedSignerPrivateKey:config.authorizedSignerPrivateKey};
  const signer=ethers.Wallet.createRandom(),buyer=ethers.Wallet.createRandom().address,payout=ethers.Wallet.createRandom().address;
  Object.assign(config,{arcRpcUrl:"https://fixture.invalid",arcChainId:5042002,hubAddress:ethers.Wallet.createRandom().address,authorizedSignerPrivateKey:signer.privateKey});
  const product=await reviewedProductVerified("seller",payout),session=AuthService.createCircleSession("fixture@example.com","fixture-circle");
  store.db.users[session.user.id].activeWallet=buyer;
  const campaign=CampaignEditorService.saveDraft("seller",{title:"Test deal",description:"Resource",thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:"BUYER_COUNT",tiers:[{threshold:1,priceUSDC:"105"},{threshold:10,priceUSDC:"89"}],maxPerAccount:10,inventoryLimit:100,durationDays:7,deliverySlaHours:24,deliveryMethod:"FILE_LINK"});
  Object.assign(campaign,{status:"ACTIVE",onchainCampaignId:1,chainId:config.arcChainId,hubAddress:config.hubAddress,startTime:Math.floor(Date.now()/1000)-60,endTime:Math.floor(Date.now()/1000)+3600,productSnapshot:product.snapshot});
  campaign.termsHash=CampaignEditorService.termsHash(campaign);
  const truth=structuredClone(campaign),hub=new ethers.Interface(HUB_ABI),blockHash=ethers.id("quote-block");
  let requests=0,mode="valid";
  const calls:string[]=[];
  const tuple=(fn:string,record:any)=>hub.getFunction(fn)!.outputs.map(c=>record[c.name]??(c.type==="address"?ethers.ZeroAddress:c.type==="bytes32"?ethers.ZeroHash:c.type==="bool"?false:0));
  globalThis.fetch=(async(url,init)=>{
    requests++;
    if(mode==="offline"||String(url).includes("fixture.invalid"))return new Response("",{status:429});
    const batch=JSON.parse(String(init?.body));
    const result=batch.map((request:any)=>{
      let result:any;
      if(request.method==="eth_chainId")result=String(url).includes("blockdaemon")?"0x1":"0x4cef52";
      else if(request.method==="eth_blockNumber")result="0x7d";
      else if(request.method==="eth_getBlockByNumber")result={number:"0x7d",hash:mode==="reorg"&&calls.length?ethers.id("changed"):blockHash,timestamp:ethers.toQuantity(Math.floor(Date.now()/1000))};
      else {
        assert.equal(request.method,"eth_call");assert.equal(request.params[1],"0x7d","Every financial read must use the captured block");
        const parsed=hub.parseTransaction({data:request.params[0].data})!;calls.push(parsed.name);
        switch(parsed.name) {
          case "campaignTerms":return {jsonrpc:"2.0",id:request.id,result:hub.encodeFunctionResult(parsed.name,tuple(parsed.name,{...truth,metric:0,termsHash:mode==="terms"?ethers.id("changed terms"):truth.termsHash}))};
          case "campaignStates":return {jsonrpc:"2.0",id:request.id,result:hub.encodeFunctionResult(parsed.name,tuple(parsed.name,{...truth,status:mode==="closed"?2:1,totalUnitsCommitted:mode==="inventory"?100:2,currentUnlockedTier:0}))};
          case "getCampaignTiers":result=truth.tiers;break;
          case "campaignIdentityPrincipals":result=mode==="principal"?payout:buyer;break;
          case "identityNonces":result=7;break;
          case "buyerUnitsCommitted":result=mode==="limit"?10:2;break;
          case "authorizedSigner":result=signer.address;break;
          default:throw new Error("Unexpected fixture read");
        }
        result=hub.encodeFunctionResult(parsed.name,[result]);
      }
      return {jsonrpc:"2.0",id:request.id,result};
    });
    return new Response(JSON.stringify(result),{headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  try {
    for(const quantity of [-1,0,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])await assert.rejects(AuthorizationService.generateBuyAuthorization(session.user.id,campaign.id,quantity,buyer),/positive safe integer/);
    assert.equal(requests,0);
    campaign.termsPolicyReviewRequired=true;
    await assert.rejects(AuthorizationService.generateBuyAuthorization(session.user.id,campaign.id,1,buyer),/changed chain terms/);
    assert.equal(requests,0,"Unbound updated terms refuse authorization before signing or RPC");
    campaign.termsPolicyReviewRequired=false;
    campaign.totalUnitsCommitted=0;
    const result=await AuthorizationService.generateBuyAuthorization(session.user.id,campaign.id,1,buyer);
    assert.equal(result.nonce,7);assert.equal(result.maxQuantity,3);assert.equal(result.quote.commitmentAmount,"105000000");assert.equal(result.quote.remainingInventory,"98");assert.equal(result.quote.blockHash,blockHash);
    assert.ok(result.signature.startsWith("0x"));assert.ok(calls.includes("buyerUnitsCommitted"));
    for(const [next,pattern] of [["principal",/pinned/],["limit",/maximum units/],["inventory",/remaining campaign inventory/],["terms",/CHAIN_TERMS_MISMATCH/],["closed",/closed/],["offline",/Fail-Closed/]] as const){mode=next;await assert.rejects(AuthorizationService.generateBuyAuthorization(session.user.id,campaign.id,1,buyer),pattern);}
    mode='valid';const originalSign=ethers.Wallet.prototype.signTypedData,issuedBefore=store.db.auditLogs.filter(r=>r.action==='BUY_AUTHORIZATION_ISSUED').length;let signingCalls=0,returned=false;
    try{
      ethers.Wallet.prototype.signTypedData=async function(...args:Parameters<typeof originalSign>){signingCalls++;const signed=await originalSign.apply(this,args);await product.reviewRights({decision:'REVOKED',reason:'Committed revocation while local signing awaited'});return signed;};
      try{const result=await AuthorizationService.generateBuyAuthorization(session.user.id,campaign.id,1,buyer);returned=typeof result.signature==='string';}catch(error){assert.match((error as Error).message,/^RIGHTS_REQUIRED/);}
      assert.equal(signingCalls,1);assert.equal(store.db.rights[product.rights.id].status,'REVOKED');assert.equal(returned,false,'SIGNATURE_RELEASE_POLICY_BOUNDARY');assert.equal(store.db.auditLogs.filter(r=>r.action==='BUY_AUTHORIZATION_ISSUED').length,issuedBefore);
    }finally{ethers.Wallet.prototype.signTypedData=originalSign}
    const before=requests;
    await assert.rejects(AuthorizationService.generateBuyAuthorization(session.user.id,campaign.id,1,buyer),/RIGHTS_REQUIRED/);assert.equal(requests,before,"Revoked rights refuse a new authorization before RPC");
    console.log("PASS fixed-block authorization/quote, chain quantities and limits, pinned principal, terms, RPC failover, closed campaign, committed revocation during local signing and signature release guard");
  } finally {globalThis.fetch=originalFetch;Object.assign(config,originalConfig);store.close();}
}
run().catch(error=>{console.error(error);try{store.close()}catch{}process.exitCode=1;});
