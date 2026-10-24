import assert from 'node:assert/strict';
import {dateTime} from '../src/utils/dateTime';
import {filterOrders,emptyOrderFilters,orderDateBound,orderFilterError,formatOrderDate,orderTimestamp} from '../src/services/orderList';
assert.equal(orderDateBound('2026-02-30'),null);assert.equal(orderDateBound('2026-10-15'),Date.parse('2026-10-14T17:00:00Z'));assert.equal(orderDateBound('2026-10-15',true),Date.parse('2026-10-15T16:59:59.999Z'));
assert.equal(orderFilterError({...emptyOrderFilters,from:'2026-10-16',to:'2026-10-15'}),'RANGE');assert.equal(orderTimestamp(undefined),null);assert.equal(orderTimestamp('1000'),null);assert.equal(orderTimestamp(-1),null);
const rows=[{id:'stable_a',createdAt:Date.parse('2026-10-14T17:00:00Z'),campaignTitle:'ＣＳＶ  Studio',deliveryStatus:'PENDING'},{id:'stable_b',createdAt:Date.parse('2026-10-15T16:59:59.999Z'),campaignTitle:'CSV Studio',deliveryStatus:'DELIVERED'},{id:'no_date',campaignTitle:'Other',deliveryStatus:'CONFIRMED'}];
assert.deepEqual(filterOrders(rows,emptyOrderFilters).map(r=>r.id),['stable_b','stable_a','no_date']);assert.deepEqual(filterOrders(rows,{...emptyOrderFilters,from:'2026-10-15',to:'2026-10-15'}).map(r=>r.id),['stable_b','stable_a']);assert.deepEqual(filterOrders(rows,{...emptyOrderFilters,q:'csv studio',status:'PENDING'}).map(r=>r.id),['stable_a']);assert.equal(filterOrders(rows,{...emptyOrderFilters,q:'stable_b'})[0].id,'stable_b');assert.match(formatOrderDate(rows[0].createdAt,'en'),/15\/10\/2026.*00:00$/);assert.equal(formatOrderDate(undefined,'en'),'No recorded date');
console.log('PASS order list: stable IDs, whole-set search/order, UTC+7 inclusive bounds, invalid/missing dates and status.');
const originalZone=process.env.TZ;
try{
 for(const zone of ['UTC','Asia/Ho_Chi_Minh']){
  process.env.TZ=zone;
  for(const language of ['vi','en']){
   const display=dateTime(Date.parse('2026-10-24T01:02:03Z'),language);
   assert.ok(display.includes('24/10/2026')&&display.includes('08:02'));
   for(const invalid of [undefined,null,'2026-10-24',NaN,Infinity,-1,0,8640000000000001])assert.equal(dateTime(invalid,language),'—');
  }
 }
}finally{if(originalZone===undefined)delete process.env.TZ;else process.env.TZ=originalZone;}
console.log('PASS shared Vietnam display time: VI/EN, UTC/Vietnam host zones, missing and invalid values.');
