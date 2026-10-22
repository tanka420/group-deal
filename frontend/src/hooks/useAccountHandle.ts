import {useEffect,useState,useRef} from 'react';
import {readIdentity} from '../services/sellerIdentity';
export function useAccountHandle(userId:string|undefined,token:string|null){
 const [value,setValue]=useState<{scope:string;username:string|null}|null>(null),scope=JSON.stringify([userId,token]),sequence=useRef(0);
 useEffect(()=>{const controller=new AbortController();const load=()=>{const request=++sequence.current;if(!userId||!token){setValue(null);return;}void fetch('/api/seller/identity',{headers:{Authorization:'Bearer '+token},signal:controller.signal,cache:'no-store',redirect:'error'}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(v=>{if(!controller.signal.aborted&&request===sequence.current)setValue({scope,username:readIdentity(v.identity,userId).username??null});}).catch(()=>{if(!controller.signal.aborted&&request===sequence.current)setValue(null);});};load();window.addEventListener('groupdeal:identity',load);return()=>{controller.abort();window.removeEventListener('groupdeal:identity',load);};},[scope]);
 return value?.scope===scope?value.username:null;
}
