import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAppHash,parseAppPath,routePath} from '../src/utils/appRoute';
import {sellerSections,sellerSection,sellerPath,type SellerSection} from '../src/services/sellerNavigation';
import {operatorPaths,operatorSection,operatorPath,type OperatorSection} from '../src/services/operatorNavigation';
const pairs=[['#order-order_123','/orders/order_123'],['#home','/'],['#explore','/explore'],['#orders','/orders'],['#seller','/seller'],['#operator','/admin'],['#wallet','/wallet'],['#account','/account'],['#notifications','/notifications'],['#campaign-order_123','/deals/order_123'],['#seller-profile-user_1','/sellers/user_1'],['#support','/support'],['#support-order-order_123','/support/orders/order_123'],['#support-ticket-tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','/support/tickets/tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],['#operator/deals/deal_123/refunds','/admin/deals/deal_123/refunds']];
for(const section of Object.keys(sellerSections) as SellerSection[]){assert.equal(sellerSection(sellerPath(section)),section);if(sellerSections[section])pairs.push(['#seller/'+sellerSections[section],sellerPath(section)]);}
for(const section of Object.keys(operatorPaths) as OperatorSection[]){assert.equal(operatorSection(operatorPath(section)),section);pairs.push(['#operator/'+operatorPaths[section],operatorPath(section)]);}
for(const path of ['users/account-01','support/tickets/tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','support/orders/order_123'])pairs.push(['#operator/'+path,'/admin/'+path]);
for(const [legacy,path] of pairs){assert.equal(routePath(parseAppHash(legacy)),path);assert.deepEqual(parseAppPath(path),parseAppHash(legacy));}
const invalid=['/api/users','/assets/missing.js','//evil.example','/deals/a/b','/deals/%2F','/support/tickets/bad','/admin/deals/a/bad','/seller/not-supported','/admin/users/a/b','/admin/users/%2F','/admin/unknown','/admin/support/tickets/bad'];
for(const path of invalid)assert.equal(parseAppPath(path).kind,'not-found',path);
console.log(`Route checks passed: ${pairs.length} legacy round trips, ${invalid.length} rejected paths.`);
const nginxFiles=['../../config/nginx/groupdeal-app-routes.conf','../../config/nginx/groupdeal.tech.conf'];
for(const file of nginxFiles){
 const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 const pattern=source.match(/^location ~ "([^"]+)" \{/m)?.[1];assert.ok(pattern,'Missing SPA route allowlist');
 const routes=new RegExp(pattern!);
 for(const route of [...pairs.map(([,p])=>p),...['how','terms','privacy','delivery','refunds','help'].map(p=>'/policies/'+p)].filter(p=>p!=='/'))assert.ok(routes.test(route),'NGINX_SPA_ROUTE_MISSING '+route);
 for(const route of ['/api/orders','/assets/missing.js','/.env','/seller/not-supported','/policies/unknown','/admin/private'])assert.equal(routes.test(route),false,'NGINX_NON_APP_ROUTE_ALLOWED '+route);
}
console.log('Nginx SPA allowlists cover application routes and preserve API/asset 404 handling.');
