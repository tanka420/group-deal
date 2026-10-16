import assert from 'node:assert/strict';
import type {User} from '../src/context/AuthContext';
import {readCircleLoginEmail,rememberCircleLoginEmail,forgetCircleLoginEmail} from '../src/services/circleLoginEmail';
const rows=new Map<string,string>(),storage={getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>{rows.set(k,v);},removeItem:(k:string)=>{rows.delete(k);}},user:User={id:'hint-owner',email:null,loginMethod:'CIRCLE_EMAIL',roles:['buyer'],activeWallet:'0x'+'1'.repeat(40),circleWallet:{walletId:'bound-wallet',address:'0x'+'1'.repeat(40),blockchain:'ARC-TESTNET'}};
rememberCircleLoginEmail(user,' Wallet@example.test ',storage);assert.equal(readCircleLoginEmail(user,storage),'wallet@example.test');
for(const changed of [{...user,id:'other-account'},{...user,circleWallet:{...user.circleWallet!,walletId:'other-wallet'}},{...user,circleWallet:{...user.circleWallet!,address:'0x'+'2'.repeat(40)}},{...user,loginMethod:'EVM_WALLET' as const}])assert.equal(readCircleLoginEmail(changed,storage),'');
console.log('PASS email hint stays within its Circle account, wallet and address');
assert.equal(rows.size,1);const key=[...rows.keys()][0],record=JSON.parse(rows.get(key)!);assert.deepEqual(Object.keys(record).sort(),['accountId','address','email','version','walletId']);assert.equal(record.email,'wallet@example.test');
rows.set(key,JSON.stringify({...record,accountId:'other-account'}));assert.equal(readCircleLoginEmail(user,storage),'');rows.set(key,'{broken');assert.equal(readCircleLoginEmail(user,storage),'');
console.log('PASS malformed or foreign hints cannot prefill an OTP address');
for(const value of ['invalid','circle-fixture@circle.invalid','x'.repeat(255)+'@example.test']){rows.clear();rememberCircleLoginEmail(user,value,storage);assert.equal(rows.size,0);}
rememberCircleLoginEmail(user,'wallet@example.test',storage);forgetCircleLoginEmail(user,storage);assert.equal(rows.size,0);assert.equal(readCircleLoginEmail(user,storage),'');
console.log('PASS placeholders are excluded and logout removes the address hint');
const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};assert.equal(readCircleLoginEmail(user,blocked),'');assert.doesNotThrow(()=>rememberCircleLoginEmail(user,'wallet@example.test',blocked));assert.doesNotThrow(()=>forgetCircleLoginEmail(user,blocked));
console.log('PASS denied browser storage does not break Circle authentication');
