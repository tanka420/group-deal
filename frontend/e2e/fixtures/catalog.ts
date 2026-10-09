import type {Page} from '@playwright/test';
/** Empty DTO only for unrelated UI fixtures; catalogue tests use the real source API. */
import {emptyCatalog} from './catalog.mjs';
export {emptyCatalog} from './catalog.mjs';
export async function installEmptyCatalog(page:Page,hubAddress?:string){await page.route('**/api/v1/catalog?**',route=>route.fulfill({json:emptyCatalog(route.request().url(),hubAddress)}));}
