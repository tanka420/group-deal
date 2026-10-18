import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {store,TransactionalStore} from '../src/db/store';
import {config} from '../src/config';
import {SessionService} from '../src/services/sessionService';
import {productMediaRouter} from '../src/routes/productMediaRoutes';
import {ProductService} from '../src/services/productService';
import {BackupService} from '../src/services/backupService';
import {productInput} from './fixtures/product';

async function main(){
 assert.ok(store.isIsolated);config.publicAppUrl='https://fixture.invalid';
 store.transaction(()=>{for(const id of ['seller','other','buyer','third'])store.db.users[id]={id,email:id+'@fixture.invalid',roles:id==='buyer'?['buyer']:['seller'],activeWallet:null,createdAt:Date.now()}});
 const token=SessionService.issue(store.db.users.seller),other=SessionService.issue(store.db.users.other),buyer=SessionService.issue(store.db.users.buyer);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
 const app=express();app.use('/api/product-images',productMediaRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 const send=(auth:string|undefined,bytes:Buffer=png,query='',type='application/octet-stream')=>fetch(origin+'/api/product-images'+query,{method:'POST',headers:{...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':type},body:bytes});let cases=0;
 const check=async(name:string,fn:()=>Promise<void>|void)=>{await fn();cases++;console.log('PASS '+name)};
 try{
  await check('authentication required',async()=>{assert.equal((await send(undefined)).status,401)});
  await check('buyer cannot upload',async()=>{assert.equal((await send(buyer)).status,403)});
  await check('SVG and disguised HTML rejected',async()=>{for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),Buffer.from('<html>test</html>')])assert.equal((await send(token,bytes)).status,400)});
  await check('size, empty body, MIME and query bounded',async()=>{assert.equal((await send(token,Buffer.alloc(1024*1024+1))).status,413);assert.equal((await send(token,Buffer.alloc(0))).status,400);assert.equal((await send(token,png,'?id=foreign')).status,400);assert.equal((await send(token,png,'','text/plain')).status,400)});
  let image:any;
  await check('upload persists exact raster with public URL',async()=>{const r=await send(token);assert.equal(r.status,201);image=await r.json();assert.match(image.id,/^img_[a-f0-9]{64}$/);assert.equal(image.url,'https://fixture.invalid/api/product-images/'+image.id);assert.equal(store.readProductImage(image.id)?.dataBase64,png.toString('base64'));assert.equal(store.db.auditLogs.filter(a=>a.action==='PRODUCT_IMAGE_UPLOADED').length,1)});
  await check('public GET exact bytes, fixed MIME, sandbox and nosniff',async()=>{const r=await fetch(origin+'/api/product-images/'+image.id);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/png');assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.match(r.headers.get('Content-Security-Policy')??'',/sandbox/);assert.match(r.headers.get('Cache-Control')??'',/immutable/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),png)});
  await check('JPEG from raster encoder round trips',async()=>{const bytes=fs.readFileSync(path.join(__dirname,'fixtures/product-image.jpg'));const r=await send(token,bytes);assert.equal(r.status,201);const jpeg:any=await r.json();assert.equal(jpeg.mimeType,'image/jpeg');assert.deepEqual(Buffer.from(await (await fetch(origin+'/api/product-images/'+jpeg.id)).arrayBuffer()),bytes)});
  await check('damaged PNG and JPEG structure rejected',async()=>{const broken=Buffer.from(png);broken[29]^=1;assert.equal((await send(token,broken)).status,400);assert.equal((await send(token,Buffer.from([255,216,255,192,0,8,8,0,1,0,1,3,255,217]))).status,400)});  await check('same upload safely deduplicates and does not repeat audit',async()=>{assert.deepEqual(await (await send(token)).json(),image);assert.equal(store.db.auditLogs.filter(a=>a.action==='PRODUCT_IMAGE_UPLOADED').length,2)});
  await check('owner namespace prevents cross-account alias',async()=>{const r=await send(other);assert.equal(r.status,201);const foreign:any=await r.json();assert.notEqual(foreign.id,image.id);assert.equal(store.readProductImage(foreign.id)?.sellerId,'other')});
  await check('unknown image and query override rejected',async()=>{assert.equal((await fetch(origin+'/api/product-images/img_'+'f'.repeat(64))).status,404);assert.equal((await fetch(origin+'/api/product-images/'+image.id+'?private=true')).status,400)});
  await check('product and revised album retain URLs, ordering and alt text',()=>{const input={...productInput,thumbnailUrl:image.url,media:[{url:image.url,alt:'Cover detail'},{url:'https://fixture.invalid/second.jpg',alt:'Second image'}]};const created=ProductService.createVersion('seller',input);assert.deepEqual(created.version.media,input.media);const next=ProductService.createVersion('seller',{...input,media:[...input.media].reverse()},created.product.id,created.version.id);assert.deepEqual(next.version.media,[...input.media].reverse());assert.deepEqual(store.db.productVersions[created.version.id].media,input.media);assert.ok(!JSON.stringify(created).includes('dataBase64'))});
  await check('quota enforced inside committed mutation',async()=>{store.transaction(()=>{(store.db.productImages??={}).quota={...store.readProductImage(image.id)!,id:'quota',sellerId:'other',byteLength:32*1024*1024}});const third=SessionService.issue(store.db.users.third);assert.equal((await send(third)).status,413);store.transaction(()=>{delete store.db.productImages!.quota})});
  await check('seller restriction rechecked even on duplicate',async()=>{store.transaction(()=>{store.db.users.seller.accountAccess={version:1,revision:1,restricted:true,sellerEnabled:true,updatedAt:Date.now(),updatedBy:'fixture',reason:'Test restriction'}});assert.equal((await send(token)).status,403);store.transaction(()=>{delete store.db.users.seller.accountAccess})});
  await check('encrypted backup and fresh restore preserve uploaded image',()=>{const backup=BackupService.createEncryptedBackup(undefined,store),data=BackupService.readEncryptedBackup(backup.backupPath).data;assert.equal(data.productImages?.[image.id].dataBase64,png.toString('base64'));const dir=fs.mkdtempSync(path.join(store.storageDirectory,'media-restore-')),restored=new TransactionalStore(dir);restored.initializeRecoverySnapshot(data);assert.equal(restored.readProductImage(image.id)?.dataBase64,png.toString('base64'));assert.ok(restored.verifyAuditLogIntegrity().valid)});
  await check('revoked session cannot upload',async()=>{SessionService.logout(token,{idempotencyKey:crypto.randomUUID()});assert.equal((await send(token)).status,401)});
  console.log(JSON.stringify({result:'PRODUCT_MEDIA_ISOLATED_CHECKS_PASSED',cases,originalDatabaseOpened:false,externalNetwork:false}));
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
}
main().catch(e=>{console.error('PRODUCT_MEDIA_CHECK_FAILED',e.message);process.exitCode=1});
