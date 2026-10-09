import {artifacts,network} from 'hardhat';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {prepareCandidate,sha256,PreparationError} from './candidatePreparation';

async function main(){
 if(network.name!=='hardhat')throw new PreparationError('PREPARATION_REQUIRES_OFFLINE_HARDHAT');
 const root=path.resolve(__dirname,'../..'),contracts=path.join(root,'contracts'),requireFromContracts=createRequire(path.join(contracts,'package.json'));
 const read=(name:string)=>fs.readFileSync(path.join(root,name)),parse=(name:string)=>JSON.parse(read(name).toString());
 const toolNames=['contracts/scripts/prepareArcCandidate.ts','contracts/scripts/candidatePreparation.ts','contracts/scripts/deploy.ts','contracts/hardhat.config.ts','contracts/package-lock.json','scripts/prepare_arc_candidate.cjs','scripts/local_check_runtime.cjs','scripts/local_network_guard.cjs'];
 const toolInputs=toolNames.map(name=>({path:name,sha256:sha256(read(name))}));
 const manifestBytes=read('shared/manifests/arc-testnet.json'),pointer=parse('reports/evidence/ARC_DEPLOYMENT_LATEST.json');
 if(!/^reports\/evidence\/ops-deployment\/[a-zA-Z0-9-]+\.json$/.test(pointer.path)||pointer.status!=='PASS'||pointer.acceptanceEligible!==false)throw new PreparationError('DEPLOYMENT_REFERENCE_INVALID');
 const observationBytes=read(pointer.path);if(sha256(observationBytes)!==pointer.sha256||observationBytes.length!==pointer.byteLength)throw new PreparationError('DEPLOYMENT_REFERENCE_CHANGED');
 const observation=JSON.parse(observationBytes.toString());if(observation.manifestSha256!==sha256(manifestBytes)||!observation.toolInputs?.length||observation.toolInputs.some((f:{path:string,sha256:string})=>sha256(read(f.path))!==f.sha256))throw new PreparationError('DEPLOYMENT_OBSERVATION_SOURCE_CHANGED');
 const artifact=await artifacts.readArtifact('contracts/GroupDealHubV2.sol:GroupDealHubV2'),build=await artifacts.getBuildInfo('contracts/GroupDealHubV2.sol:GroupDealHubV2');
 const readSource=(name:string)=>{
  if(name.startsWith('contracts/')&&!name.includes('..')&&!path.isAbsolute(name))return fs.readFileSync(path.join(contracts,name),'utf8');
  if(name.startsWith('@openzeppelin/contracts/')&&!name.includes('..'))return fs.readFileSync(requireFromContracts.resolve(name),'utf8');
  throw new PreparationError('CANDIDATE_SOURCE_PATH_UNSUPPORTED');
 };
 const candidate=prepareCandidate(JSON.parse(manifestBytes.toString()),observation,build,artifact,readSource);
 if(!read('shared/manifests/arc-testnet.json').equals(manifestBytes)||!read(pointer.path).equals(observationBytes)||toolInputs.some(f=>sha256(read(f.path))!==f.sha256)||candidate.compiler.sources.some(f=>sha256(readSource(f.path))!==f.sha256))throw new PreparationError('PREPARATION_INPUT_CHANGED');
 const directory=path.join(root,'reports/evidence/candidate-preparation'),id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID(),record={schemaVersion:1,preparedAt:new Date().toISOString(),layer:'OFFLINE_UNSIGNED_DEPLOYMENT_PREPARATION',status:'PREPARED',acceptanceEligible:false,candidateFrozen:false,manifestSha256:sha256(manifestBytes),deploymentReference:pointer,toolInputs,...candidate};
 const value=Buffer.from(JSON.stringify(record,null,2)+'\n');fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,id+'.json'),fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,value);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const reference={schemaVersion:1,path:path.relative(root,file).replaceAll(path.sep,'/'),sha256:sha256(value),byteLength:value.length,status:'PREPARED',acceptanceEligible:false,broadcastReady:false},latest=path.join(root,'reports/evidence/ARC_CANDIDATE_PREPARATION_LATEST.json'),temporary=latest+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(reference,null,2)+'\n',{flag:'wx'});fs.renameSync(temporary,latest);
 console.log(JSON.stringify(reference));
}
void main().catch(error=>{console.error(error instanceof PreparationError?error.code:'CANDIDATE_PREPARATION_UNCONFIRMED');process.exitCode=1;});
