import {expect,type Page} from '@playwright/test';

/** Open the authenticated account's funding action after its session is ready. */
export async function openAccountFunding(page:Page){
 const trigger=page.locator('.account-pill-btn');await expect(trigger).toBeVisible();await trigger.click();
 await page.locator('#header-account').getByRole('button',{name:/^(Nạp USDC|Fund USDC)$/,exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
}
