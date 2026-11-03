const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {smtpOptions,checkSmtp,checkCircle,CIRCLE_URL}=require('./check_mainnet_providers.cjs');
const publicConfig=require('../shared/mainnet-public.json');
const password='FIXTURE_'+crypto.randomBytes(24).toString('hex');
const settings={SMTP_HOST:'smtp.fixture.invalid',SMTP_PORT:'587',SMTP_SECURE:'false',SMTP_USER:'fixture@example.invalid',SMTP_FROM:'fixture@example.invalid',SMTP_APP_PASSWORD:password};
const api='LIVE_API_KEY:fixture:'+crypto.randomBytes(24).toString('hex');
test('SMTP verifies TLS/login only; closes transport, never sends and never logs credentials',async()=>{
 let verified=0,closed=0;const r=await checkSmtp(settings,true,options=>{assert.equal(options.requireTLS,true);assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.tls.minVersion,'TLSv1.2');assert.equal(options.logger,false);assert.equal(options.debug,false);return{verify:async()=>{verified++;},close:()=>{closed++;},sendMail:()=>assert.fail('No email is authorized')};});
 assert.equal(r.result,'PASS');assert.equal(verified,1);assert.equal(closed,1);assert.equal(r.emailsSent,0);assert.equal(r.emailDeliveryVerified,false);assert(!JSON.stringify(r).includes(password));
 const tls=smtpOptions({...settings,SMTP_PORT:'465',SMTP_SECURE:'true'});assert.equal(tls.secure,true);
});
test('SMTP rejects bad inputs before connection and redacts server errors',async()=>{
 for(const patch of [{SMTP_HOST:'https://evil.invalid/path'},{SMTP_PORT:'25'},{SMTP_SECURE:'true'},{SMTP_FROM:'a@b.invalid\r\nBcc: x@y.invalid'},{SMTP_APP_PASSWORD:''}])assert.equal((await checkSmtp({...settings,...patch},true,()=>assert.fail('Must reject before connection'))).result,'FAIL');
 const r=await checkSmtp(settings,true,()=>({verify:async()=>{throw{code:'EAUTH',message:password,response:password};},close:()=>{}}));assert.equal(r.code,'SMTP_AUTHENTICATION_FAILED');assert(!JSON.stringify(r).includes(password));
 assert.equal((await checkSmtp(settings,false,()=>assert.fail('Local check must not connect'))).networkCalls,0);
});
test('Circle uses one fixed GET with redirect rejection and verifies the expected public App ID',async()=>{
 const r=await checkCircle(api,async(url,options)=>{assert.equal(url,CIRCLE_URL);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer '+api);return new Response(JSON.stringify({data:{appId:publicConfig.circleAppId}}),{status:200});});
 assert.equal(r.result,'PASS');assert.equal(r.circleAppIdMatches,true);assert.equal(r.otpVerified,false);assert.equal(r.transactionsSubmitted,0);assert(!JSON.stringify(r).includes(api));
});
test('Circle rejects test/partial keys and redacts 401, wrong app, transport and malformed responses',async()=>{
 for(const key of ['TEST_API_KEY:x:y','partial',api+'\r\n'])assert.equal((await checkCircle(key,()=>assert.fail('Must reject before request'))).networkCalls,0);
 assert.equal((await checkCircle(api,async()=>new Response(api,{status:401}))).code,'CIRCLE_AUTHENTICATION_FAILED');
 assert.equal((await checkCircle(api,async()=>new Response(JSON.stringify({data:{appId:'11111111-1111-1111-1111-111111111111'}})))).code,'CIRCLE_APP_ID_MISMATCH');
 for(const fake of [async()=>{throw Error(api);},async()=>new Response(api)]){const r=await checkCircle(api,fake);assert.equal(r.result,'FAIL');assert(!JSON.stringify(r).includes(api));}
});
