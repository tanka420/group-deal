import assert from 'node:assert/strict';
import dns from 'node:dns';
import {EventEmitter} from 'node:events';
import {postWebhookReview} from '../src/services/webhookTransport';
const https=require('node:https'),originalRequest=https.request,originalLookup=dns.promises.lookup;
let count=0;
async function main(){try{
 for(const scenario of ['valid','redirect','oversized','invalid-json','extra-field','encoding','wrong-type','truncated'] as const){
  let requests=0,lookups=0;(dns.promises as any).lookup=async()=>{lookups++;return [{address:'8.8.8.8',family:4}];};
  https.request=(url:any,options:any,callback:any)=>{
   requests++;assert.equal(url.hostname,'public.example.test');assert.equal(options.agent,false);assert.equal(options.method,'POST');assert.equal(options.headers['Content-Length'],'7');
   (dns.promises as any).lookup=async()=>[{address:'127.0.0.1',family:4}];options.lookup(url.hostname,{all:true},(e:any,a:any)=>{assert.equal(e,null);assert.deepEqual(a,[{address:'8.8.8.8',family:4}]);});
   const request:any=new EventEmitter();request.destroy=()=>{};request.end=()=>queueMicrotask(()=>{
    const res:any=new EventEmitter();res.statusCode=scenario==='redirect'?302:200;res.headers={'content-type':scenario==='wrong-type'?'text/plain':'application/json',...(scenario==='encoding'?{'content-encoding':'gzip'}:{})};res.destroy=()=>{};callback(res);
    const body=scenario==='oversized'?'x'.repeat(1025):scenario==='invalid-json'?'private-fixture-response':JSON.stringify({response:'a'.repeat(64),...(scenario==='extra-field'?{privateField:'fixture'}:{})});
    res.emit('data',Buffer.from(body));res.emit(scenario==='truncated'?'aborted':'end');
   });return request;
  };
  if(scenario==='valid')assert.equal(await postWebhookReview('https://public.example.test/hook','fixture',{}),'a'.repeat(64));
  else await assert.rejects(postWebhookReview('https://public.example.test/hook','fixture',{}),e=>e instanceof Error&&e.message==='Webhook review transport failed');
  assert.equal(requests,1);assert.equal(lookups,1);count++;console.log('PASS webhook review transport: '+scenario);
 }
 (dns.promises as any).lookup=async()=>[{address:'8.8.8.8',family:4}];let deadlineDestroyed=false;
 https.request=(_url:any,_options:any,callback:any)=>{const req:any=new EventEmitter();req.destroy=()=>{deadlineDestroyed=true;req.emit('error',Error('Fixture timeout'));};req.end=()=>queueMicrotask(()=>{const res:any=new EventEmitter();res.statusCode=200;res.headers={'content-type':'application/json'};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from('{'));});return req;};
 await assert.rejects(postWebhookReview('https://public.example.test/hook','fixture',{}),/Webhook review transport failed/);assert.ok(deadlineDestroyed);count++;console.log('PASS webhook review transport: incomplete response reaches whole-response deadline');
 let outbound=0;https.request=()=>{outbound++;throw Error('No request expected');};
 (dns.promises as any).lookup=async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}];
 await assert.rejects(postWebhookReview('https://public.example.test/hook','fixture',{}),/SSRF/);
 for(const url of ['http://public.example.test/hook','https://user:private@public.example.test/hook','https://public.example.test:8443/hook','https://127.0.0.1/hook'])await assert.rejects(postWebhookReview(url,'fixture',{}),/SSRF/);
 assert.equal(outbound,0);count++;console.log('PASS webhook review transport: private mixed DNS and forbidden destinations blocked before outbound');
 console.log(`PASS ${count} webhook review transport cases; mocked public DNS/socket, no external request.`);
}finally{https.request=originalRequest;(dns.promises as any).lookup=originalLookup;}}
void main().catch(()=>{console.error('FAIL webhook review transport; private values withheld');process.exitCode=1;});
