import * as dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import { BlockList, isIP } from "node:net";
import { config } from "../config";

const forbidden=new BlockList();
for(const [address,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",3]] as const)forbidden.addSubnet(address,prefix,"ipv4");
const globalV6=new BlockList();globalV6.addSubnet("2000::",3,"ipv6");
for(const [address,prefix] of [["2001::",32],["2001:2::",48],["2001:10::",28],["2001:20::",28],["2001:db8::",32],["2002::",16],["3fff::",20]] as const)forbidden.addSubnet(address,prefix,"ipv6");

export function assertPublicWebhookAddress(address:string):void {
  const family=isIP(address);
  if(!family||family===4&&forbidden.check(address,"ipv4")||family===6&&(!globalV6.check(address,"ipv6")||forbidden.check(address,"ipv6")))throw new Error("SSRF Protection: webhook address is not a permitted public address");
}

/** Resolve once, reject every non-public answer, then pin the socket lookup to that validated address. */
export async function resolveWebhookTarget(target:string):Promise<{url:URL;address:string;family:4|6}> {
  let url:URL;try{url=new URL(target);}catch{throw new Error("Invalid webhook URL format");}
  const local=config.arcChainId===31337&&!config.isProduction;
  if(!["https:",...(local?["http:"]:[])].includes(url.protocol))throw new Error("SSRF Protection: HTTPS webhook protocol required");
  if(url.username||url.password||url.hash||url.port&&url.port!==(url.protocol==="https:"?"443":"80"))throw new Error("SSRF Protection: webhook credentials, fragment or port are forbidden");
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal"))throw new Error("SSRF Protection: local webhook hostname is forbidden");
  if(isIP(host)){assertPublicWebhookAddress(host);return {url,address:host,family:isIP(host) as 4|6};}
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const records=await Promise.race([dns.promises.lookup(host,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("DNS timeout")),3000);})]);
    if(!records.length)throw new Error("No DNS addresses");
    for(const record of records)assertPublicWebhookAddress(record.address);
    return {url,address:records[0].address,family:records[0].family as 4|6};
  }catch{throw new Error("SSRF Protection: webhook DNS did not resolve exclusively to public addresses");}
  finally{if(timer)clearTimeout(timer);}
}

export async function postWebhook(target:string,body:string,headers:Record<string,string>):Promise<number> {
  const {url,address,family}=await resolveWebhookTarget(target);
  return new Promise<number>((resolve,reject)=>{
    const transport=url.protocol==="https:"?https:http;
    // Original hostname is retained for Host/TLS certificate validation; lookup cannot re-resolve DNS.
    const lookup:any=(_hostname:string,options:any,callback:any)=>options?.all?callback(null,[{address,family}]):callback(null,address,family);
    const request=transport.request(url,{method:"POST",agent:false,lookup,headers:{...headers,"Content-Length":Buffer.byteLength(body).toString()}},response=>{
      const status=response.statusCode||0;
      response.destroy();
      clearTimeout(timer);resolve(status); // Redirects are never followed or given the signed payload.
    });
    const timer=setTimeout(()=>request.destroy(new Error("Webhook timeout")),5000);
    request.once("error",()=>{clearTimeout(timer);reject(new Error("Webhook transport failed"));});
    request.end(body);
  });
}

/** Review challenges use the same DNS pinning, with a small JSON acknowledgement and a whole-response deadline. */
export async function postWebhookReview(target:string,body:string,headers:Record<string,string>):Promise<string>{
 const {url,address,family}=await resolveWebhookTarget(target);
 return new Promise<string>((resolve,reject)=>{
  const transport=url.protocol==='https:'?https:http;
  const lookup:any=(_hostname:string,options:any,callback:any)=>options?.all?callback(null,[{address,family}]):callback(null,address,family);
  let settled=false;const finish=(value?:string)=>{if(settled)return;settled=true;clearTimeout(timer);if(value!==undefined)resolve(value);else reject(Error('Webhook review transport failed'));};
  const request=transport.request(url,{method:'POST',agent:false,lookup,headers:{...headers,'Content-Length':String(Buffer.byteLength(body))}},response=>{
   if(response.statusCode!==200||!/^application\/json(?:\s*;.*)?$/i.test(String(response.headers['content-type']??''))||response.headers['content-encoding']!==undefined){response.destroy();finish();return;}
   let bytes=0;const chunks:Buffer[]=[];
   response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024){response.destroy();finish();}else chunks.push(chunk);});
   response.once('error',()=>finish());response.once('aborted',()=>finish());
   response.once('end',()=>{try{const reply=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!reply||typeof reply!=='object'||Array.isArray(reply)||Object.keys(reply).length!==1||! /^[a-f0-9]{64}$/.test(reply.response))throw Error();finish(reply.response);}catch{finish();}});
  });
  const timer=setTimeout(()=>{request.destroy();finish();},5000);
  request.once('error',()=>finish());request.end(body);
 });
}
