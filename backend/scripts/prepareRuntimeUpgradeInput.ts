import {config} from '../src/config';
import {validateRuntimeSecurity} from '../src/services/runtimeSecurity';
import {prepareRuntimeUpgradeInput} from '../src/services/runtimeUpgradePreparation';
import {RuntimeUpgradeError} from '../src/domain/runtimeUpgrade';
async function main(){if(process.argv.length!==2||process.env.GROUPDEAL_RECOVERY_MODE!=='1'||config.arcChainId!==5042002)throw new RuntimeUpgradeError('RUNTIME_UPGRADE_ARGUMENT_OR_SCOPE_INVALID');validateRuntimeSecurity();const r=await prepareRuntimeUpgradeInput({inputScope:'EXISTING_DATA'});console.log(JSON.stringify({path:r.path,sha256:r.sha256,byteLength:r.byteLength,status:r.status,failureCode:r.report.failureCode,applicationBootEligible:r.report.applicationBootEligible??false,accountOrFinancialAuthorityAssigned:false,heldWorkReleaseAllowed:false,acceptanceEligible:false}));if(r.status==='REJECTED')process.exitCode=1;}
void main().catch(error=>{console.error(JSON.stringify({status:'REJECTED',code:error instanceof RuntimeUpgradeError?error.code:'RUNTIME_UPGRADE_STARTUP_REJECTED',acceptanceEligible:false}));process.exitCode=1;});
