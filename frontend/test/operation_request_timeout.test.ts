import assert from 'node:assert/strict';
import http from 'node:http';
import {operationRequest,OperationRequestFailure} from '../src/services/transactionOperations';
const path='/api/transactions/op_3080356a-215a-4713-9ea2-76314558d968/ready';
const originalFetch=globalThis.fetch,originalTimeout=AbortSignal.timeout;
let passed=0,stage='';
async function check(name:string,run:()=>Promise<void>){stage=name;await run();passed++;console.log('PASS '+name);}
async function slow(){
 let requests=0,timer:ReturnType<typeof setTimeout>|undefined;
 const server=http.createServer((req,res)=>{requests++;assert.equal(req.url,path);assert.equal(req.method,'POST');timer=setTimeout(()=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({operation:{id:path.split('/')[3],phase:'AWAITING_SIGNATURE'}}));},12000);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 globalThis.fetch=((url,init)=>originalFetch('http://127.0.0.1:'+address.port+url,init)) as typeof fetch;
 const start=Date.now();try{const result=await operationRequest<{operation:{phase:string}}>('fixture-token',path,{});assert.equal(result.operation.phase,'AWAITING_SIGNATURE');assert.ok(Date.now()-start>=11500);assert.equal(requests,1);console.log(JSON.stringify({elapsedMs:Date.now()-start,requests}));}finally{globalThis.fetch=originalFetch;if(timer)clearTimeout(timer);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
async function main(){
 if(process.argv.includes('--slow')){await check('real loopback readiness response after12s is awaited once',slow);return;}
 let deadlines:number[]=[],calls:{url:string;init?:RequestInit}[]=[];
 AbortSignal.timeout=(ms:number)=>{deadlines.push(ms);return originalTimeout(ms);};
 const mock=(status=200,body:unknown={ok:true})=>{deadlines=[];calls=[];globalThis.fetch=(async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}) as typeof fetch;};
 await check('only exact POST ready gets45s and preserves payload and headers',async()=>{mock();const body={reviewed:'same-intent'};await operationRequest('fixture-token',path,body,{'X-Fixture':'value'});assert.deepEqual(deadlines,[45000]);assert.equal(calls.length,1);assert.equal(calls[0].init?.method,'POST');assert.deepEqual(JSON.parse(String(calls[0].init?.body)),body);assert.equal((calls[0].init?.headers as Record<string,string>).Authorization,'Bearer fixture-token');assert.equal((calls[0].init?.headers as Record<string,string>)['X-Fixture'],'value');assert.deepEqual(body,{reviewed:'same-intent'});});
 await check('GET readiness keeps normal10s deadline',async()=>{mock();await operationRequest('fixture-token',path);assert.deepEqual(deadlines,[10000]);assert.equal(calls[0].init?.method,'GET');assert.equal(calls[0].init?.body,undefined);});
 await check('other operation writes retain10s and one request',async()=>{for(const suffix of ['recover','submit','replace','expire','observe']){mock();await operationRequest('fixture-token',path.replace('/ready','/'+suffix),{});assert.deepEqual(deadlines,[10000]);assert.equal(calls.length,1);}});
 await check('lookalike or noncanonical ready routes do not inherit extended deadline',async()=>{for(const url of [path+'?x=1',path+'/',path.replace('/api/','/other/'),path.replace('op_3080356a','other_3080356a')]){mock();await operationRequest('fixture-token',url,{});assert.deepEqual(deadlines,[10000]);}});
 await check('missing auth fails without I/O or timer',async()=>{mock();await assert.rejects(operationRequest(null,path,{}));assert.equal(calls.length,0);assert.equal(deadlines.length,0);});
 await check('timeout is propagated once without retry or fallback write',async()=>{mock();globalThis.fetch=(async(url,init)=>{calls.push({url:String(url),init});throw new DOMException('fixture timeout','TimeoutError');}) as typeof fetch;await assert.rejects(operationRequest('fixture-token',path,{}),e=>e instanceof DOMException&&e.name==='TimeoutError');assert.equal(calls.length,1);assert.deepEqual(deadlines,[45000]);});
 await check('server authority denial stays bounded and never retries',async()=>{mock(403,{code:'OPERATION_READINESS_FORBIDDEN',error:'fixture denial'});await assert.rejects(operationRequest('fixture-token',path,{}),e=>e instanceof OperationRequestFailure&&e.status===403&&e.code==='OPERATION_READINESS_FORBIDDEN');assert.equal(calls.length,1);});
}
main().then(()=>console.log(JSON.stringify({result:'OPERATION_REQUEST_TIMEOUT_CHECKS_PASS',passed,financialTransactions:0}))).catch(e=>{console.error(JSON.stringify({result:'FAIL',stage,errorName:e.name,code:e.code??null}));process.exitCode=1;}).finally(()=>{globalThis.fetch=originalFetch;AbortSignal.timeout=originalTimeout;});
