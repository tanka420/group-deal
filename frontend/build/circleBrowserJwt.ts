import type {Plugin} from 'vite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';

/** Replace only Circle's decode-only Node import; leave backend JWT verification intact. */
export function circleBrowserJwt():Plugin{
 const require=createRequire(import.meta.url),entry=require.resolve('@circle-fin/w3s-pw-web-sdk'),packagePath=resolve(dirname(entry),'../../package.json'),metadata=JSON.parse(readFileSync(packagePath,'utf8'));
 const expectedSource=readFileSync(entry,'utf8'),digest=createHash('sha256').update(expectedSource).digest('hex');
 let adapter='';
 const references=[...expectedSource.matchAll(/jsonwebtoken_1\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
 if(metadata.version!=='1.1.11'||references.length!==1||references[0]!=='decode'||(expectedSource.match(/require\(["']jsonwebtoken["']\)/g)||[]).length!==1)throw Error('Circle JWT usage changed; review the browser adapter before building');
 const transform=(code:string,id:string)=>{
  if(id.split('?')[0].replaceAll('\\','/')!==entry.replaceAll('\\','/'))return;
  if(createHash('sha256').update(code).digest('hex')!==digest)throw Error('Unexpected Circle source transform before decode adapter');
  return {code:code.replace(/require\(["']jsonwebtoken["']\)/,()=>`require(${JSON.stringify(adapter.replaceAll('\\','/'))})`),map:null};
 };
 return {name:'groupdeal-circle-decode-only',enforce:'pre',configResolved(config){adapter=resolve(config.root,'src/vendor/circleJwtDecode.cjs');},config(){return {optimizeDeps:{rolldownOptions:{plugins:[{name:'groupdeal-circle-decode-prebundle',transform}]}}};},transform};
}
