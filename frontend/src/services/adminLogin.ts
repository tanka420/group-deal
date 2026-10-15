import {ethers} from 'ethers';

/** Check the complete purpose before opening a wallet signature request. */
export function readAdminLoginChallenge(value:unknown,wallet:string,origin:string){
 const v=value as {challengeMessage?:unknown;nonce?:unknown;expiresAt?:unknown};
 if(!v||typeof v.challengeMessage!=='string'||typeof v.nonce!=='string'||!/^[a-f0-9]{32}$/.test(v.nonce)||typeof v.expiresAt!=='number'||!Number.isSafeInteger(v.expiresAt))throw Error('ADMIN_CHALLENGE_INVALID');
 const timestamp=v.expiresAt-300,now=Math.floor(Date.now()/1000),recovery=/\nRecovery context: ([A-Za-z0-9_-]{43})\n/.exec(v.challengeMessage)?.[1];
 const expected=['=== GroupDeal Wallet Login ===','Action: WALLET_LOGIN','Session: GroupDeal admin only','Wallet: '+ethers.getAddress(wallet),'Chain ID: 5042002','Origin: '+origin,'Nonce: '+v.nonce,'Timestamp: '+timestamp,'Expires: '+v.expiresAt,...(recovery?['Recovery context: '+recovery]:[]),'This signature does not submit a transaction or spend funds.'].join('\n');
 if(timestamp<0||timestamp>now+30||v.expiresAt<=now||v.challengeMessage!==expected)throw Error('ADMIN_CHALLENGE_INVALID');
 return {challengeMessage:v.challengeMessage,nonce:v.nonce,expiresAt:v.expiresAt};
}
