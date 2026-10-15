import assert from 'node:assert/strict';
import {parseAppHash,parseAppPath,routePath} from '../src/utils/appRoute';
const pairs=[['#explore','/explore'],['#orders','/orders'],['#seller','/seller'],['#operator','/admin'],['#wallet','/wallet'],['#account','/account'],['#notifications','/notifications'],['#campaign-order_123','/deals/order_123'],['#seller-profile-user_1','/sellers/user_1'],['#support','/support'],['#support-order-order_123','/support/orders/order_123'],['#support-ticket-tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','/support/tickets/tkt_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],['#operator/deals/deal_123/refunds','/admin/deals/deal_123/refunds']];
for(const [legacy,path] of pairs){assert.equal(routePath(parseAppHash(legacy)),path);assert.deepEqual(parseAppPath(path),parseAppHash(legacy));}
for(const path of ['/api/users','/assets/missing.js','//evil.example','/deals/a/b','/deals/%2F','/support/tickets/bad','/admin/deals/a/bad'])assert.equal(parseAppPath(path).kind,'not-found',path);
console.log(`Route checks passed: ${pairs.length} legacy round trips, 7 rejected paths.`);
