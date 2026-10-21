import {authRouter} from '../src/routes/authRoutes';
/** Owned isolated product/API fixture; never imported by the runtime application. */
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import {store} from '../src/db/store';
import {config} from '../src/config';
import {supportRouter} from '../src/routes/supportRoutes';
import {notificationRouter} from '../src/routes/notificationRoutes';
import {authMiddleware,AuthenticatedRequest} from '../src/middleware/auth';
import {enrollFixtureOperator} from './helpers/operatorFixture';
import {ethers} from 'ethers';
import {randomUUID} from 'node:crypto';
import {OrderThreadService} from '../src/services/orderThreadService';
import {SessionService} from '../src/services/sessionService';
async function main(){
assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);
for(const [id,roles] of [['support-browser',['buyer']],['support-other',['buyer']],['support-seller',['seller']],['support-operator',['operator']],['support-role-only',['buyer','operator']]] as const)store.db.users[id]={id,email:id+'@fixture.invalid',roles:[...roles],activeWallet:null,createdAt:Date.now()};
store.db.campaigns.supportCampaign={id:'supportCampaign',sellerId:'support-seller',projectionOrigin:'VERIFIED_PUBLISH',status:'FINALIZED'} as any;
store.db.orders.supportOrder={id:'supportOrder',campaignId:'supportCampaign',buyerAccountId:'support-browser',deliveryStatus:'CONFIRMED',committedGross:'100',sellerAllocated:'80',buyerRefundAllocated:'20',buyerClaimedAmount:'0',sellerClaimedAmount:'0',deliveredEntitlementEncrypted:'existing-support-fixture-financial-sentinel'} as any;
store.db.supportMessages.supportOrder=[{id:'legacy-support-fixture',orderId:'supportOrder',senderRole:'buyer',senderWallet:'fixture-wallet-not-shown',text:'Earlier order support fixture',timestamp:Date.now()}];store.save();
const controller=await enrollFixtureOperator('support-operator',undefined,{chainId:5042002}),alternate=ethers.Wallet.createRandom().address;
const financial=JSON.stringify(store.db.orders),app=express();app.use('/api/support',supportRouter);app.use(express.json({limit:'1kb'}));app.use('/api/admin-auth',authRouter);app.use('/api/notifications',notificationRouter);
app.get('/api/auth/me',authMiddleware,(req:AuthenticatedRequest,res)=>{const u=store.db.users[req.user!.userId];res.json({user:{id:u.id,email:null,roles:u.roles,loginMethod:'EVM_WALLET',activeWallet:u.activeWallet}});});
app.get('/api/orders/:id/messages',authMiddleware,(req:AuthenticatedRequest,res)=>{try{res.json({messages:OrderThreadService.list(req.sessionProof,req.params.id)});}catch{res.sendStatus(403);}});
app.get('/__support_session',(req,res)=>{if(req.get('X-Local-Fixture')!=='support-browser'||!['support-browser','support-other','support-seller','support-operator','support-role-only'].includes(String(req.query.user))||req.query.realm!==undefined&&req.query.realm!=='ADMIN'){res.sendStatus(403);return;}res.setHeader('Cache-Control','no-store');res.json({token:req.query.realm==='ADMIN'?SessionService.issue(store.db.users[String(req.query.user)],undefined,'ADMIN'):jwt.sign({userId:req.query.user,jti:randomUUID()},config.jwtSecret,{expiresIn:'10m'})});});
app.get('/__support_observation',(req,res)=>{if(req.get('X-Local-Fixture')!=='support-browser'){res.sendStatus(403);return;}res.json({isolated:true,financialUnchanged:financial===JSON.stringify(store.db.orders),tickets:Object.keys(store.db.supportTickets).length,commands:Object.keys(store.db.supportCommands).length});});
app.post('/__support_authority',(req,res)=>{if(req.get('X-Local-Fixture')!=='support-browser'||!['ready','unavailable','walletChanged'].includes(String(req.query.mode))){res.sendStatus(403);return;}controller.truth.unavailable=req.query.mode==='unavailable';const wallet=req.query.mode==='walletChanged'?alternate:controller.wallet.address;store.transaction(()=>{const u=store.db.users['support-operator'];if(u.activeWallet)delete store.db.userByWallet[u.activeWallet.toLowerCase()];u.activeWallet=wallet;store.db.userByWallet[wallet.toLowerCase()]=u.id;});res.json({isolated:true});});
const server=app.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({localFixture:true,isolated:true,pid:process.pid,port:(server.address() as any).port})));
const stop=()=>server.close(()=>{assert.equal(JSON.stringify(store.db.orders),financial);store.close();process.exit(0);});process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
main().catch(()=>{console.error('Support fixture setup failed');store.close();process.exitCode=1;});
