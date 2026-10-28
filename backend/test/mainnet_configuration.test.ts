import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import {ethers} from 'ethers';
import {ARC_NETWORK,ARC_CHAIN_ID,ARC_CIRCLE_BLOCKCHAIN,ARC_KIT_CHAIN,networkManifest,assertDeploymentConfigured} from '../../shared/network.mjs';
import {ARC_WALLET_TOKENS,arcWalletToken,parseWalletAmount} from '../../shared/arcWallet.mjs';
import {config} from '../src/config';
import {circleWalletRecord,circleProviderWallets} from '../src/domain/circleWalletAuthority';
import {providerScopeSchema} from '../src/domain/providerContract';
import {readWalletIntent,walletSendCall} from '../src/domain/walletQuote';
import {createWalletFlow,readWalletFlow} from '../src/domain/walletFlow';
import {assertWalletTransaction} from '../src/domain/walletReceipt';
import {ArcReadProvider} from '../src/services/arcReadProvider';
import {validateManifestAndEnvironment} from '../src/services/manifestValidator';
import {validateRuntimeSecurity} from '../src/services/runtimeSecurity';
import {WalletSwapService} from '../src/services/walletSwapService';
import {readServerBridgeRpc} from '../src/services/bridgeReadRpc';
import {faucetRouter} from '../src/routes/faucetRoutes';
import {bridgeRouter} from '../src/routes/bridgeRoutes';

