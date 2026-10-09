import assert from "node:assert/strict";
import { ArcReadProvider } from "../src/services/arcReadProvider";

async function main() {
  const originalFetch = globalThis.fetch;
  const urls:string[] = [];
  const request = {jsonrpc:"2.0",id:7,method:"eth_blockNumber",params:[]};
  const reply = (chain:string, result:any = "0x7b") => [{jsonrpc:"2.0",id:-1,result:chain},{jsonrpc:"2.0",id:7,result}];
  const endpoints = ["https://primary.fixture.invalid/token-secret","https://backup.fixture.invalid"];
  const provider = new ArcReadProvider(endpoints,5042002);
  try {
    let responses:any[] = [{status:429},reply("0x4cef52")]; // Chain ID 5042002.
    const mock = () => { globalThis.fetch = (async (url:any) => {
      urls.push(String(url)); const response = responses.shift();
      return response?.status ? {ok:false,status:response.status} : {ok:true,json:async()=>response};
    }) as any; };
    mock();
    // Calculate rather than rely on a hand-written chain ID fixture.
    responses[1] = reply("0x"+(5042002).toString(16));
    assert.equal((await provider._send(request))[0].result,"0x7b"); assert.equal(urls.length,2);
    for (const malformed of [reply("0x1"),[...reply("0x"+(5042002).toString(16)),{jsonrpc:"2.0",id:7,result:"0x1"}],{result:"0x1"}]) {
      urls.length=0; responses = [malformed,reply("0x"+(5042002).toString(16))];
      assert.equal((await provider._send(request))[0].result,"0x7b"); assert.equal(urls.length,2);
    }
    urls.length=0; responses = [[{jsonrpc:"2.0",id:-1,result:"0x"+(5042002).toString(16)},{jsonrpc:"2.0",id:7,error:{code:3,message:"execution reverted",data:"0x"}}]];
    assert.ok("error" in (await provider._send({...request,method:"eth_call"}))[0]); assert.equal(urls.length,1);
    urls.length=0;
    await assert.rejects(provider._send({...request,method:"eth_sendRawTransaction"}),/rejects mutation/); assert.equal(urls.length,0);
    responses = [{status:503},{status:503}];
    await assert.rejects(provider._send(request),error => error instanceof Error && /unavailable/.test(error.message) && !error.message.includes("token-secret"));
    let headReads=0;
    globalThis.fetch=(async (_url:any,options:any)=>{
      const requests=JSON.parse(options.body);const answers=requests.map((item:any)=>({jsonrpc:'2.0',id:item.id,result:item.method==='eth_chainId'?'0x'+(5042002).toString(16):'0x'+(++headReads+15).toString(16)}));
      return{ok:true,json:async()=>answers};
    }) as any;
    const fresh=new ArcReadProvider(['https://fresh.fixture.invalid'],5042002);
    try{assert.equal(await fresh.getBlockNumber(),16);assert.equal(await fresh.getBlockNumber(),17,'A second canonical/head read must reach RPC rather than reuse a 250ms cached response');assert.equal(headReads,2);}finally{fresh.destroy();}
    console.log("PASS read-only RPC failover: rate limit, wrong chain, malformed/duplicate replies, revert, mutation refusal, credential-safe errors and uncached canonical/head reads");
  } finally { globalThis.fetch=originalFetch; provider.destroy(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
