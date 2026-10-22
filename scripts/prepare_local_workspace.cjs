const path=require('node:path');
async function main(){
 if(process.argv.length!==2||process.env.GROUPDEAL_LOCAL_DEVELOPMENT!=='1'||process.env.NODE_ENV==='production'||process.env.GROUPDEAL_RECOVERY_MODE!==undefined)throw Error('LOCAL_PREPARATION_SCOPE_REQUIRED');
 const root=path.resolve(__dirname,'..');
 const {validateRuntimeSecurity}=require(path.join(root,'backend/dist/services/runtimeSecurity'));
 const {validateManifestAndEnvironment}=require(path.join(root,'backend/dist/services/manifestValidator'));
 const {admitLocalDevelopmentStore,store}=require(path.join(root,'backend/dist/db/store'));
 const {IndexerProjection}=require(path.join(root,'backend/dist/services/indexerService'));
 const {ArcReadProvider}=require(path.join(root,'backend/dist/services/arcReadProvider'));
 const {config}=require(path.join(root,'backend/dist/config'));
 validateRuntimeSecurity();await validateManifestAndEnvironment();admitLocalDevelopmentStore();
 const projection=new IndexerProjection(store,false),provider=new ArcReadProvider();projection.setProvider(provider);
 try{
  const head=await provider.getBlockNumber();let last=store.readFinancialProjectionState().graph.syncState.lastIndexedBlock||config.deploymentBlock-1;
  console.log(JSON.stringify({stage:'LOCAL_CHAIN_PREPARATION',from:last+1,to:head}));let printed=last;
  while(last<head){
   const target=Math.min(last+5000,head);
   for(let attempt=0;;attempt++)try{await projection.syncThroughBlock(target,{rangeSize:5000});break;}catch(error){
    if(!(error instanceof Error)||error.message!=='Arc read RPC unavailable or wrong network'||attempt>=11)throw error;
    console.warn('LOCAL_CHAIN_READ_RETRY: retaining the last verified checkpoint');
    await new Promise(resolve=>setTimeout(resolve,Math.min(30000,1000*2**attempt)));
   }
   last=store.readFinancialProjectionState().graph.syncState.lastIndexedBlock;
   if(last<target)throw Error('LOCAL_VERIFIED_CHECKPOINT_REQUIRED');
   if(last-printed>=100000||last===head){console.log(JSON.stringify({stage:'LOCAL_CHAIN_PROGRESS',block:last,end:head}));printed=last;}
  }
  console.log('LOCAL_CHAIN_PREPARATION_PASS');
 }finally{projection.stop();store.close();}
}
main().catch(()=>{console.error('LOCAL_CHAIN_PREPARATION_FAILED: API remains closed; verified checkpoints are retained');process.exitCode=1;});
