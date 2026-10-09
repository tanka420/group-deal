/** Owned loopback browser fixture. Never imported by the application or a live indexer. */
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import {ethers} from 'ethers';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {publicRouter} from '../src/routes/publicRoutes';
import {campaignRouter} from '../src/routes/campaignRoutes';
import {followRouter} from '../src/routes/followRoutes';
import {authMiddleware} from '../src/middleware/auth';
import {reviewedProductVerified} from './fixtures/product';
import {CampaignEditorService} from '../src/services/campaignEditorService';
import {ProductService} from '../src/services/productService';
import {accessiblePublicCampaign,publicWidgetDto} from '../src/services/publicCampaign';
async function main(){
assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);
config.publicAppUrl='https://deals.example.test';
const product=await reviewedProductVerified('seller',ethers.Wallet.createRandom().address);
const campaign=CampaignEditorService.saveDraft('seller',{title:'Public widget · LOCAL FIXTURE',description:'Browser verification only',thumbnailUrl:product.version.thumbnailUrl,productVersionId:product.version.id,metric:'BUYER_COUNT',tiers:[{threshold:1,priceUSDC:'105'},{threshold:10,priceUSDC:'89'}],maxPerAccount:3,inventoryLimit:100,durationDays:7,deliverySlaHours:24,deliveryMethod:'FILE_LINK'});
Object.assign(campaign,{status:'ACTIVE',visibility:'PUBLIC',projectionOrigin:'VERIFIED_PUBLISH',chainId:config.arcChainId,hubAddress:config.hubAddress,onchainCampaignId:1,endTime:Math.floor(Date.now()/1000)+1000,productSnapshot:ProductService.snapshot('seller',product.version.id,Math.floor(Date.now()/1000)+8*86400)});
store.save();const original=structuredClone(campaign),app=express();app.use(express.json({limit:'1kb'}));
store.db.users['follow-browser']={id:'follow-browser',email:'follow-browser@fixture.invalid',roles:['buyer'],activeWallet:null,createdAt:Date.now()};store.save();
app.get('/__follow_session',(req,res)=>{if(req.get('X-Local-Fixture')!=='widget-browser'){res.sendStatus(403);return;}res.setHeader('Cache-Control','no-store');res.json({token:jwt.sign({userId:'follow-browser'},config.jwtSecret,{expiresIn:'5m'}),userId:'follow-browser'});});
app.get('/api/auth/me',authMiddleware,(_req,res)=>res.json({user:{id:'follow-browser',email:null,roles:['buyer'],loginMethod:'EVM_WALLET',activeWallet:null}}));
app.use('/api/follows',followRouter);
app.post('/__local_fixture', (req,res)=>{
 if(req.get('X-Local-Fixture')!=='widget-browser'){res.sendStatus(403);return;}
 const mode=req.body?.mode;
 if(!['ACTIVE','FINAL','PRIVATE','UNLISTED','XSS','BROKEN','HUGE','HELD','ARCHIVED','MIXED','NO_ORIGIN','NOT_STARTED','SOLD_OUT','SHORT_RIGHTS'].includes(mode)){res.sendStatus(400);return;}
 const campaign=store.db.campaigns[original.id];Object.keys(campaign).forEach(key=>{if(!(key in original))delete (campaign as any)[key];});Object.assign(campaign,structuredClone(original));
 config.publicAppUrl=mode==='NO_ORIGIN'?'':'https://deals.example.test';store.db.products[product.product.id].status=mode==='ARCHIVED'?'ARCHIVED':'DRAFT';
 store.db.rights[product.rights.id].validUntil=mode==='SHORT_RIGHTS'?Math.floor(Date.now()/1000)+60:Math.floor(Date.now()/1000)+60*86400;
 if(mode==='NOT_STARTED')campaign.startTime=Math.floor(Date.now()/1000)+60;
 if(mode==='SOLD_OUT')campaign.totalUnitsCommitted=campaign.inventoryLimit;
 if(mode==='FINAL')Object.assign(campaign,{status:'FINALIZED',finalizedAt:Math.floor(Date.now()/1000),finalClearingPrice:'89000000'});
 if(mode==='PRIVATE'||mode==='UNLISTED')campaign.visibility=mode;
 if(mode==='XSS')campaign.title='<img src=x onerror=alert(1)> </script><script>alert(2)</script>';
 if(mode==='BROKEN')Object.assign(campaign,{status:'FINALIZED',finalClearingPrice:undefined});
 if(mode==='HUGE')campaign.tiers[0].price='900719925474099312345678';
 if(mode==='HELD')campaign.termsPolicyReviewRequired=true;
 if(mode==='MIXED')campaign.chainId=config.arcChainId+1;
 store.save();res.json({localFixture:true});
});
const htmlRuntime=process.env.GROUPDEAL_BROWSER_MODE==='preview'?'COMPILED_BACKEND':'TSX_BACKEND';
if(htmlRuntime==='COMPILED_BACKEND'){
 // The built preview also exercises the emitted renderer and its shared-asset path.
 // Projection/fixtures stay isolated; this does not start the deployed application.
 const {renderPublicWidget,setWidgetHeaders,renderUnavailableWidget}=require('../dist/services/publicWidgetHtml.js');
 app.get('/api/v1/campaigns/:id/widget',(req,res)=>{const nonce=setWidgetHeaders(res),language=req.query.lang==='en'?'en':'vi';try{const c=accessiblePublicCampaign(req.params.id);if(!c){res.status(404).type('html').send(renderUnavailableWidget(language));return;}res.type('html').send(renderPublicWidget(publicWidgetDto(c),language,nonce));}catch{res.status(503).type('html').send(renderUnavailableWidget(language));}});
}
app.use('/api/v1',publicRouter);
app.use('/api/campaigns',campaignRouter);
const parentApp=express();
parentApp.get('/__widget_parent',(_req,res)=>{const base='http://127.0.0.1:'+(server.address() as any).port;res.setHeader('Cache-Control','no-store');res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local widget parent</title></head><body><iframe title="Public widget" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" src="'+base+'/api/v1/campaigns/'+campaign.id+'/widget?lang=en"></iframe></body></html>');});
let parentServer:ReturnType<typeof app.listen>;
const server=app.listen(0,'127.0.0.1',()=>{parentServer=parentApp.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({localFixture:true,port:(server.address() as any).port,parentPort:(parentServer.address() as any).port,pid:process.pid,id:campaign.id,isolated:store.isIsolated,htmlRuntime})));});
const stop=()=>server.close(()=>parentServer.close(()=>{store.close();process.exit(0);}));process.once('SIGTERM',stop);process.once('SIGINT',stop);

process.on("message",message=>{if(message==="STOP_LOCAL_FIXTURE")stop();});
}
void main().catch(()=>{try{store.close();}catch{}console.error("WIDGET_FIXTURE_BOOTSTRAP_FAILED");process.exitCode=1;});
