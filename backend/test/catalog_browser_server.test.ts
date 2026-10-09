/** Owns an isolated loopback listener; never starts the live application/indexer. */
import assert from 'node:assert/strict';
import express from 'express';
import {seedCatalog} from './fixtures/catalog';
assert.equal(process.env.NODE_ENV,'test');
const runtime=process.env.GROUPDEAL_BROWSER_MODE==='preview'?'COMPILED_BACKEND':'TSX_BACKEND',base=runtime==='COMPILED_BACKEND'?'../dist':'../src';
const {store}=require(base+'/db/store'),{config}=require(base+'/config'),{CampaignEditorService}=require(base+'/services/campaignEditorService'),{ProductService}=require(base+'/services/productService'),{publicRouter}=require(base+'/routes/publicRoutes');
async function main(){
assert.ok(store.isIsolated);config.arcChainId=5042002;config.hubAddress='0x1111111111111111111111111111111111111111';config.publicAppUrl='https://deals.example.test';
const fixture=await seedCatalog({store,config,CampaignEditorService,ProductService,runtime:runtime==='COMPILED_BACKEND'?'EMITTED':'SOURCE'}),app=express();app.use(express.json({limit:'1kb'}));
app.post('/__catalog_fixture',(req,res)=>{if(req.get('X-Local-Fixture')!=='catalog-browser'){res.sendStatus(403);return;}const mode=req.body?.mode;if(!['RESET','PRIVATE','BROKEN','ARCHIVED'].includes(mode)){res.sendStatus(400);return;}store.db.campaigns=structuredClone(fixture.original);store.db.products[fixture.productId].status=mode==='ARCHIVED'?'ARCHIVED':'DRAFT';if(mode==='PRIVATE')for(const c of Object.values(store.db.campaigns) as any[])c.visibility='PRIVATE';if(mode==='BROKEN')store.db.campaigns.catalog_00.finalClearingPrice=undefined;store.save();res.json({localFixture:true});});
app.use('/api/v1',publicRouter);
const server=app.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({localFixture:true,port:(server.address() as any).port,pid:process.pid,isolated:store.isIsolated,runtime})));
const stop=()=>server.close(()=>{store.close();process.exit(0);});process.once('SIGTERM',stop);process.once('SIGINT',stop);

process.on("message",message=>{if(message==="STOP_LOCAL_FIXTURE")stop();});
}
void main().catch(()=>{try{store.close();}catch{}console.error("CATALOG_FIXTURE_BOOTSTRAP_FAILED");process.exitCode=1;});
