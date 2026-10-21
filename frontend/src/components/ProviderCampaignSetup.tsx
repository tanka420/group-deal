import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useOperationScope} from '../hooks/useOperationScope';
import {useDealLanguage} from './DealPresentation';
import {productRequest,ProductRequestFailure} from '../services/productStudio';
import {campaignDraftFingerprint} from '../services/campaignDraftFingerprint';
import type {SavedDraft} from '../services/campaignDraftAutosave';
import type {TransactionOperation} from '../services/transactionOperations';
type Proof={id:string;campaignId:string;productVersionId:string;licenseVersionId:string;method:'WEBHOOK';packageSha256:string;byteLength:number;checkedAt:number;expiresAt:number;evidenceHash:string};
type Pending={campaignId:string;expectedVersion:number;inputFingerprint:string;commandId:string};
const opaque=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(x);
function proof(value:any,campaignId:string,versionId:string):Proof{
 const p=value?.probe;
 if(!p||!opaque(p.id)||p.campaignId!==campaignId||p.productVersionId!==versionId||!opaque(p.licenseVersionId)||p.method!=='WEBHOOK'||!/^[a-f0-9]{64}$/.test(p.packageSha256)||!Number.isSafeInteger(p.byteLength)||p.byteLength<1||p.byteLength>16777216||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=Date.now()||!Number.isSafeInteger(p.checkedAt)||p.checkedAt>Date.now()+30000||!/^0x[a-f0-9]{64}$/i.test(p.evidenceHash))throw Error('PROVIDER_PROOF_INVALID');return p;
}
export function ProviderCampaignSetup({deploymentScope,inputFingerprint,productVersionId,saveDraft,onBusy,onPrepared}:{deploymentScope:string;inputFingerprint:string;productVersionId:string;saveDraft:(current:()=>boolean)=>Promise<SavedDraft>;onBusy:(busy:boolean)=>void;onPrepared:(value:{campaign:any;operation:TransactionOperation},key:string)=>void}){
 const {user,token}=useAuth(),{text}=useDealLanguage();
 const identity=JSON.stringify([user?.id,token,deploymentScope,inputFingerprint,productVersionId]),scope=useOperationScope(identity);
 const [ready,setReady]=useState<{identity:string;pending:Pending;proof:Proof}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const callbacks=useRef({onBusy,onPrepared});callbacks.current={onBusy,onPrepared};
 useEffect(()=>{setReady(null);setError(false);setBusy(false);return()=>callbacks.current.onBusy(false);},[identity]);
 const currentReady=ready?.identity===identity?ready:null;
 const run=async(publish:boolean)=>{
  if(busy||!user?.id||!token)return;const ticket=scope.start();if(!ticket)return;setBusy(true);callbacks.current.onBusy(true);setError(false);
  try{
   const saved=await saveDraft(ticket.current);if(!ticket.current())return;
   const key='groupdeal_provider_probe:v1:'+location.origin+':'+deploymentScope+':'+user.id+':'+saved.id;
   let pending:Pending;try{pending=JSON.parse(sessionStorage.getItem(key)||'null');}catch{pending=null as any;}
   if(!pending||pending.campaignId!==saved.id||pending.expectedVersion!==saved.version||pending.inputFingerprint!==inputFingerprint||!opaque(pending.commandId))pending={campaignId:saved.id,expectedVersion:saved.version,inputFingerprint,commandId:crypto.randomUUID()};
   sessionStorage.setItem(key,JSON.stringify(pending));
   let value:any;try{value=await productRequest(token,'/api/campaigns/'+encodeURIComponent(saved.id)+'/provider-probes/'+pending.commandId);}catch(e){if(!(e instanceof ProductRequestFailure)||e.status!==404)throw e;}
   if(!ticket.current())return;
   if(value?.probe?.expiresAt<=Date.now()&&!publish){pending={...pending,commandId:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(pending));value=null;}
   if(!value){if(publish)throw Error('PROVIDER_PROOF_REQUIRED');value=await productRequest(token,'/api/campaigns/'+encodeURIComponent(saved.id)+'/provider-probe',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pending.commandId},body:JSON.stringify({expectedVersion:saved.version})});}
   if(!ticket.current())return;const verified=proof(value,saved.id,productVersionId);
   const view:any=await productRequest(token,'/api/seller/campaign-drafts/'+encodeURIComponent(saved.id));if(!ticket.current())return;
   if(view?.draft?.id!==saved.id||view.draft.version!==saved.version||view.draft.input?.deliveryMethod!=='WEBHOOK'||view.draft.input.productVersionId!==productVersionId||campaignDraftFingerprint(view.draft.input)!==inputFingerprint)throw Error('PROVIDER_DRAFT_CHANGED');
   if(!publish){setReady({identity,pending,proof:verified});return;}
   if(!currentReady||currentReady.pending.commandId!==pending.commandId||currentReady.proof.id!==verified.id)throw Error('PROVIDER_PROOF_CHANGED');
   const publishKey='publish:'+saved.id,result:any=view.publication||await productRequest(token,'/api/campaigns/'+encodeURIComponent(saved.id)+'/prepare-publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:publishKey})});
   if(!ticket.current())return;
   if(result.campaign?.id!==saved.id||result.operation?.action!=='PUBLISH'||result.operation.resourceId!==saved.id||result.operation.idempotencyKey!==publishKey)throw Error('PROVIDER_PUBLICATION_CONTEXT');
   sessionStorage.removeItem(key);callbacks.current.onPrepared(result,publishKey);
  }catch{if(ticket.current())setError(true);}finally{if(ticket.current()){setBusy(false);callbacks.current.onBusy(false);ticket.finish();}}
 };
 return <section aria-label={text('Provider giao hàng','Delivery provider')}>
  <p>{text('Webhook cấp quyền qua provider HTTPS đã cấu hình trong Tích hợp. Kiểm tra chữ ký và đúng gói cho bản nháp trước khi xuất bản.','Webhook delivery uses the HTTPS provider configured in Integrations. Verify its signed proof and the package for this draft before publishing.')}</p>
  {error&&<p role="alert" className="notice notice-error">{text('Chưa xác minh được provider hoặc bản nháp đã thay đổi. Kiểm tra cấu hình rồi thử lại.','The provider could not be verified or the draft changed. Check the configuration and retry.')}</p>}
  {currentReady&&<p role="status">{text('Đã xác minh provider và gói tải: ','Provider and download package verified: ')}{currentReady.proof.byteLength} bytes · SHA256 <span className="address-value">{currentReady.proof.packageSha256}</span></p>}
  <div className="action-row"><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void run(false)}>{busy?text('Đang kiểm tra…','Checking…'):text('Lưu draft và kiểm tra provider','Save draft and verify provider')}</button>
  {currentReady&&<button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void run(true)}>{text('Chuẩn bị điều khoản xuất bản','Prepare publication terms')}</button>}</div>
 </section>;
}
