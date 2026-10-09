import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ethers} from 'ethers';
import {config} from '../src/config';
import {ArcReadProvider} from '../src/services/arcReadProvider';
import {validateManifestAndEnvironment} from '../src/services/manifestValidator';

// Exercise the real startup branch (no providerOverride), isolated RPC methods.
// No DB import, worker, live provider, credentials or operational data writes.
async function main(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'groupdeal-manifest-startup-')),file=path.join(folder,'manifest.json');
 const original={arcChainId:config.arcChainId,hubAddress:config.hubAddress,usdcAddress:config.usdcAddress,deploymentBlock:config.deploymentBlock,protocolVersion:config.protocolVersion};
 const getNetwork=ArcReadProvider.prototype.getNetwork,getCode=ArcReadProvider.prototype.getCode;let reads=0;
 const manifest={environment:'arc-testnet',chainId:5042002,contracts:{GroupDealHub:{address:'0x1111111111111111111111111111111111111111',deploymentBlock:12345,bytecodeHash:ethers.keccak256('0x6001')},USDC:{address:'0x3600000000000000000000000000000000000000'}}};
 const write=(data:any)=>fs.writeFileSync(file,JSON.stringify(data));
 try{
  Object.assign(config,{arcChainId:5042002,hubAddress:manifest.contracts.GroupDealHub.address,usdcAddress:manifest.contracts.USDC.address,deploymentBlock:12345,protocolVersion:1});
  ArcReadProvider.prototype.getNetwork=async()=>({chainId:5042002n} as ethers.Network);
  ArcReadProvider.prototype.getCode=async(address:any)=>{reads++;return String(address).toLowerCase()===config.hubAddress.toLowerCase()?'0x6001':'0x6002';};
  write(manifest);assert.equal((await validateManifestAndEnvironment(undefined,file)).valid,true);assert.equal(reads,2);
  write({...manifest,chainId:1});reads=0;await assert.rejects(validateManifestAndEnvironment(undefined,file),/Manifest chainId/);assert.equal(reads,0);
  for(const changed of [
   {...manifest,contracts:{...manifest.contracts,GroupDealHub:{...manifest.contracts.GroupDealHub,deploymentBlock:12346}}},
   {...manifest,contracts:{...manifest.contracts,GroupDealHub:{...manifest.contracts.GroupDealHub,deploymentBlock:undefined}}},
   {...manifest,contracts:{...manifest.contracts,GroupDealHub:{...manifest.contracts.GroupDealHub,address:'0x2222222222222222222222222222222222222222'}}},
   {...manifest,contracts:{...manifest.contracts,USDC:{address:'0x2222222222222222222222222222222222222222'}}},
   {...manifest,protocolVersion:2},
  ]){write(changed);reads=0;await assert.rejects(validateManifestAndEnvironment(undefined,file),/Runtime configuration differs/);assert.equal(reads,0);}
  write({...manifest,contracts:{...manifest.contracts,GroupDealHub:{...manifest.contracts.GroupDealHub,bytecodeHash:ethers.keccak256('0x6003')}}});
  await assert.rejects(validateManifestAndEnvironment(undefined,file),/Bytecode hash mismatch/);
  console.log('PASS 8 startup manifest cases: nested deployment binding, wrong/missing block, chain/Hub/USDC/protocol mismatch and runtime bytecode mismatch. Isolated RPC boundary; no live acceptance.');
 }finally{Object.assign(config,original);ArcReadProvider.prototype.getNetwork=getNetwork;ArcReadProvider.prototype.getCode=getCode;}
}
main().catch(error=>{console.error(error instanceof Error&&error.message.includes('Runtime configuration differs')?'FAIL STARTUP_MANIFEST_RUNTIME_BINDING':'FAIL isolated startup manifest regression');process.exitCode=1;});
