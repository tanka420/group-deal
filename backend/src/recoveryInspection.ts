import {ARC_CHAIN_ID} from '../../shared/network.mjs';
import {config} from './config';
import {validateRuntimeSecurity} from './services/runtimeSecurity';
import {prepareRecoveryInspection,startRecoveryInspection,RecoveryInspectionError} from './services/recoveryInspection';

async function main(){
 if(process.argv.length!==2)throw new RecoveryInspectionError('RECOVERY_ARGUMENTS_DISABLED');
 if(config.arcChainId!==ARC_CHAIN_ID)throw new RecoveryInspectionError('RECOVERY_ARC_REQUIRED');
 validateRuntimeSecurity();
 const portText=process.env.RECOVERY_INSPECTION_PORT||'4198';
 if(!/^[1-9]\d{0,4}$/.test(portText)||Number(portText)>65535)throw new RecoveryInspectionError('RECOVERY_PORT_INVALID');
 const prepared=prepareRecoveryInspection({inputScope:'EXISTING_DATA'}),runtime=await startRecoveryInspection(prepared,Number(portText));
 let stopping=false;const timer=setTimeout(()=>{void stop();},300000);
 async function stop(){if(stopping)return;stopping=true;clearTimeout(timer);try{await runtime.close();}catch{process.exitCode=1;}finally{if(process.connected)process.disconnect();}}
 process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
 process.on('message',message=>{if(message==='RECOVERY_INSPECTION_STOP')void stop();});
 const ready={event:'RECOVERY_INSPECTION_READY',url:runtime.url,metadata:prepared.metadata,proofReference:prepared.proofReference};
 if(process.send)process.send(ready);else console.log(JSON.stringify(ready));
}
void main().catch(error=>{console.error(JSON.stringify({event:'RECOVERY_INSPECTION_REJECTED',code:error instanceof RecoveryInspectionError?error.code:'RECOVERY_INSPECTION_PREPARATION_FAILED',productAccessEnabled:false}));process.exitCode=1;});
