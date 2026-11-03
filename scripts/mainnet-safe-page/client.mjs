import {keccak256,formatUnits} from 'ethers';
const packet=__SAFE_REVIEW_PACKET__,$=id=>document.getElementById(id),providers=[],seen=new Set();
let selected=null,connected=null,account=null,quote=null,busy=false,locked=false,epoch=0;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const authorized=()=>packet.signingAuthorized===true&&packet.broadcastAuthorized===true;
const fresh=()=>quote&&Date.now()<Date.parse(quote.expiresAt)&&Date.now()>=Date.parse(quote.createdAt);
function status(text){$('status').textContent=text;}
function render(){ $('refresh').disabled=busy||locked;$('connect').disabled=busy||locked||!selected;$('send').disabled=busy||locked||!account||!authorized()||!fresh()||!$('consent').checked;for(const b of $('wallets').children)b.disabled=busy||locked; }
function reset(){epoch++;account=null;connected=null;$('consent').checked=false;$('account').textContent='Ví hoặc mạng đã thay đổi. Kết nối lại để kiểm tra.';render();}
function validateQuote(value){
 const tx=value?.unsignedTransaction;
 if(!tx||value.sourceFingerprint!==packet.sourceFingerprint||!same(tx.from,packet.from)||!same(tx.to,packet.factory)||!same(value.predictedSafeAddress,packet.predictedSafeAddress)
  ||!same(value.dataHash,packet.dataHash)||!same(keccak256(tx.data),packet.dataHash)||tx.chainId!=='0x13b2'||tx.value!=='0x0'||tx.type!=='0x2'
  ||JSON.stringify(value.owners?.map(a=>a.toLowerCase()))!==JSON.stringify(packet.owners.map(a=>a.toLowerCase()))||value.threshold!==2
  ||value.signingAuthorized!==packet.signingAuthorized||value.broadcastAuthorized!==packet.broadcastAuthorized||value.budgetApproved!==true
  ||BigInt(tx.gas)<=0n||BigInt(tx.maxFeePerGas)<20_000_000_000n||BigInt(tx.maxPriorityFeePerGas)>BigInt(tx.maxFeePerGas)
  ||BigInt(tx.gas)*BigInt(tx.maxFeePerGas)>BigInt(packet.maximumGasCostNative)||!/^0x[\da-f]+$/i.test(tx.nonce)
  ||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)-Date.parse(value.createdAt)!==300000)throw Error('QUOTE_INVALID');
 return value;
}
async function request(path,body){
 const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error('SERVER_UNAVAILABLE');return r.json();
}
async function refresh(){const value=await request('/quote');quote=validateQuote(value);if(value.attemptRecorded){locked=true;status('Đã có một lần yêu cầu giao dịch. Cần đối chiếu trạng thái trước khi làm tiếp.');}
 $('quote-summary').textContent='Trần phí theo quote: '+formatUnits(BigInt(quote.unsignedTransaction.gas)*BigInt(quote.unsignedTransaction.maxFeePerGas),18)+' USDC · nonce '+BigInt(quote.unsignedTransaction.nonce)+'. Hết hạn '+new Date(quote.expiresAt).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' (giờ Việt Nam).';
 $('transaction').textContent=JSON.stringify(quote.unsignedTransaction,null,2);render();return quote;
}
function addProvider(provider,name){if(!provider||typeof provider.request!=='function'||seen.has(provider))return;seen.add(provider);const item={provider,name:String(name||'Ví trình duyệt').slice(0,64)},button=document.createElement('button');button.type='button';button.textContent=item.name;button.setAttribute('aria-pressed',String(!selected));button.addEventListener('click',()=>{if(busy||locked)return;selected=item;reset();for(const b of $('wallets').children)b.setAttribute('aria-pressed',String(b===button));});providers.push(item);$('wallets').append(button);if(!selected)selected=item;$('no-wallet').hidden=true;render();}
async function checkWallet(provider){const [accounts,chain]=await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]);if(!Array.isArray(accounts)||!same(accounts[0],packet.from))throw Error('WRONG_ACCOUNT');if(BigInt(chain)!==5042n)throw Error('WRONG_CHAIN');}
function errorText(error){return ({WRONG_ACCOUNT:'Chọn đúng ví trả gas '+packet.from+' trong tiện ích ví.',WRONG_CHAIN:'Chọn Arc Mainnet (chain 5042) trong ví rồi kết nối lại.',QUOTE_INVALID:'Dữ liệu giao dịch không khớp gói đã review. Chưa yêu cầu ví ký.',CONTEXT_CHANGED:'Ví hoặc dữ liệu đã thay đổi. Cần kiểm tra lại trước khi ký.',SERVER_UNAVAILABLE:'Chưa lấy được gói hợp lệ. Kiểm tra cửa sổ chạy công cụ hoặc báo lại trong chat.'}[error?.message]||(error?.code===4001?'Anh đã hủy trong ví.':'Thao tác chưa hoàn tất. Kiểm tra trạng thái trong ví và báo lại; không tự thử gửi lần nữa.'));}
async function connect(){if(busy||locked||!selected)return;busy=true;const item=selected,current=++epoch;render();try{await item.provider.request({method:'eth_requestAccounts'});await checkWallet(item.provider);if(epoch!==current||selected!==item)throw Error('CONTEXT_CHANGED');connected=item.provider;account=packet.from;$('account').textContent=account+' · Arc Mainnet';for(const name of ['accountsChanged','chainChanged','disconnect'])connected.on?.(name,reset);status(authorized()?'Đã khớp ví trả gas. Đọc gói giao dịch rồi đánh dấu xác nhận.':'Đã khớp ví. Quyền ký/gửi chưa được duyệt nên nút ký vẫn khóa.');}catch(e){account=null;connected=null;status(errorText(e));}finally{busy=false;render();}}
async function send(){if(busy||locked||!connected||!account||!authorized()||!$('consent').checked)return;busy=true;const provider=connected,current=epoch;let attempted=false,activeQuote=null,returnedHash=null;render();try{
 await checkWallet(provider);activeQuote=await refresh();if(locked||epoch!==current||!fresh())throw Error('CONTEXT_CHANGED');await checkWallet(provider);
 await request('/attempt',{quoteId:activeQuote.quoteId});attempted=true;locked=true;await checkWallet(provider);if(epoch!==current||!fresh())throw Error('CONTEXT_CHANGED');
 status('Anh tự kiểm tra và phê duyệt trong ví. Tổng phí gas phải không vượt 0,02 USDC.');
 const hash=await provider.request({method:'eth_sendTransaction',params:[{...activeQuote.unsignedTransaction}]});
 if(typeof hash!=='string'||!/^0x[\da-f]{64}$/i.test(hash))throw Error('UNKNOWN_OUTCOME');
 returnedHash=hash;$('result').textContent='Tx hash: '+hash+'. Gửi hash này trong chat để kiểm tra receipt/finalized/Safe roles.';await request('/result',{quoteId:activeQuote.quoteId,outcome:'HASH_RETURNED',hash});status('Ví trả về tx hash. Chưa kết luận Safe đã deploy thành công.');
 }catch(e){if(attempted){try{await request('/result',{quoteId:activeQuote.quoteId,outcome:returnedHash?'HASH_RETURNED':e?.code===4001?'REJECTED':'UNKNOWN',hash:returnedHash});}catch{}locked=true;}status(returnedHash?'Ví đã trả tx hash nhưng chưa xác nhận lưu kết quả. Giữ hash và gửi trong chat để đối chiếu; không gửi lại giao dịch.':errorText(e));}finally{busy=false;render();}}
