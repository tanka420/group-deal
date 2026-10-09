import {config} from '../src/config';
import {validateRuntimeSecurity} from '../src/services/runtimeSecurity';
import {prepareRecoveryApplication,RecoveryApplicationError} from '../src/services/recoveryApplication';

async function main(){if(process.argv.length!==2)throw new RecoveryApplicationError('RECOVERY_APPLICATION_ARGUMENTS_INVALID');if(config.arcChainId!==5042002)throw new RecoveryApplicationError('RECOVERY_APPLICATION_ARC_REQUIRED');validateRuntimeSecurity();const result=await prepareRecoveryApplication({inputScope:'EXISTING_DATA'});console.log(JSON.stringify({path:result.path,sha256:result.sha256,byteLength:result.byteLength,status:result.status,failureCode:result.report.failureCode,applicationBootEligible:result.report.applicationBootEligible,promoted:false,acceptanceEligible:false}));if(result.status==='REJECTED')process.exitCode=1;}
void main().catch(error=>{console.error(JSON.stringify({status:'REJECTED',code:error instanceof RecoveryApplicationError?error.code:'RECOVERY_APPLICATION_STARTUP_REJECTED',promoted:false}));process.exitCode=1;});
