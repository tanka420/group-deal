import {ARC_CHAIN_ID,ARC_EXPLORER,ARC_CHAIN_NAME} from '../../../shared/network.mjs';
import { type UiMessage, uiMessage, messageText } from "../utils/uiMessage";
import React,{useEffect,useRef,useState} from "react";
import {ethers} from "ethers";
import {useAuth} from "../context/AuthContext";
import {useExternalWallet} from "../context/ExternalWalletContext";
import {useLanguage} from "../context/LanguageContext";
import {WalletRow,WalletIntent,WalletCheckpoint,readWalletInventory,readWalletIntent,walletCheckpoint} from "../services/walletBinding";
import {InitialCircleWalletChoice} from "./InitialCircleWalletChoice";

export function WalletManager({token,userId,embedded=false}:{token:string;userId:string;embedded?:boolean}){
 const {language}=useLanguage(),en=language==="en",{user:accountUser,circleCredentials,executeCircleMessageChallenge,refreshUser}=useAuth(),external=useExternalWallet();
 const [open,setOpen]=useState(embedded),[rows,setRows]=useState<WalletRow[]>([]),[cursor,setCursor]=useState<string|null>(null),[source,setSource]=useState(""),[target,setTarget]=useState("");
 const [checkpoint,setCheckpoint]=useState<WalletCheckpoint|null>(()=>walletCheckpoint(userId)),[intent,setIntent]=useState<WalletIntent|null>(null),[pending,setPending]=useState(false),[unknown,setUnknown]=useState(Boolean(checkpoint)),[missing,setMissing]=useState(false),[error,setError]=useState<UiMessage | null>(null),[message,setMessage]=useState<UiMessage | null>(null),[signed,setSigned]=useState({source:false,target:false}),[loadedFor,setLoadedFor]=useState<string|null>(null);
 const epoch=useRef(0),locked=useRef(false),signatures=useRef<{source?:string;target?:string}>({}),controller=useRef<AbortController|null>(null),status=useRef<HTMLParagraphElement>(null);
 const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"},storageKey="groupdeal_wallet_intent_"+userId;
 const alive=(generation:number)=>generation===epoch.current;
 const text=(vi:string,english:string)=>en?english:vi;
 const resetProofs=()=>{signatures.current={};setSigned({source:false,target:false});};
 useEffect(()=>{epoch.current++;locked.current=false;resetProofs();setPending(false);setIntent(null);setCheckpoint(walletCheckpoint(userId));setUnknown(Boolean(walletCheckpoint(userId)));setMissing(false);setRows([]);setLoadedFor(null);setError(null);setMessage(null);return()=>{epoch.current++;controller.current?.abort();signatures.current={};};},[token,userId,open]);
 useEffect(()=>{if(open)void load();},[open,token,userId,accountUser?.circleWallet?.walletId]);
 useEffect(()=>{if(error||message)status.current?.focus();},[error,message]);
 async function json(path:string,body?:unknown){controller.current?.abort();const abort=new AbortController();controller.current=abort;const response=await fetch(path,{method:body===undefined?"GET":"POST",headers,cache:"no-store",signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15_000)]),...(body===undefined?{}:{body:JSON.stringify(body)})});if(!response.ok)throw Object.assign(new Error("WALLET_REQUEST_UNCONFIRMED"),{status:response.status});return response.json();}
 async function load(more=false){if(locked.current)return;locked.current=true;const generation=epoch.current;setPending(true);setError(null);
  try{const page=readWalletInventory(await json("/api/auth/wallets?limit=20"+(more&&cursor?"&cursor="+encodeURIComponent(cursor):"")),userId);if(!alive(generation))return;setRows(old=>more?Array.from(new Map([...old,...page.wallets].map(r=>[r.address.toLowerCase(),r])).values()):page.wallets);setCursor(page.cursor);setLoadedFor(token);if(!more)setSource(page.wallets.find(r=>r.selected)?.address||page.wallets[0]?.address||"");}
  catch{if(alive(generation))setError(uiMessage("Chưa tải được các ví đã xác minh. Thử lại khi có kết nối.","Unable to load verified wallets. Retry when connected."));}finally{if(alive(generation)){setPending(false);locked.current=false;}}
 }
 async function prepare(saved=false){if(locked.current||!saved&&checkpoint||!saved&&(!ethers.isAddress(source)||!ethers.isAddress(target)||target===ethers.ZeroAddress)||saved&&(!missing||!checkpoint))return;locked.current=true;const generation=epoch.current;setPending(true);setError(null);setMessage(null);resetProofs();setMissing(false);
  const request:WalletCheckpoint=saved?checkpoint!:{id:crypto.randomUUID(),userId,sourceWallet:ethers.getAddress(source),targetWallet:ethers.getAddress(target),origin:location.origin};
  try{localStorage.setItem(storageKey,JSON.stringify(request));setCheckpoint(request);const result=readWalletIntent(await json("/api/auth/wallet-intents",{idempotencyKey:request.id,sourceWallet:request.sourceWallet,targetWallet:request.targetWallet}),request);if(!alive(generation))return;if(result.state!=="PENDING")throw new Error();setIntent(result);setUnknown(false);}
  catch{if(alive(generation)){setUnknown(true);setError(uiMessage("Chưa nhận được yêu cầu khớp tài khoản. Kiểm tra yêu cầu đã lưu trước khi tiếp tục.","No matching request received. Check the saved request before continuing."));}}finally{if(alive(generation)){setPending(false);locked.current=false;}}
 }
 async function recover(){if(locked.current||!checkpoint)return;locked.current=true;const generation=epoch.current;setPending(true);setError(null);
  try{const result=readWalletIntent(await json("/api/auth/wallet-intents/"+checkpoint.id),checkpoint);if(!alive(generation))return;setIntent(result);setUnknown(false);setMissing(false);if(result.state==="COMMITTED")await confirmed(result,generation);else setMessage(uiMessage("Đã lấy trạng thái của đúng yêu cầu. Tiếp tục bằng thao tác xác nhận bên dưới.","Retrieved this request's status. Continue with an explicit action below."));}
  catch(e){if(alive(generation)){setUnknown(true);setMissing(e instanceof Error&&"status" in e&&e.status===404);setError(uiMessage("Chưa xác minh được trạng thái yêu cầu. Không ký hoặc gửi yêu cầu mới lúc này.","Unable to verify this request. Do not sign or send a new request yet."));}}finally{if(alive(generation)){setPending(false);locked.current=false;}}
 }
 async function confirmed(result:WalletIntent,generation:number){if(!alive(generation)||result.state!=="COMMITTED")return;localStorage.removeItem(storageKey);setCheckpoint(null);setIntent(null);resetProofs();setUnknown(false);setRows([]);setLoadedFor(null);setMessage(result.selectionCurrent?uiMessage("Máy chủ đã xác nhận ví hoạt động. Các ví đăng nhập cũ và principal của đơn cũ được giữ nguyên.","Server confirmed the active wallet. Previous sign-in wallets and existing order principals are retained."):uiMessage("Yêu cầu đã hoàn tất, nhưng ví hoạt động đã đổi sau đó. Đang tải lựa chọn hiện tại.","This request completed, but the active wallet changed later. Loading the current selection."));await refreshUser();if(!alive(generation))return;
  try{const page=readWalletInventory(await json("/api/auth/wallets?limit=20"),userId);if(!alive(generation))return;setRows(page.wallets);setCursor(page.cursor);setSource(page.wallets.find(r=>r.selected)?.address||page.wallets[0]?.address||"");setLoadedFor(token);}catch{if(alive(generation))setError(uiMessage("Đổi ví đã được xác nhận, nhưng chưa tải lại được danh sách. Bấm tải lại danh sách ví; không gửi lại yêu cầu đổi ví.","Wallet change confirmed, but the list could not be reloaded. Reload the wallet list; do not resubmit the change."));}
 }
 async function sign(role:"SOURCE"|"TARGET"){
  if(locked.current||!intent||intent.state!=="PENDING"||unknown)return;locked.current=true;const generation=epoch.current;setPending(true);setError(null);setMessage(null);
  const expected=role==="SOURCE"?intent.sourceWallet:intent.targetWallet,message=role==="SOURCE"?intent.sourceMessage:intent.targetMessage,row=rows.find(r=>r.address.toLowerCase()===expected.toLowerCase());
  try{let signature:string;
   if(row?.kind==="CIRCLE"){
    if(!circleCredentials)throw new Error();const data=await json(`/api/auth/wallet-intents/${intent.id}/circle/${role}`,{userToken:circleCredentials.userToken});if(!alive(generation))return;
    if(data.id!==intent.id||data.userId!==userId||data.role!==role||data.walletAddress?.toLowerCase()!==expected.toLowerCase()||data.messageHash!==ethers.hashMessage(message)||typeof data.challengeId!=="string"||! /^[a-f0-9-]{36}$/i.test(data.challengeId))throw new Error();signature=await executeCircleMessageChallenge(data.challengeId);
   }else{
    await external.connect();if(!alive(generation))return;const signer=await external.getSigner();if((await signer.getAddress()).toLowerCase()!==expected.toLowerCase()||Number((await signer.provider?.getNetwork())?.chainId)!==ARC_CHAIN_ID)throw new Error();if(!alive(generation))return;signature=await signer.signMessage(message);if((await signer.getAddress()).toLowerCase()!==expected.toLowerCase())throw new Error();
   }
   if(!alive(generation))return;if(!/^0x[0-9a-fA-F]{130}$/.test(signature)||ethers.verifyMessage(message,signature).toLowerCase()!==expected.toLowerCase())throw new Error();
   if(role==="SOURCE"){signatures.current.source=signature;if(intent.sourceMessage===intent.targetMessage)signatures.current.target=signature;}else signatures.current.target=signature;setSigned({source:Boolean(signatures.current.source),target:Boolean(signatures.current.target)});
  }catch{if(alive(generation))setError(uiMessage(`Chưa xác nhận được chữ ký. Chọn đúng địa chỉ trên ${ARC_CHAIN_NAME}; ví Circle cần phiên ký đã xác thực. Không có yêu cầu đổi ví nào được gửi.`,`Signature unconfirmed. Select the exact address on ${ARC_CHAIN_NAME}; Circle needs an authenticated signing session. No wallet change was submitted.`));}finally{if(alive(generation)){setPending(false);locked.current=false;}}
 }
 async function commit(){if(locked.current||!intent||!checkpoint||unknown||!signatures.current.source||!signatures.current.target)return;locked.current=true;const generation=epoch.current;setPending(true);setError(null);setMessage(null);
  try{const result=readWalletIntent(await json(`/api/auth/wallet-intents/${intent.id}/commit`,{sourceSignature:signatures.current.source,targetSignature:signatures.current.target}),checkpoint);if(!alive(generation))return;if(result.state!=="COMMITTED")throw new Error();await confirmed(result,generation);}
  catch{if(alive(generation)){setUnknown(true);setError(uiMessage("Chưa nhận xác nhận đổi ví. Kiểm tra đúng yêu cầu này; không tự gửi lại chữ ký.","Wallet change unconfirmed. Check this request; signatures will not be resubmitted automatically."));}}finally{if(alive(generation)){setPending(false);locked.current=false;}}
 }
 async function cancel(){if(locked.current||!intent||!checkpoint||unknown||intent.state!=="PENDING")return;locked.current=true;const generation=epoch.current;setPending(true);setError(null);setMessage(null);try{const result=readWalletIntent(await json(`/api/auth/wallet-intents/${intent.id}/cancel`,{}),checkpoint);if(!alive(generation))return;if(result.state!=="CANCELLED")throw new Error();setIntent(result);resetProofs();setMessage(uiMessage("Máy chủ đã hủy yêu cầu; chữ ký cũ không còn dùng được cho yêu cầu này.","Server cancelled this request; its old signatures can no longer be used."));}catch{if(alive(generation)){setUnknown(true);setError(uiMessage("Chưa nhận được xác nhận hủy. Kiểm tra yêu cầu này.","Cancellation unconfirmed. Check this request."));}}finally{if(alive(generation)){setPending(false);locked.current=false;}}}
 const busy=pending||loadedFor!==token,visible=loadedFor===token?rows:[];
 return <section className="wallet-manager" aria-label={text("Ví tài khoản","Account wallets")}>
  {!embedded&&<button className="btn btn-sm btn-secondary" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{text("Quản lý ví tài khoản","Manage account wallets")}</button>}
  {open&&<div className="wallet-manager-panel">
   <InitialCircleWalletChoice/>
   <h4>{text("Ví đăng nhập và ví hoạt động","Sign-in wallets and active wallet")}</h4>
   <p>{text("Ví đã xác minh vẫn đăng nhập vào cùng tài khoản. Thêm ví mới cần chữ ký ví đã thuộc tài khoản và ví muốn thêm. Đổi ví không chuyển quyền đơn cũ hoặc đổi ví nhận tiền của người bán.","Verified wallets still sign in to the same account. Adding a wallet requires signatures from an existing credential and the target wallet. Selection does not transfer existing orders or change seller payout wallets.")}</p>
   <button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void load()}>{text("Tải lại danh sách ví","Reload wallet list")}</button>
   {pending&&!error&&!message&&<p role="status">{text("Đang chờ kiểm tra hoặc chữ ký…","Waiting for verification or signature…")}</p>}
   {(error||message)&&<p ref={status} tabIndex={-1} role={error?"alert":"status"}>{messageText(error||message || "", language)}</p>}
   <ul className="owned-session-rows">{visible.map(row=><li key={row.address}><strong>{row.selected?text("Ví hoạt động","Active wallet"):text("Ví đăng nhập được giữ","Retained sign-in wallet")}</strong><code>{row.address}</code><span>{row.kind==="CIRCLE"?"Circle EOA":"EVM"}</span></li>)}</ul>
   {cursor&&<button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void load(true)}>{text("Xem thêm ví","More wallets")}</button>}
   {!checkpoint&&<form onSubmit={e=>{e.preventDefault();void prepare();}}>
    <label>{text("Ví đã thuộc tài khoản","Existing account wallet")}<select value={source} disabled={busy} onChange={e=>setSource(e.target.value)}><option value="">{text("Chọn ví xác minh","Select verified wallet")}</option>{visible.map(row=><option key={row.address} value={row.address}>{row.address}</option>)}</select></label>
    <label>{text("Địa chỉ ví muốn thêm hoặc chọn","Wallet address to add or select")}<input value={target} onChange={e=>setTarget(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false} required placeholder="0x…" /></label>
    <button className="btn btn-sm btn-primary" disabled={busy||!source||!ethers.isAddress(target)||target===ethers.ZeroAddress}>{text("Xem yêu cầu liên kết","Review wallet request")}</button>
   </form>}
   {checkpoint&&<div className="session-review" role="group" aria-label={text("Xem lại yêu cầu ví","Review wallet request")}>
    <p>{text("Mã yêu cầu đã lưu","Saved request ID")}: <code>{checkpoint.id}</code></p>
    <p>{text("Ví xác minh","Authorizing wallet")}: <code>{checkpoint.sourceWallet}</code></p><p>{text("Ví muốn dùng","Target wallet")}: <code>{checkpoint.targetWallet}</code></p>
    <button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void recover()}>{text("Kiểm tra yêu cầu này","Check this request")}</button>
    {missing&&unknown&&<button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void prepare(true)}>{text("Tạo lại đúng yêu cầu đã lưu","Create the same saved request")}</button>}
    {intent&&!unknown&&intent.state==="PENDING"&&<>
     <p>{text(`Chain ${ARC_CHAIN_ID} · Hạn ký 5 phút · Không gửi giao dịch hoặc tốn USDC. Hãy xem cả hai địa chỉ trước khi ký.`,`Chain ${ARC_CHAIN_ID} · Five-minute signing window · No transaction or USDC spent. Review both addresses before signing.`)}</p>
     <details><summary>{text("Xem thông điệp ký","View signing messages")}</summary><pre>{intent.sourceMessage}</pre>{intent.sourceMessage!==intent.targetMessage&&<pre>{intent.targetMessage}</pre>}</details>
     <button className="btn btn-sm btn-secondary" disabled={pending||signed.source} onClick={()=>void sign("SOURCE")}>{signed.source?text("Đã xác minh ví hiện có","Existing wallet verified"):text("1. Ký bằng ví đã thuộc tài khoản","1. Sign with existing account wallet")}</button>
     <button className="btn btn-sm btn-secondary" disabled={pending||!signed.source||signed.target} onClick={()=>void sign("TARGET")}>{signed.target?text("Đã xác minh ví muốn dùng","Target wallet verified"):text("2. Chọn và ký bằng ví muốn dùng","2. Select and sign with target wallet")}</button>
     <button className="btn btn-sm btn-primary" disabled={pending||!signed.source||!signed.target} onClick={()=>void commit()}>{text("3. Xác nhận ví hoạt động","3. Confirm active wallet")}</button>
     <button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>void cancel()}>{text("Hủy yêu cầu liên kết này","Cancel this wallet request")}</button>
    </>}
    {intent&&["EXPIRED","LOCKED","CANCELLED"].includes(intent.state)&&<><p>{text("Yêu cầu đã hết hạn, bị khóa hoặc đã hủy. Tạo yêu cầu mới để ký lại.","This request expired, was locked or cancelled. Create a new request to sign again.")}</p><button className="btn btn-sm btn-secondary" disabled={pending} onClick={()=>{localStorage.removeItem(storageKey);setCheckpoint(null);setIntent(null);resetProofs();setMessage(null);setMissing(false);}}>{text("Tạo yêu cầu mới","Create new request")}</button></>}
   </div>}
  </div>}
 </section>;
}