async function main(){
 assert.equal(ARC_CHAIN_ID,5042);assert.equal(ARC_CIRCLE_BLOCKCHAIN,'ARC');assert.equal(ARC_KIT_CHAIN,'Arc');
 assert.equal(config.arcChainId,5042);assert.equal(config.environment,'arc-mainnet');assert.match(config.runtimeDataDirectory,/data[\\/]arc-mainnet$/);
 assert.equal(config.hubAddress,'');assert.equal(config.protocolVersion,0);assert.equal(ARC_NETWORK.deploymentStatus,'UNDEPLOYED');
 assert.throws(()=>assertDeploymentConfigured(),/MAINNET_DEPLOYMENT_NOT_CONFIGURED/);
 assert.throws(()=>validateRuntimeSecurity(),/MAINNET_DEPLOYMENT_NOT_CONFIGURED/);
 const hadMainnetDirectory=fs.existsSync(config.runtimeDataDirectory);
 const {startServer}=await import('../src/index');
 await assert.rejects(startServer(),/MAINNET_DEPLOYMENT_NOT_CONFIGURED/);
 assert.equal(fs.existsSync(config.runtimeDataDirectory),hadMainnetDirectory,'Blocked startup must not create the runtime database directory');
 assert.equal(networkManifest('arc-testnet').chainId,5042002);assert.equal(networkManifest('local').chainId,31337);assert.throws(()=>networkManifest('mainnett'),/UNSUPPORTED/);
 assert.deepEqual(Object.keys(ARC_WALLET_TOKENS),['USDC']);assert.throws(()=>arcWalletToken('EURC'),/UNSUPPORTED/);
 assert.equal(parseWalletAmount('1.000001','USDC'),1000001n);assert.throws(()=>parseWalletAmount('0.0000001','USDC'),/PRECISION/);
 const principal=ethers.Wallet.createRandom().address.toLowerCase(),recipient=ethers.Wallet.createRandom().address.toLowerCase();
 assert.equal(circleWalletRecord({walletId:'wallet-fixture',address:principal,blockchain:'ARC'}).blockchain,'ARC');
 assert.throws(()=>circleWalletRecord({walletId:'wallet-fixture',address:principal,blockchain:'ARC-TESTNET'}));
 assert.equal(circleProviderWallets([{id:'old',address:principal,blockchain:'ARC-TESTNET',state:'LIVE',accountType:'EOA'}]).length,0);
 assert.equal(circleProviderWallets([{id:'current',address:principal,blockchain:'ARC',state:'LIVE',accountType:'EOA'}]).length,1);
 const scope={subscriptionId:'s',campaignId:'c',productVersionId:'p',licenseVersionId:'l',chainId:5042,hubAddress:principal};
 assert.ok(providerScopeSchema.safeParse(scope).success);assert.ok(!providerScopeSchema.safeParse({...scope,chainId:5042002}).success);
 const intent=readWalletIntent({kind:'SEND',recipient,amount:'1.000001'}),now=Date.now(),secret=crypto.randomBytes(32);
 const quote={version:1 as const,kind:'SEND' as const,chainId:5042,principal,tokenIn:'USDC' as const,tokenOut:'USDC' as const,amount:'1000001',recipient,estimatedOut:'1000001',minimumOut:'1000001',slippageBps:0,requestedAt:now,expiresAt:now+60000,fees:[],calls:[{...walletSendCall(intent as any,principal),fee:{gasLimit:'50000',maxFeePerGas:'25000000000',maxNetworkFee:'1250000000000000'}}]};
 const record=createWalletFlow('mainnet-fixture',crypto.randomUUID(),intent,quote,undefined,secret);
 assert.equal(readWalletFlow(record,secret).chainId,5042);
 assert.throws(()=>readWalletFlow({...record,chainId:5042002},secret));
 const txHash=ethers.id('mainnet-simulated-transaction');record.steps[0].nonce='0';
 const tx={hash:txHash,from:principal,to:quote.calls[0].to,input:quote.calls[0].data,chainId:'0x13b2',nonce:'0x0',value:'0x0',gas:'0xc350',gasPrice:'0x5d21dba00'};
 assertWalletTransaction(record,0,tx,txHash);assert.throws(()=>assertWalletTransaction(record,0,{...tx,chainId:'0x4cef52'},txHash));
 assert.throws(()=>assertWalletTransaction(record,0,{...tx,input:'0xdeadbeef'},txHash));
 let calls=0;await assert.rejects(new WalletSwapService((async()=>{calls++;throw Error()}) as any).quote({kind:'SWAP',tokenIn:'USDC',tokenOut:'EURC',amount:'1',slippageBps:50},principal),/MAINNET_SWAP_NOT_ENABLED/);assert.equal(calls,0);
 const app=express();app.use('/faucet',faucetRouter);app.use('/bridge',bridgeRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const base='http://127.0.0.1:'+(server.address() as any).port;for(const p of ['/faucet/usdc','/bridge/']){const r=await fetch(base+p,{method:'POST'});assert.equal(r.status,403);}}finally{await new Promise<void>(r=>server.close(()=>r()));}
 const originalFetch=globalThis.fetch,provider=new ArcReadProvider(['https://rpc-fixture.invalid'],5042);
 await assert.rejects(readServerBridgeRpc('Arc_Testnet','eth_chainId',[]),/BRIDGE_READ_INVALID/);
 try{globalThis.fetch=(async()=>({ok:true,json:async()=>[{jsonrpc:'2.0',id:-1,result:'0x4cef52'},{jsonrpc:'2.0',id:7,result:'0x32'}]})) as any;await assert.rejects(provider._send({jsonrpc:'2.0',id:7,method:'eth_blockNumber',params:[]}),/wrong network/);
  globalThis.fetch=(async()=>({ok:true,json:async()=>[{jsonrpc:'2.0',id:-1,result:'0x13b2'},{jsonrpc:'2.0',id:7,result:'0x32'}]})) as any;assert.equal((await provider._send({jsonrpc:'2.0',id:7,method:'eth_blockNumber',params:[]}))[0].result,'0x32');
  await assert.rejects(provider._send({jsonrpc:'2.0',id:7,method:'eth_sendRawTransaction',params:[]}),/rejects mutation/);
 }finally{globalThis.fetch=originalFetch;provider.destroy();}
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mainnet-manifest-fixture-')),manifest=structuredClone(ARC_NETWORK),code='0x6001600055';
 const addresses=Array.from({length:5},()=>ethers.Wallet.createRandom().address);
 Object.assign(manifest,{protocolVersion:2,deploymentStatus:'VERIFIED'});Object.assign(manifest.contracts.GroupDealHub,{address:addresses[0],deploymentBlock:40,bytecodeHash:ethers.keccak256(code),txHash:ethers.id('deployment-fixture')});
 manifest.roles={owner:{address:addresses[1]},authorizedSigner:{address:new ethers.Wallet(config.authorizedSignerPrivateKey).address},operator:{address:config.operatorAddress},securityAuthority:{type:'safe-multisig',address:addresses[2],owners:[addresses[3],addresses[4]],threshold:2,safeVersion:'1.5.0',bytecodeHash:ethers.keccak256(code)}};
 const filename=path.join(directory,'fixture.json'),write=()=>fs.writeFileSync(filename,JSON.stringify(manifest));write();assertDeploymentConfigured(manifest);
 const abi=new ethers.Interface(['function protocolVersion() view returns(uint256)','function usdcToken() view returns(address)','function owner() view returns(address)','function authorizedSigner() view returns(address)','function operatorAddress() view returns(address)','function securityAuthority() view returns(address)','function decimals() view returns(uint8)','function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function VERSION() view returns(string)']);
 let decimals=6n,operator=manifest.roles.operator.address;
 const fake:any={getNetwork:async()=>({chainId:5042n}),getCode:async()=>code,getBlock:async(tag:any)=>({timestamp:Math.floor(Date.now()/1000),number:tag==='finalized'?50:Number(tag),hash:ethers.id('block-'+(tag==='finalized'?50:Number(tag)))}),getTransactionReceipt:async()=>({status:1,contractAddress:addresses[0],blockNumber:40,blockHash:ethers.id('block-40')}),call:async(tx:any)=>{
  const f=abi.parseTransaction({data:tx.data})!,values:any={protocolVersion:2n,usdcToken:manifest.contracts.USDC.address,owner:addresses[1],authorizedSigner:manifest.roles.authorizedSigner.address,operatorAddress:operator,securityAuthority:addresses[2],decimals,getOwners:[addresses[3],addresses[4]],getThreshold:2n,VERSION:'1.5.0'};return abi.encodeFunctionResult(f.name,[values[f.name]]);
 }};
 try{
  assert.equal((await validateManifestAndEnvironment(fake,filename)).valid,true);
  decimals=18n;await assert.rejects(validateManifestAndEnvironment(fake,filename),/AUTHORITY_MISMATCH/);decimals=6n;
  operator=addresses[1];await assert.rejects(validateManifestAndEnvironment(fake,filename),/AUTHORITY_MISMATCH/);operator=manifest.roles.operator.address;
  manifest.roles.securityAuthority.threshold=1;write();await assert.rejects(validateManifestAndEnvironment(fake,filename),/NOT_CONFIGURED/);manifest.roles.securityAuthority.threshold=2;
  manifest.contracts.GroupDealHub.bytecodeHash=ethers.id('wrong-runtime');write();await assert.rejects(validateManifestAndEnvironment(fake,filename),/Bytecode hash mismatch/);
  await assert.rejects(validateManifestAndEnvironment({...fake,getNetwork:async()=>({chainId:5042002n})},filename),/does not match provider chainId/);
 }finally{if(path.dirname(path.resolve(directory))!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('mainnet-manifest-fixture-'))throw Error('FIXTURE_CLEANUP_SCOPE_INVALID');fs.rmSync(directory,{recursive:true,force:true});}
 console.log('PASS Mainnet fixtures: network isolation, undeployed startup denial, ARC wallet authority, provider scope, quote MAC, wrong-chain/calldata receipt denial, read-only RPC, closed faucet/bridge/swap, finalized runtime/token/role/Safe checks. No live acceptance.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
