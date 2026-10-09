import {type Page} from '@playwright/test';
/** Follow the actual responsive workspace menu; assertions remain at the panel. */
export async function selectOperatorSection(page:Page,options:{name:string|RegExp;exact?:boolean}){
 const root=page.locator('.operator-portal .workspace-tabs');await root.waitFor({state:'visible'});const trigger=root.locator('button[aria-haspopup="dialog"]');if(await trigger.isVisible()&&await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();await root.getByRole('button',options).click();
}