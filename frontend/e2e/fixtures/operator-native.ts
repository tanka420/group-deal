import {type Page} from '@playwright/test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),original=require('../../../shared/manifests/arc-testnet.json'),originalContracts=require('../../../shared/contracts.json');
export interface NativeOperatorFixture {token:string;buyer:string;deploymentBlock:number;auditCount:number;authority:{chainId:number;hubAddress:string;operatorAddress:string;authorizedSigner:string;ownerAddress:string;securityAuthority:string;bytecodeHash:string}}
/** Owned isolated HTTP authority only; never updates the installed manifest or claims live acceptance. */
export async function installNativeOperatorManifest(page:Page,fixture:NativeOperatorFixture){
 const manifest=structuredClone(original),contracts=structuredClone(originalContracts),a=fixture.authority;
 contracts.chainId=a.chainId;contracts.deploymentBlock=fixture.deploymentBlock;contracts.contracts.GroupDealHub.address=a.hubAddress;contracts.contracts.GroupDealHub.deploymentBlock=fixture.deploymentBlock;
 manifest.chainId=a.chainId;manifest.deploymentBlock=fixture.deploymentBlock;manifest.contracts.GroupDealHub.address=a.hubAddress;manifest.contracts.GroupDealHub.deploymentBlock=fixture.deploymentBlock;manifest.contracts.GroupDealHub.bytecodeHash=a.bytecodeHash;
 manifest.roles.operator.address=a.operatorAddress;manifest.roles.authorizedSigner.address=a.authorizedSigner;manifest.roles.owner.address=a.ownerAddress;manifest.roles.securityAuthority.address=a.securityAuthority;
 await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
 await page.route('**/shared/manifests/arc-testnet.json*',r=>r.fulfill({contentType:'application/javascript',body:'export default '+JSON.stringify(manifest)+';'}));
 await page.route('**/shared/contracts.json*',r=>r.fulfill({contentType:'application/javascript',body:'export default '+JSON.stringify(contracts)+';'}));
}

/** Forward the browser's managed token and real session metadata to the owned fixture. */
export async function installNativeOperatorAuth(page:Page,base:string){
 await page.route('**/api/auth/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['/api/auth/me','/api/auth/operator/enrollment','/api/auth/session/activity','/api/auth/wallets'].includes(url.pathname))return route.fallback();
  const headers:Record<string,string>={'Authorization':request.headers().authorization??''};
  if(request.headers()['content-type'])headers['Content-Type']=request.headers()['content-type'];
  const response=await fetch(base+url.pathname+url.search,{method:request.method(),headers,...(request.method()==='GET'?{}:{body:request.postData()??undefined})});
  await route.fulfill({status:response.status,headers:{'cache-control':response.headers.get('cache-control')??'private, no-store'},json:await response.json()});
 });
}
