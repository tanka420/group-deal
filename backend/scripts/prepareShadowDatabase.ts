import {config} from '../src/config';
import {validateRuntimeSecurity} from '../src/services/runtimeSecurity';
import {prepareShadowCandidate,ShadowPreparationError} from '../src/services/shadowPreparation';

/** New private candidate and complete legacy retention only; no promotion, seed or source override. */
async function main(){
 const args=process.argv.slice(2),migrationOnly=args.includes('--migration-only'),retainLegacy=args.includes('--retain-legacy'),block=args.find(a=>a.startsWith('--to-block=')),resume=args.find(a=>a.startsWith('--resume='));
 if(new Set(args).size!==args.length||args.filter(a=>a.startsWith('--to-block=')).length>1||args.filter(a=>a.startsWith('--resume=')).length>1||args.some(a=>a!=='--migration-only'&&a!=='--retain-legacy'&&!/^--to-block=[1-9]\d*$/.test(a)&&!/^--resume=.{1,4096}$/.test(a))||migrationOnly&&(retainLegacy||block||resume))throw new ShadowPreparationError('SHADOW_ARGUMENTS_INVALID');
 if(config.arcChainId!==5042002)throw new ShadowPreparationError('SHADOW_ARC_REQUIRED');
 validateRuntimeSecurity();
 let lastPrinted=0;
 const result=await prepareShadowCandidate({inputScope:'EXISTING_DATA',migrationOnly,retainLegacy,toBlock:block?Number(block.slice('--to-block='.length)):undefined,resumeDirectory:resume?.slice('--resume='.length),onProgress:(current,end)=>{if(current===end||Date.now()-lastPrinted>=15000){lastPrinted=Date.now();console.log(JSON.stringify({event:'SHADOW_REPLAY_PROGRESS',block:current,targetBlock:end,promoted:false}));}}});
 console.log(JSON.stringify({path:result.path,sha256:result.sha256,byteLength:result.byteLength,status:result.status,promoted:false,rolloutAllowed:false,acceptanceEligible:false}));
 if(result.status==='REJECTED')process.exitCode=1;
}
void main().catch(error=>{console.error(JSON.stringify({status:'REJECTED',code:error instanceof ShadowPreparationError?error.code:'SHADOW_PREPARATION_STARTUP_REJECTED',promoted:false}));process.exitCode=1;});
