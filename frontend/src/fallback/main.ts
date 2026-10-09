import {ethers} from 'ethers';
import {type FallbackAction,type FallbackIntent,fallbackDeployment,prepareFallback,verifyFallback,fallbackIntentFromTransaction} from '../services/fallbackAction';
import {fallbackFeeCanSign,fallbackFeeKey,fallbackFeeIsFresh} from '../services/fallbackFeeReview';
import {applyLanguage,text,errorText,type CopyKey} from './i18n';
import './style.css';
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T,input=(id:string)=>element<HTMLInputElement>(id),key='groupdeal_fallback:'+fallbackDeployment.chainId+':'+fallbackDeployment.hub.toLowerCase();
type Checkpoint={intent:FallbackIntent;phase:'PREPARED'|'AWAITING_SIGNATURE'|'SUBMITTED'|'UNKNOWN'|'RECEIPT_VERIFIED'|'REVERTED';hash?:string;candidateHash?:string};
let account:string|undefined,busy=false,acceptedFeeKey='',statusKey:CopyKey|undefined,lastError:unknown;
const wallet=()=>(window as any).ethereum as {request:(request:{method:string;params?:unknown[]})=>Promise<any>}|undefined;
const checkpoint=():Checkpoint|undefined=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&(!saved.intent||!['PREPARED','AWAITING_SIGNATURE','SUBMITTED','UNKNOWN','RECEIPT_VERIFIED','REVERTED'].includes(saved.phase)||typeof saved.intent.gasBudget!=='string'||!/^\d+$/.test(saved.intent.gasBudget)||typeof saved.intent.principal!=='string'))throw new Error('Invalid checkpoint');return saved||undefined;}catch{throw new Error('Checkpoint chưa đọc được. Giữ dữ liệu browser và kiểm lịch sử ví; chưa chuẩn bị/ký intent mới.');}};
const feeKey=(intent:FallbackIntent)=>{try{return fallbackFeeKey(intent);}catch{return '';}};
function render(){
 if(statusKey)element('status').textContent=text(statusKey);element('error').hidden=!lastError;if(lastError)element('error').textContent=errorText(lastError);
 if(account){element('wallet').removeAttribute('data-i18n');element('wallet').textContent=text('connected')+': '+account;}
 let saved:Checkpoint|undefined;try{saved=checkpoint();}catch(error){element('error').textContent=errorText(error);element('error').hidden=false;for(const id of ['sign','discard','recover','refresh-fee'])element<HTMLButtonElement>(id).disabled=true;input('fee-consent').disabled=true;return;}
 element('review').hidden=!saved;
 if(saved){const intent=saved.intent,b=intent.feeReview,valid=!!feeKey(intent);element('summary').textContent=text(('action'+intent.action) as CopyKey)+' · campaign '+intent.campaignId+' · order '+intent.orderId+'\n'+text('principal')+': '+intent.principal+'\n'+text('block')+': '+intent.blockNumber+'\n'+text('reserve')+': '+(valid?ethers.formatUnits(intent.gasBudget,18)+' USDC':text('unknownReserve'))+(intent.amount?'\n'+text('withdrawal')+': '+ethers.formatUnits(intent.amount,6)+' USDC':'')+'\n'+text('state')+': '+saved.phase;input('hash').value=saved.hash||saved.candidateHash||input('hash').value;
 element('fee-review').hidden=saved.phase!=='PREPARED';for(const [id,value] of [['fee-balance',b?.balance],['fee-network',b?.networkFee],['fee-reserve',b?.feeReserve]])element(id!).textContent=valid?ethers.formatUnits(value!,18)+' USDC':text('unknownReserve');element('fee-notice').textContent=!valid?text('feeMissing'):!fallbackFeeIsFresh(b!)?text('feeExpired'):'';
 }
 const ready=!!saved&&saved.phase==='PREPARED'&&fallbackFeeCanSign(saved.intent),consent=ready&&acceptedFeeKey===feeKey(saved!.intent);
 input('fee-consent').disabled=busy||!ready;input('fee-consent').checked=consent;
 element<HTMLButtonElement>('sign').disabled=busy||!consent;
 element<HTMLButtonElement>('refresh-fee').disabled=busy||saved?.phase!=='PREPARED';
 element<HTMLButtonElement>('discard').disabled=busy||!!saved&&!['PREPARED','REVERTED','RECEIPT_VERIFIED'].includes(saved.phase);
 element<HTMLButtonElement>('recover').disabled=busy;
}
const save=(record:Checkpoint)=>{localStorage.setItem(key,JSON.stringify(record));render();},setStatus=(value:CopyKey)=>{statusKey=value;element('status').textContent=text(value);};
const locked=async(action:()=>Promise<void>)=>{if(!navigator.locks)throw new Error('Trình duyệt cần Web Locks để giữ một lượt thao tác giữa các tab.');await navigator.locks.request(key,action);};
async function run(action:()=>Promise<void>){if(busy)return;busy=true;lastError=undefined;render();try{await action();}catch(error){lastError=error;}finally{busy=false;render();}}
async function assertWallet(principal?:string){const provider=wallet();if(!provider)throw new Error('Cần ví EIP1193 external đang giữ principal.');if(BigInt(await provider.request({method:'eth_chainId'}))!==BigInt(fallbackDeployment.chainId))throw new Error('Chọn Arc Testnet (5042002) trong ví trước khi tiếp tục.');const accounts=await provider.request({method:'eth_accounts'});if(!accounts?.[0]||principal&&accounts[0].toLowerCase()!==principal.toLowerCase())throw new Error('Kết nối đúng principal của intent; chưa gửi giao dịch.');account=ethers.getAddress(accounts[0]);return provider;}
applyLanguage();element('deployment').textContent='Chain '+fallbackDeployment.chainId+' · Hub '+fallbackDeployment.hub+' · deployment block '+fallbackDeployment.deploymentBlock;
element<HTMLSelectElement>('fallback-language').onchange=e=>{acceptedFeeKey='';applyLanguage((e.target as HTMLSelectElement).value==='en'?'en':'vi');render();};
input('fee-consent').onchange=()=>{const saved=checkpoint();acceptedFeeKey=input('fee-consent').checked&&saved&&fallbackFeeCanSign(saved.intent)?feeKey(saved.intent):'';render();};
element('connect').onclick=()=>void run(async()=>{const provider=wallet();if(!provider)throw new Error('Không tìm thấy ví external EIP1193.');await provider.request({method:'eth_requestAccounts'});acceptedFeeKey='';await assertWallet();});
element<HTMLFormElement>('prepare').onsubmit=event=>{event.preventDefault();void run(()=>locked(async()=>{
 if(checkpoint())throw new Error('Phục hồi hoặc kết thúc intent đang có trước khi chuẩn bị thao tác khác.');await assertWallet();
 const intent=await prepareFallback(input('action').value as FallbackAction,input('campaign').value,input('order').value,account!,input('reason').value);acceptedFeeKey='';save({intent,phase:'PREPARED'});input('reason').value='';setStatus('prepared');
}));};
element('refresh-fee').onclick=()=>void run(()=>locked(async()=>{
 acceptedFeeKey='';const saved=checkpoint();if(!saved||saved.phase!=='PREPARED')throw new Error('Chỉ đọc lại phí cho intent chưa ký.');await assertWallet(saved.intent.principal);const fresh=await prepareFallback(saved.intent.action,saved.intent.campaignId,saved.intent.orderId,saved.intent.principal,'',saved.intent.reasonHash);if(fresh.calldata!==saved.intent.calldata)throw new Error('Calldata intent đã đổi; chưa ký.');await assertWallet(fresh.principal);save({intent:fresh,phase:'PREPARED'});setStatus('refreshed');
}));
element('sign').onclick=()=>void run(()=>locked(async()=>{
 const saved=checkpoint();if(!saved||saved.phase!=='PREPARED'||saved.hash)throw new Error('Intent đã được tab khác giữ; dùng receipt recovery.');if(!fallbackFeeCanSign(saved.intent)||acceptedFeeKey!==feeKey(saved.intent))throw new Error('Cần xem và đồng ý phí của intent này trước khi ký.');acceptedFeeKey='';
 const provider=await assertWallet(saved.intent.principal),fresh=await prepareFallback(saved.intent.action,saved.intent.campaignId,saved.intent.orderId,saved.intent.principal,'',saved.intent.reasonHash);if(fresh.calldata!==saved.intent.calldata)throw new Error('Calldata intent đã đổi; chưa ký.');await assertWallet(fresh.principal);
 if(!fallbackFeeIsFresh(saved.intent.feeReview!)||BigInt(fresh.gasBudget)>BigInt(saved.intent.gasBudget)||fresh.amount!==saved.intent.amount){save({intent:fresh,phase:'PREPARED'});setStatus('feeChanged');return;}
 save({intent:fresh,phase:'AWAITING_SIGNATURE'});
 try{const hash=await provider.request({method:'eth_sendTransaction',params:[{from:fresh.principal,to:fallbackDeployment.hub,data:fresh.calldata,value:'0x0'}]});if(!ethers.isHexString(hash,32))throw new Error('Ví chưa trả hash hợp lệ; giữ intent và xem lịch sử ví.');save({intent:fresh,phase:'SUBMITTED',hash});setStatus('submitted');}catch(error){save({...checkpoint()!,phase:'UNKNOWN'});throw error;}
}));
element('recover').onclick=()=>void run(()=>locked(async()=>{
 const saved=checkpoint();if(!saved)throw new Error('Chưa có intent để đối chiếu receipt.');const hash=input('hash').value.trim();if(saved.hash&&saved.hash.toLowerCase()!==hash.toLowerCase())throw new Error('Hash mới chưa có chứng cứ nonce lineage; giữ hash đã gửi.');if(!ethers.isHexString(hash,32))throw new Error('Hash phải có 32 bytes.');save({...saved,candidateHash:hash});const phase=await verifyFallback(saved.intent,hash);save({...saved,hash,phase});setStatus(phase==='REVERTED'?'reverted':'verified');
}));
element('import').onclick=()=>void run(()=>locked(async()=>{
 if(checkpoint())throw new Error('Phục hồi intent hiện tại trước khi tra transaction khác.');const hash=input('existing-hash').value.trim(),intent=await fallbackIntentFromTransaction(input('action').value as FallbackAction,input('campaign').value,input('order').value,hash);acceptedFeeKey='';save({intent,phase:'UNKNOWN',candidateHash:hash});setStatus('imported');
}));
element('discard').onclick=()=>void run(()=>locked(async()=>{const saved=checkpoint();if(saved&&!['PREPARED','REVERTED','RECEIPT_VERIFIED'].includes(saved.phase))throw new Error('Intent chưa có bằng chứng kết thúc; không ký lại.');acceptedFeeKey='';localStorage.removeItem(key);input('hash').value='';setStatus('discarded');}));
window.addEventListener('storage',()=>{acceptedFeeKey='';render();});window.setInterval(render,1000);render();