$('refresh').addEventListener('click',async()=>{if(busy||locked)return;busy=true;render();try{await refresh();status('Đã cập nhật quote. Chưa ký hoặc gửi giao dịch.');}catch(e){quote=null;status(errorText(e));}finally{busy=false;render();}});
$('connect').addEventListener('click',()=>void connect());$('consent').addEventListener('change',render);$('send').addEventListener('click',()=>void send());
try{
 if(window.self!==window.top||location.hostname!=='127.0.0.1')throw Error('QUOTE_INVALID');
 for(const a of packet.owners){const span=document.createElement('span');span.textContent=a;$('owners').append(span);}
 $('safe').textContent=packet.predictedSafeAddress+' (chưa xác minh deployment)';$('sender').textContent=packet.from;$('factory').textContent=packet.factory;
 $('authority').textContent=authorized()?'Đã duyệt phạm vi tạo Safe; anh tự xem và phê duyệt giao dịch trong ví.':'Đã chốt ngân sách 0,02 USDC. Quyền ký/gửi chưa được duyệt; nút ký đang khóa.';
 window.addEventListener('eip6963:announceProvider',e=>addProvider(e.detail?.provider,e.detail?.info?.name));window.dispatchEvent(new Event('eip6963:requestProvider'));
 for(const p of window.ethereum?.providers||[])addProvider(p,p.isRabby?'Rabby':p.isOkxWallet?'OKX Wallet':'Ví trình duyệt');
 addProvider(window.rabby,'Rabby');addProvider(window.okxwallet,'OKX Wallet');addProvider(window.ethereum,window.ethereum?.isRabby?'Rabby':'Ví trình duyệt');
 render();void refresh().catch(e=>{quote=null;$('quote-summary').textContent='Chưa có quote hợp lệ. Bấm Cập nhật phí để kiểm tra lại.';status(errorText(e));render();});setInterval(render,1000);
}catch(e){locked=true;status(errorText(e));render();}
