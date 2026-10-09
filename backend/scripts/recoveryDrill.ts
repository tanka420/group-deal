import path from 'node:path';
import {runRecoveryDrill} from '../src/services/recoveryDrillService';
import {validateRuntimeSecurity} from '../src/services/runtimeSecurity';
import {config} from '../src/config';

async function main(){
 const args=process.argv.slice(2);if(args.length)throw Error('Recovery drill currently uses existing backend/data; no reset, promotion, source override or seed options.');
 if(process.env.GROUPDEAL_RECOVERY_MODE!==undefined)throw Error('Original-store drill is disabled in recovery mode; use backup:runtime for the selected live store.');
 if(config.arcChainId!==5042002)throw Error('Existing-data recovery requires the configured Arc Testnet runtime; development defaults are refused.');
 validateRuntimeSecurity();
 const result=await runRecoveryDrill({sourceDirectory:path.resolve(__dirname,'../data'),inputScope:'EXISTING_DATA'});
 console.log(JSON.stringify({status:result.status,path:result.path,sha256:result.sha256,byteLength:result.byteLength,promoted:false,acceptanceEligible:false}));
 if(!['RESTORE_DATA_AND_PRIVATE_VERIFIED','RESTORE_DATA_VERIFIED_NO_PRIVATE_RESOURCE'].includes(result.status))process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('Recovery drill could not start; inspect source/keyring/private-directory policy privately. No original data was opened for writing.');process.exitCode=1;});
