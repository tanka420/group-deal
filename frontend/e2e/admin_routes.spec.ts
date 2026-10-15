import {test,expect} from '@playwright/test';

for(const width of [375,1440])test('admin guest routes preserve URLs and require a separate sign-in at '+width,async({page},info)=>{
 const errors:string[]=[],privileged:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.removeItem('groupdeal_token');localStorage.removeItem('groupdeal_admin_token');localStorage.setItem('groupdeal_lang','en');});
 await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
 await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;if(p.startsWith('/api/operator')||p.startsWith('/api/admin-auth'))privileged.push(p);return r.fulfill({json:{}});});
 await page.setViewportSize({width,height:900});
 for(const path of ['/admin/users?q=studio&role=seller','/admin/users/account-01?section=audit','/admin/permissions','/admin/support/tickets/tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','/admin/operations']){
  await page.goto(path);await expect(page.getByRole('heading',{name:'Administration',exact:true})).toBeVisible();await expect(page.locator('.operator-portal')).toHaveCount(0);expect(new URL(page.url()).pathname+new URL(page.url()).search).toBe(path);await page.reload();await expect(page.getByRole('button',{name:'Connect and sign in with admin wallet',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
 await page.screenshot({path:info.outputPath('admin-built-guest-'+width+'.png'),fullPage:true});expect(privileged).toEqual([]);expect(errors).toEqual([]);
});
