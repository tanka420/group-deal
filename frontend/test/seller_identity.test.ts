import assert from 'node:assert/strict';
import {authorizationUrl,readIdentity,readLink} from '../src/services/sellerIdentity';

Object.defineProperty(globalThis,'location',{value:{origin:'https://groupdeal.example.test'},configurable:true});
const valid={provider:'github',providerUserId:'42',username:'verified-owner',url:'https://github.com/verified-owner',verifiedAt:Date.now()};
assert.equal(readLink(valid).url,valid.url);
for(const url of ['javascript:alert(1)','https://evil.invalid/verified-owner','https://github.com/../admin'])assert.throws(()=>readLink({...valid,url}));
assert.throws(()=>readIdentity({userId:'other',revision:1,links:{github:valid}},'actor'));
assert.throws(()=>readIdentity({userId:'actor',revision:1,links:{x:valid}},'actor'));
const state='s'.repeat(43),good=new URL('https://github.com/login/oauth/authorize');
good.searchParams.set('state',state);good.searchParams.set('redirect_uri',location.origin+'/seller/profile');
assert.equal(authorizationUrl(good.href,'github',state),good.href);
for(const value of [good.href.replace('github.com','evil.invalid'),good.href.replace('github.com','github.com@evil.invalid'),good.href.replace(state,'wrong'),good.href.replace('%2Fseller%2Fprofile','%2Fother')])assert.throws(()=>authorizationUrl(value,'github',state));
console.log('PASS seller identity browser boundary: canonical links, account/provider mismatch and authorization redirect rejected.');
