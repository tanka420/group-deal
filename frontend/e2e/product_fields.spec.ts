import {test,expect,type Page} from '@playwright/test';
import {fixture,fillCreate,studio,product} from './fixtures/product-studio';

async function toggleLanguage(page:Page,en:boolean){
 await page.locator('.account-pill-btn').click();
 await page.getByRole('button',{name:en?'Language: English':'Ngôn ngữ: Tiếng Việt',exact:true}).click();
 await page.keyboard.press('Escape');
}
async function assertReflow(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
 const controls=await studio(page).locator('button:visible,input:visible,textarea:visible,select:visible').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return{id:n.id,text:n.textContent?.slice(0,60),left:b.left,right:b.right,width:b.width}}));
 expect(controls.filter(b=>b.left<0||b.right>375||b.width<=0),JSON.stringify(controls)).toEqual([]);
}
async function assertErrorVisible(page:Page,id:string){
 await expect.poll(()=>page.locator('#'+id).evaluate(node=>{const box=node.closest('label')!.getBoundingClientRect(),header=document.querySelector('.header')!.getBoundingClientRect();return box.top>=header.bottom+10&&box.bottom<=innerHeight-10})).toBe(true);
}

for(const language of ['vi','en'] as const){
 test(`R7 product fields ${language} block invalid metadata before checkpoint and preserve unknown writes`,async({page},info)=>{
  const state=await fixture(page,language),en=language==='en',name='Seller draft · Bản nháp giữ nguyên';
  await page.setViewportSize({width:375,height:1000});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await fillCreate(page,name);
  await page.locator('#product-seats').fill('0');await page.getByRole('button',{name:en?'Save version':'Lưu phiên bản',exact:true}).click();
  await page.screenshot({path:info.outputPath('product-seats-'+language+'.png'),animations:'disabled'});
  await expect(page.locator('#product-seats')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#product-seats')).toBeFocused();await expect(page.locator('#product-seats-error')).toContainText(en?'1':'1');
  await assertErrorVisible(page,'product-seats');await page.locator('#product-seats').press('Tab');await expect(page.locator('#product-duration')).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.locator('#product-seats')).toBeFocused();expect(state.writes).toBe(0);expect(await page.evaluate(()=>sessionStorage.getItem('groupdeal_product_pending:studio-seller'))).toBeNull();
  await page.locator('#product-seats').fill('2');await expect(page.locator('#product-seats')).not.toHaveAttribute('aria-invalid','true');
  for(const [id,value] of [['thumbnailUrl','http://asset.example.test/a.png'],['thumbnailUrl','https://private:secret@asset.example.test/a.png'],['title',' '.repeat(4)],['seats','10001'],['seats','1.5'],['duration','36501'],['activation','3651'],['supportDays','-1'],['regions',', ,']] as const){
   const control=page.locator('#product-'+id),previous=await control.inputValue();await control.fill(value);await page.getByRole('button',{name:en?'Save version':'Lưu phiên bản',exact:true}).click();await expect(control).toHaveAttribute('aria-invalid','true');await expect(control).toBeFocused();await expect(page.locator('#product-'+id+'-error')).toBeVisible();expect(state.writes).toBe(0);await control.fill(previous);
  }
  await page.locator('#product-duration').fill('');await page.locator('#product-activation').fill('');await page.locator('#product-supportDays').fill('0');
  await page.locator('#product-title').fill('x'.repeat(181));await page.getByRole('button',{name:en?'Save version':'Lưu phiên bản',exact:true}).click();await expect(page.locator('#product-title')).toBeFocused();await expect(page.locator('#product-title-error')).toContainText('180');
  await toggleLanguage(page,en);await expect(page.locator('#product-title-error')).toContainText(en?'ký tự':'characters');await expect(page.locator('#product-title')).toHaveValue('x'.repeat(181));await toggleLanguage(page,!en);
  await page.locator('#product-title').fill(name);await assertReflow(page);state.failPost=true;await page.getByRole('button',{name:en?'Save version':'Lưu phiên bản',exact:true}).click();await expect(studio(page).getByRole('alert')).toBeVisible();expect(state.writes).toBe(1);expect(state.body.license.durationDays).toBeNull();expect(state.body.license.activationWindowDays).toBeNull();expect(state.body.license.supportDays).toBe(0);
  const retained=await page.evaluate(()=>sessionStorage.getItem('groupdeal_product_pending:studio-seller'));expect(retained).not.toBeNull();await expect(page.locator('#product-title')).toHaveValue(name);await studio(page).locator(':scope > form').dispatchEvent('submit');expect(state.writes).toBe(1);expect(await page.evaluate(()=>sessionStorage.getItem('groupdeal_product_pending:studio-seller'))).toBe(retained);
  await page.screenshot({path:info.outputPath('product-unknown-'+language+'.png'),fullPage:true,animations:'disabled'});
 });

 test(`R7 rights fields ${language} retain private draft and selected version at text200`,async({page},info)=>{
  const state=await fixture(page,language),en=language==='en';await page.setViewportSize({width:375,height:1000});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await page.getByRole('button',{name:en?'Rights and resources':'Quyền và tài nguyên',exact:true}).first().click();await expect(page.locator('#resource-select')).toContainText('retained-resource.txt');
  const submit=()=>page.getByRole('button',{name:en?'Submit for operator review':'Nộp để operator xét duyệt',exact:true}).click();
  await page.locator('#rights-statement').fill('   ');await page.locator('#rights-evidence').fill('http://evidence.example.test/private');await submit();await expect(page.locator('#rights-statement')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#rights-statement')).toBeFocused();await assertErrorVisible(page,'rights-statement');await page.screenshot({path:info.outputPath('rights-errors-'+language+'.png'),animations:'disabled'});expect(state.rightsWrites).toBe(0);
  const statement='Private rights evidence · Bằng chứng giữ riêng';await page.locator('#rights-statement').fill(statement);await submit();await expect(page.locator('#rights-evidence')).toBeFocused();await expect(page.locator('#rights-evidence')).toHaveAttribute('aria-describedby','rights-evidence-error');await expect(page.locator('#rights-evidence-error')).toContainText('HTTPS');
  await page.locator('#rights-evidence').fill(Array.from({length:13},(_,i)=>'https://evidence.example.test/'+i).join('\n'));await submit();await expect(page.locator('#rights-evidence-error')).toContainText('12');expect(state.rightsWrites).toBe(0);
  await toggleLanguage(page,en);await expect(page.locator('#rights-evidence-error')).toContainText(en?'link':'links');await expect(page.locator('#rights-statement')).toHaveValue(statement);await toggleLanguage(page,!en);await assertReflow(page);
  await page.locator('#rights-evidence').fill('https://evidence.example.test/private');await expect(page.locator('#rights-evidence')).not.toHaveAttribute('aria-invalid','true');state.failRights=true;await submit();await expect(studio(page).getByRole('alert')).toBeVisible();expect(state.rightsWrites).toBe(1);const checkpoint=await page.evaluate(()=>sessionStorage.getItem('groupdeal_product_pending:studio-seller'));expect(JSON.parse(checkpoint!).productVersionId).toBe(product.version.id);expect(checkpoint).not.toContain(statement);expect(checkpoint).not.toContain('evidence.example.test');await expect(page.locator('#rights-statement')).toHaveValue(statement);await expect(page.locator('#rights-evidence')).toHaveValue('https://evidence.example.test/private');await expect(page.getByRole('button',{name:en?'Submit for operator review':'Nộp để operator xét duyệt',exact:true})).toBeDisabled();
  await page.screenshot({path:info.outputPath('rights-unknown-'+language+'.png'),fullPage:true,animations:'disabled'});
 });
}
