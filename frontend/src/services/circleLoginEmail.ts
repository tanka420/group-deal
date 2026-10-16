import type {User} from '../context/AuthContext';

type HintStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const validEmail=(email:unknown):email is string=>typeof email==='string'&&email.length<=254&&/^\S+@\S+\.\S+$/.test(email)&&!email.endsWith('@circle.invalid');
function scope(user:User|null){if(user?.loginMethod!=='CIRCLE_EMAIL'||!user.circleWallet)return null;return{accountId:user.id,walletId:user.circleWallet.walletId,address:user.circleWallet.address.toLowerCase()};}
function key(s:NonNullable<ReturnType<typeof scope>>){return'groupdeal_circle_login_email:'+encodeURIComponent(s.accountId)+':'+encodeURIComponent(s.walletId)+':'+s.address;}
/** A same-tab OTP address hint, never an identity claim or a signing credential. */
export function readCircleLoginEmail(user:User|null,storage?:HintStorage):string{
 try{const s=scope(user);if(!s)return'';const raw=(storage??window.sessionStorage).getItem(key(s));if(!raw||raw.length>2048)return'';const v=JSON.parse(raw);return v?.version===1&&v.accountId===s.accountId&&v.walletId===s.walletId&&v.address===s.address&&validEmail(v.email)?v.email:'';}catch{return'';}
}
export function rememberCircleLoginEmail(user:User|null,email:string,storage?:HintStorage):void{
 try{const s=scope(user),normalized=email.trim().toLowerCase();if(s&&validEmail(normalized))(storage??window.sessionStorage).setItem(key(s),JSON.stringify({version:1,...s,email:normalized}));}catch{/* OTP remains usable when browser storage is unavailable. */}
}
export function forgetCircleLoginEmail(user:User|null,storage?:HintStorage):void{
 try{const s=scope(user);if(s)(storage??window.sessionStorage).removeItem(key(s));}catch{}
}
