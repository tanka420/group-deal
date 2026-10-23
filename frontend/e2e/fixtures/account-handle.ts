import type {Page,Request} from '@playwright/test';
/** Keep account switching fixtures tied to the same owned identity used by auth/me. */
export async function installHandleFixture(page:Page,userForRequest:(request:Request)=>any){
 await page.route('**/api/seller/identity',r=>{
  const user=userForRequest(r.request()),raw=user.sellerProfile?.displayName||user.email?.split('@')[0]||user.id;
  const normalized=String(raw).toLowerCase().replace(/[^a-z0-9_]/g,'_'),username=(/^[a-z]/.test(normalized)?normalized:'fixture_'+normalized).padEnd(3,'_').slice(0,30);
  return r.fulfill({json:{identity:{userId:user.id,username,revision:1,links:{},updatedAt:1}}});
 });
}
