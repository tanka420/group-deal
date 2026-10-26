import {useEffect,useRef,useState} from 'react';
import { useAuth } from "../context/AuthContext";
import {useLanguage} from '../context/LanguageContext';
import {ResourceGrant,BuyerResourceError,loadResourceGrants,activateResourceGrant,downloadResourceGrant} from '../services/buyerResources';
export function BuyerResources({orderId}:{orderId:string}) {
  const {user,token,getSessionEpoch}=useAuth(),{language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
  const scope={userId:user?.id,token,orderId},current=useRef(scope);current.current=scope;
  const [view,setView]=useState<{owner:typeof scope;grants:ResourceGrant[];loading:boolean;error:string|null;busy:string|null;progress:number;notice:'ACTIVATED'|'DOWNLOADED'|null}>({owner:scope,grants:[],loading:true,error:null,busy:null,progress:0,notice:null});
  const request=useRef<AbortController|null>(null),urlRefs=useRef(new Set<string>());
  const visible=view.owner.userId===user?.id&&view.owner.token===token&&view.owner.orderId===orderId,grants=visible?view.grants:[];
  function valid(owner:typeof scope,controller:AbortController,epoch:number){return !controller.signal.aborted&&current.current.userId===owner.userId&&current.current.token===owner.token&&current.current.orderId===owner.orderId&&getSessionEpoch()===epoch;}
  function failure(error:unknown){return error instanceof BuyerResourceError?error.code:'RESOURCE_UNAVAILABLE';}
  async function load(){
    if(request.current||!token||!user?.id)return;const owner=scope,epoch=getSessionEpoch(),controller=new AbortController();request.current=controller;const timer=setTimeout(()=>controller.abort(),15000);
    setView(v=>({...v,owner,grants:[],loading:true,error:null,notice:null}));
    try{const rows=await loadResourceGrants(token,user.id,orderId,controller.signal);if(valid(owner,controller,epoch))setView(v=>({...v,grants:rows,loading:false}));}
    catch(e){if(request.current===controller&&current.current.userId===owner.userId&&current.current.token===owner.token&&current.current.orderId===owner.orderId&&getSessionEpoch()===epoch)setView(v=>({...v,grants:[],loading:false,error:failure(e)}));}
    finally{clearTimeout(timer);if(request.current===controller)request.current=null;}
  }
  useEffect(()=>{request.current?.abort();request.current=null;setView({owner:scope,grants:[],loading:true,error:null,busy:null,progress:0,notice:null});void load();return()=>{request.current?.abort();request.current=null;for(const url of urlRefs.current)URL.revokeObjectURL(url);urlRefs.current.clear();};},[user?.id,token,orderId]);
  const act=async(grant:ResourceGrant,redeem:boolean)=>{
    if(request.current||!token||!user?.id||!visible)return;const owner=scope,epoch=getSessionEpoch(),controller=new AbortController();request.current=controller;const timer=setTimeout(()=>controller.abort(),60000);
    setView(v=>({...v,busy:grant.id,error:null,progress:0,notice:null}));
    try{
      if(redeem){await activateResourceGrant(token,orderId,grant,controller.signal);const rows=await loadResourceGrants(token,user.id,orderId,controller.signal);if(valid(owner,controller,epoch))setView(v=>({...v,grants:rows,notice:'ACTIVATED'}));}
      else{
        const blob=await downloadResourceGrant(token,grant,controller.signal,bytes=>{if(valid(owner,controller,epoch))setView(v=>({...v,progress:Math.floor(bytes/grant.byteLength*100)}));});
        if(!valid(owner,controller,epoch))return;
        const objectUrl=URL.createObjectURL(blob);urlRefs.current.add(objectUrl);const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=grant.fileName;anchor.click();setView(v=>({...v,notice:'DOWNLOADED'}));window.setTimeout(()=>{URL.revokeObjectURL(objectUrl);urlRefs.current.delete(objectUrl);},1000);
      }
    }catch(e){if(request.current===controller&&current.current.userId===owner.userId&&current.current.token===owner.token&&current.current.orderId===owner.orderId&&getSessionEpoch()===epoch)setView(v=>({...v,error:failure(e)}));}
    finally{clearTimeout(timer);if(request.current===controller){request.current=null;setView(v=>({...v,busy:null,progress:0}));}}
  };
  const error=visible?view.error:null,busy=visible?view.busy:null,loading=!visible||view.loading;
  const errorText=error==='LICENSE_EXPIRED'?text('Thời hạn license đã kết thúc. Liên hệ hỗ trợ của đơn.','The license period has ended. Contact order support.'):error==='ACTIVATION_WINDOW_EXPIRED'?text('Đã hết hạn kích hoạt. Liên hệ hỗ trợ của đơn.','The activation window has ended. Contact order support.'):error==='RESOURCE_INTEGRITY_FAILED'?text('Chưa xác minh được tính toàn vẹn tệp; bản tải chưa được lưu.','File integrity could not be verified; the download was not saved.'):text('Chưa hoàn tất thao tác. Tải lại quyền truy cập để kiểm tra trước khi thử lại.','The action was not completed. Reload access to check its status before retrying.');
  const date=(n:number)=>new Date(n).toLocaleString(language==='en'?'en-GB':'vi-VN');
  return <section className="resource-library" aria-label={text('Tài nguyên đã mua','Purchased resources')}><h4>{text('Tài nguyên và license của đơn','Order resources and licenses')}</h4>
    {loading&&<p role="status">{text('Đang tải quyền truy cập…','Loading resource access…')}</p>}{error&&<p role="alert" className="notice notice-error">{errorText}</p>}
    {visible&&view.notice&&<p role="status">{view.notice==='ACTIVATED'?text('Đã xác nhận kích hoạt quyền truy cập.','Resource activation confirmed.'):text('Đã kiểm tra tính toàn vẹn và bắt đầu lưu tệp.','File integrity verified; saving has started.')}</p>}
    <ul className="record-scroll-stack">{grants.map(grant=><li key={grant.id}><div><strong>{grant.fileName}</strong><p>{text('Đơn vị','Unit')} {grant.unitIndex+1} · {grant.seatsPerUnit} seat · {grant.byteLength<1024?grant.byteLength+' B':(grant.byteLength/1024).toFixed(1)+' KiB'}</p>
      <p>{grant.licenseExpiresAt===null?text('License không đặt ngày hết hạn.','No license expiry date.'):text('License đến: ','License ends: ')+date(grant.licenseExpiresAt)}</p>
      {grant.requiresRedemption&&<p>{grant.activationDeadline===null?text('Chưa kích hoạt; không đặt hạn kích hoạt.','Not activated; no activation deadline.'):text('Hạn kích hoạt: ','Activate by: ')+date(grant.activationDeadline)}</p>}
      {grant.accessStatus==='LICENSE_EXPIRED'&&<p>{text('License đã hết hạn. Quyền và lịch sử đơn được giữ nguyên.','License expired. The order rights and history are retained.')}</p>}
      {grant.accessStatus==='ACTIVATION_WINDOW_EXPIRED'&&<p>{text('Đã hết hạn kích hoạt; liên hệ hỗ trợ của đơn.','Activation window expired; contact order support.')}</p>}
      {busy===grant.id&&view.progress>0&&<p role="status">{text('Đang nhận tệp: ','Receiving file: ')}{view.progress}%</p>}
      </div>
      {grant.canRedeem&&<button type="button" className="btn btn-primary" disabled={!!busy} onClick={()=>void act(grant,true)}>{busy===grant.id?text('Đang kích hoạt…','Activating…'):text('Kích hoạt mã truy cập','Activate access license')}</button>}
      {grant.downloadReady&&<button type="button" className="btn btn-primary" disabled={!!busy} onClick={()=>void act(grant,false)}>{busy===grant.id?text('Đang tải…','Downloading…'):text('Tải tài nguyên','Download resource')}</button>}
    </li>)}</ul>{!loading&&!error&&grants.length===0&&<p>{text('Quyền tải đang chờ xác minh delivery.','Resource access is awaiting delivery verification.')}</p>}
    <button type="button" className="btn btn-secondary" disabled={loading||!!busy} onClick={()=>void load()}>{text('Tải lại quyền truy cập','Reload resource access')}</button>
  </section>;
}
