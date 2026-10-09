import {expect} from 'chai';
import {artifacts} from 'hardhat';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import * as ts from 'typescript';
import {assertLegacyDeploymentAllowed,prepareCandidate,PreparationError} from '../scripts/candidatePreparation';

describe('Offline V2 deployment preparation and legacy command guard',()=>{
 let artifact:any,build:any,manifest:any,observation:any;
 before(async()=>{
  artifact=await artifacts.readArtifact('contracts/GroupDealHubV2.sol:GroupDealHubV2');build=await artifacts.getBuildInfo('contracts/GroupDealHubV2.sol:GroupDealHubV2');
  manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../shared/manifests/arc-testnet.json'),'utf8'));
  observation={status:'PASS',layer:'READ_ONLY_FIXED_BLOCK_DEPLOYMENT',acceptanceEligible:false,candidateFrozen:false,chainId:manifest.chainId,fixedBlock:{number:65561326,hash:'0x'+'12'.repeat(32),timestamp:1791170914},hub:{address:manifest.contracts.GroupDealHub.address,runtimeBytecodeHash:manifest.contracts.GroupDealHub.bytecodeHash,protocolVersion:manifest.protocolVersion??1,...Object.fromEntries(['owner','authorizedSigner','operator','securityAuthority'].map(n=>[n,manifest.roles[n].address]))},safe:{address:manifest.roles.securityAuthority.address,threshold:2,owners:[manifest.roles.owner.address,'0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222'],version:manifest.roles.securityAuthority.safeVersion}};
 });
 const source=(name:string)=>fs.readFileSync(name.startsWith('contracts/')?path.resolve(__dirname,'..',name):require.resolve(name),'utf8');
 const prepare=(m=manifest,o=observation,b=build,a=artifact,read=source)=>prepareCandidate(m,o,b,a,read);
 const reject=(fn:()=>unknown,code:string)=>expect(fn).to.throw(PreparationError,code);
 it('constructs the exact unsigned V2 creation data from current compiler sources without mutating inputs',()=>{
  const before=JSON.stringify({manifest,observation}),result=prepare();expect(result.protocolVersion).to.equal(2);expect(result.compiler.sources.length).to.be.greaterThan(1);
  expect(result.unsignedCreation.data).to.equal(artifact.bytecode+new (require('ethers').Interface)(artifact.abi).encodeDeploy(result.contract.constructorArguments).slice(2));
  expect(result.unsignedCreation.from).to.equal(manifest.roles.owner.address);expect(result.unsignedCreation.nonce).to.equal(null);expect(result.unsignedCreation.feesApproved).to.equal(false);expect(result.scope.broadcastReady).to.equal(false);expect(result.runtimeTemplate.initialized).to.equal(false);expect(JSON.stringify({manifest,observation})).to.equal(before);
 });
 it('rejects another chain or a mock payment token',()=>{
  reject(()=>prepare({...manifest,chainId:1}),'CANDIDATE_NETWORK_INVALID');reject(()=>prepare({...manifest,contracts:{...manifest.contracts,USDC:{address:'0x1111111111111111111111111111111111111111'}}}),'CANDIDATE_NETWORK_INVALID');
 });
 it('rejects missing, failed, frozen or mismatched read-only deployment observations',()=>{
  for(const change of [{status:'FAIL'},{acceptanceEligible:true},{candidateFrozen:true},{chainId:1},{layer:'LOCAL_FIXTURE'},{hub:{...observation.hub,address:'0x1111111111111111111111111111111111111111'}},{fixedBlock:{number:1,hash:'0x'}}])reject(()=>prepare(manifest,{...observation,...change}),'CURRENT_DEPLOYMENT_OBSERVATION_INVALID');
 });
 it('rejects mismatched or overlapping candidate authorities',()=>{
  reject(()=>prepare({...manifest,roles:{...manifest.roles,operator:manifest.roles.owner}}),'CANDIDATE_ROLES_INVALID');reject(()=>prepare(manifest,{...observation,hub:{...observation.hub,operator:manifest.roles.owner.address}}),'CANDIDATE_ROLES_INVALID');
 });
 it('requires the previously verified Safe quorum and version',()=>{
  for(const change of [{threshold:1},{owners:[]},{version:'1.0.0'},{address:manifest.roles.owner.address}])reject(()=>prepare(manifest,{...observation,safe:{...observation.safe,...change}}),'CANDIDATE_SAFE_OBSERVATION_INVALID');
 });
 it('rejects incompatible compiler version, EVM target, optimizer or viaIR',()=>{
  reject(()=>prepare(manifest,observation,{...build,solcVersion:'0.8.25'}),'CANDIDATE_COMPILER_SETTINGS_INVALID');
  for(const change of [{evmVersion:'paris'},{viaIR:false},{optimizer:{enabled:false,runs:200}},{optimizer:{enabled:true,runs:1}}])reject(()=>prepare(manifest,observation,{...build,input:{...build.input,settings:{...build.input.settings,...change}}}),'CANDIDATE_COMPILER_SETTINGS_INVALID');
 });
 it('rejects V1 artifact or mismatched ABI and creation/runtime bytes',()=>{
  for(const change of [{contractName:'GroupDealHub'},{abi:[]},{bytecode:'0x6000'},{deployedBytecode:'0x6000'}])reject(()=>prepare(manifest,observation,build,{...artifact,...change}),'CANDIDATE_ARTIFACT_MISMATCH');
 });
 it('rejects stale primary or dependency source rather than trusting artifact timestamps',()=>{
  for(const target of ['contracts/GroupDealHubV2.sol',Object.keys(build.input.sources).find(n=>n.startsWith('@openzeppelin/'))!])reject(()=>prepare(manifest,observation,build,artifact,name=>source(name)+(name===target?'\n// changed':'')),'CANDIDATE_STALE_COMPILER_SOURCE');
 });
 it('rejects unavailable current source and compiler URL inputs',()=>{
  reject(()=>prepare(manifest,observation,build,artifact,()=>{throw new Error('private-source-diagnostic');}),'CANDIDATE_CURRENT_SOURCE_UNAVAILABLE');
  const changed=structuredClone(build);changed.input.sources['contracts/GroupDealHubV2.sol']={urls:['private-url']};reject(()=>prepare(manifest,observation,changed),'CANDIDATE_COMPILER_SOURCE_MISSING');
 });
 it('rejects external links and missing immutable references',()=>{
  for(const target of ['bytecode','deployedBytecode']){const changed=structuredClone(build);changed.output.contracts[artifact.sourceName][artifact.contractName].evm[target].linkReferences={dependency:{library:[{start:0,length:20}]}};reject(()=>prepare(manifest,observation,changed),'CANDIDATE_UNRESOLVED_LIBRARY');}
  const changed=structuredClone(build);changed.output.contracts[artifact.sourceName][artifact.contractName].evm.deployedBytecode.immutableReferences={};reject(()=>prepare(manifest,observation,changed),'CANDIDATE_IMMUTABLE_REFERENCES_MISSING');
 });
 it('rejects a runtime over the EIP170 contract size limit',()=>{
  const changed=structuredClone(build),runtime='00'.repeat(24577);changed.output.contracts[artifact.sourceName][artifact.contractName].evm.deployedBytecode.object=runtime;reject(()=>prepare(manifest,observation,changed,{...artifact,deployedBytecode:'0x'+runtime}),'CANDIDATE_RUNTIME_SIZE_EXCEEDED');
 });
 it('retains local development but blocks the legacy Arc path before any signer, RPC or file operation',async()=>{
  assertLegacyDeploymentAllowed('hardhat');assertLegacyDeploymentAllowed('localhost');reject(()=>assertLegacyDeploymentAllowed('arcTestnet'),'LEGACY_ARC_DEPLOYMENT_DISABLED_USE_PREPARE');
  const script=fs.readFileSync(path.resolve(__dirname,'../scripts/deploy.ts'),'utf8');
  async function execute(text:string){let signerCalls=0,fileCalls=0;const processStub={exitCode:0},sandbox={exports:{},process:processStub,console:{log:()=>{},error:()=>{}},__dirname:path.resolve(__dirname,'../scripts'),require:(name:string)=>{
   if(name==='hardhat')return{network:{name:'arcTestnet'},ethers:{getSigners:()=>{signerCalls++;return Promise.reject(new Error('negative-control-no-real-signer'));}}};if(name==='./candidatePreparation')return{assertLegacyDeploymentAllowed};if(name==='fs')return new Proxy({},{get:()=>()=>{fileCalls++;throw Error('unexpected file operation');}});if(name==='path')return path;throw Error('unexpected module');
  }};vm.runInNewContext(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);await new Promise(resolve=>setImmediate(resolve));return{signerCalls,fileCalls,exitCode:processStub.exitCode};}
  const fixed=await execute(script);expect(fixed).to.deep.equal({signerCalls:0,fileCalls:0,exitCode:1});
  const deliberatelyBroken=await execute(script.replace('assertLegacyDeploymentAllowed(network.name);',''));expect(deliberatelyBroken.signerCalls).to.equal(1);expect(deliberatelyBroken.fileCalls).to.equal(0);
 });
});
