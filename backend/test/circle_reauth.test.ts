import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {store} from '../src/db/store';
import {AuthService} from '../src/services/authService';
import {SessionService} from '../src/services/sessionService';
import {CircleWalletService} from '../src/services/circleWalletService';

assert.equal(process.env.NODE_ENV,'test');assert.ok(store.isIsolated);
const client=CircleWalletService as unknown as {client:any},original=client.client,base=store.snapshot();
const wallet={walletId:'fixture-reauth-wallet',address:'0x1111111111111111111111111111111111111111',blockchain:'ARC-TESTNET'};
async function fixture(){
 store.replace(structuredClone(base));let status=()=>({data:{id:'fixture-circle-owner',status:'ENABLED'}});
 client.client={createDeviceTokenForEmailLogin:async()=>({data:{deviceToken:'fixture-device',deviceEncryptionKey:'fixture-key',otpToken:'fixture-otp'}}),getUserStatus:async()=>status()};
 const session=AuthService.createCircleSession('reauth@example.test','fixture-circle-owner',wallet),proof=SessionService.authenticate(session.token),attempt=await CircleWalletService.requestEmailOtp('reauth@example.test',crypto.randomUUID()),token=jwt.sign({sub:'fixture-circle-owner'},'fixture-provider-key');
 return{session,proof,attempt,token,set status(fn:typeof status){status=fn;}};
}
void(async()=>{
 {const f=await fixture(),before=structuredClone(store.db.users[f.proof.account.id]),sessions=structuredClone(store.db.authSessions);const ack=await CircleWalletService.reauthenticate(f.token,f.attempt.loginAttemptId,f.proof);assert.deepEqual(ack,{userId:f.proof.account.id,walletId:wallet.walletId,address:wallet.address});assert.deepEqual(store.db.users[f.proof.account.id],before);assert.deepEqual(store.db.authSessions,sessions);assert.equal(SessionService.authenticate(f.session.token).account.id,f.proof.account.id);assert.ok(store.db.circleLoginAttempts[f.attempt.loginAttemptId].consumedAt);await assert.rejects(CircleWalletService.reauthenticate(f.token,f.attempt.loginAttemptId,f.proof));console.log('PASS bound reauthentication consumes OTP once without replacing APP session, wallet or account');}
 {const f=await fixture();f.status=()=>({data:{id:'foreign-circle-owner',status:'ENABLED'}});await assert.rejects(CircleWalletService.reauthenticate(f.token,f.attempt.loginAttemptId,f.proof),/CIRCLE_WALLET_NOT_BOUND|Circle session is not bound/);assert.equal(store.db.circleLoginAttempts[f.attempt.loginAttemptId].consumedAt,undefined);console.log('PASS foreign Circle credentials cannot replace the bound signing identity');}
 {const f=await fixture();f.status=()=>{store.transaction(()=>{store.db.users[f.proof.account.id].activeWallet='0x2222222222222222222222222222222222222222';});return{data:{id:'fixture-circle-owner',status:'ENABLED'}};};await assert.rejects(CircleWalletService.reauthenticate(f.token,f.attempt.loginAttemptId,f.proof));console.log('PASS wallet changes across provider awaits fence reauthentication');}
 {const f=await fixture();await assert.rejects(CircleWalletService.reauthenticate(f.token,f.attempt.loginAttemptId,{...f.proof,record:{...f.proof.record,realm:'ADMIN'}}));console.log('PASS admin realm cannot refresh APP Circle signing credentials');}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{client.client=original;store.close();});
