const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
exports.verifyBuyerResources=async(GroupDealSDK)=>{
 const bytes=Buffer.from('Complete protected content'),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),now=Date.now();
 const grant={id:'grant_fixture',unitIndex:0,seatsPerUnit:1,fileName:'resource.txt',mimeType:'text/plain',byteLength:bytes.length,sha256,activatedAt:now-1000,redeemedAt:null,licenseExpiresAt:null,activationDeadline:null,requiresRedemption:false,canRedeem:false,downloadReady:true,accessStatus:'DOWNLOAD_READY'};
 let mode='OK',requests=0,redeemed=0;const signature='ab'.repeat(32),expiresAt=Math.floor(now/1000)+600;
 const server=http.createServer((req,res)=>{
  requests++;assert.equal(req.headers.authorization,'Bearer fixture-session');res.setHeader('Cache-Control','private, no-store');
  const url=new URL(req.url,'http://127.0.0.1');
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(mode==='JSON_SIZE')return json({padding:'x'.repeat(1024*1024)});
  if(mode==='JSON_TIMEOUT'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');return;}
  if(url.pathname.endsWith('/grants'))return json({orderId:mode==='WRONG_ORDER'?'other':'order_fixture',buyerAccountId:'buyer_fixture',serverTime:now,grants:mode==='DUPLICATE'?[grant,grant]:[{...grant,...(mode==='CONTRADICTION'?{requiresRedemption:true}:{}),privateDiagnostic:'omitted'}]});
  if(url.pathname.endsWith('/redeem')){let body='';req.on('data',c=>body+=c);return req.on('end',()=>{assert.deepEqual(JSON.parse(body),{key:'local-fixture-key'});redeemed++;json({success:true,privateDiagnostic:'omitted'});});}
  if(url.pathname.endsWith('/download-link'))return json({grantId:mode==='WRONG_GRANT'?'other':grant.id,fileName:grant.fileName,mimeType:grant.mimeType,byteLength:grant.byteLength,sha256,expiresAt,url:mode==='EXTERNAL_LINK'?'https://private.example.test/file':url.pathname.replace('-link','')+'?expiresAt='+expiresAt+'&keyId=fixture&signature='+signature+(mode==='DUPLICATE_QUERY'?'&keyId=other':'')});
  if(mode==='AUTH')return json({error:'private-provider-error'},401);
  if(mode==='REDIRECT'){res.writeHead(302,{Location:'https://private.example.test/redirect'});return res.end();}
  res.writeHead(200,{'Content-Type':mode==='MIME'?'text/html':'text/plain'});
  if(mode==='TIMEOUT'){res.write(bytes.subarray(0,1));return;}
  res.end(mode==='SHORT'?bytes.subarray(1):mode==='LONG'?Buffer.concat([bytes,Buffer.from('extra')]):mode==='HASH'?Buffer.alloc(bytes.length):bytes);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const sdk=new GroupDealSDK({baseUrl:'http://127.0.0.1:'+server.address().port,timeoutMs:1000});
 try{
  const result=await sdk.getResourceGrants('fixture-session','order_fixture');assert.deepEqual(result.grants,[grant]);assert.equal(result.buyerAccountId,'buyer_fixture');
  assert.deepEqual(await sdk.redeemResourceGrant('fixture-session',grant.id,'local-fixture-key'),{success:true});assert.equal(redeemed,1);
  assert.deepEqual(Buffer.from(await sdk.downloadResourceGrant('fixture-session',grant)),bytes);
  for(mode of ['WRONG_ORDER','DUPLICATE','CONTRADICTION','JSON_SIZE','JSON_TIMEOUT'])await assert.rejects(sdk.getResourceGrants('fixture-session','order_fixture'));
  for(mode of ['WRONG_GRANT','EXTERNAL_LINK','DUPLICATE_QUERY','SHORT','LONG','HASH','MIME','AUTH','REDIRECT','TIMEOUT'])await assert.rejects(sdk.downloadResourceGrant('fixture-session',grant));
  const before=requests;await assert.rejects(sdk.downloadResourceGrant('fixture-session',{...grant,downloadReady:false,accessStatus:'LICENSE_EXPIRED'}),/unavailable/);await assert.rejects(sdk.redeemResourceGrant('fixture-session',grant.id,'short'));assert.equal(requests,before);
  console.log('PASS packed buyer resources: authenticated metadata/redemption, exact file bytes, 17 denied metadata/link/integrity/auth/redirect/timeout cases; local HTTP only.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
};
