import { useDealLanguage } from "./DealPresentation";
import { UiMessage, UiError, uiMessage, messageText, errorMessage } from "../utils/uiMessage";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

type DraftRow={id:string;title:string;draftVersion:number;publicationLocked:boolean};
export function SavedCampaignDrafts({onOpen,busy}:{onOpen:(id:string)=>void;busy:boolean}){
 const {language,text}=useDealLanguage();
  const {token}=useAuth();const [rows,setRows]=useState<DraftRow[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<UiMessage|null>(null),[revision,setRevision]=useState(0);
 const controller=useRef<AbortController|null>(null);
 const load=async(after?:string)=>{
  controller.current?.abort();const request=new AbortController();controller.current=request;setLoading(true);setError(null);
  try{
   const response=await fetch("/api/seller/campaign-drafts"+(after?`?after=${encodeURIComponent(after)}`:""),{headers:{Authorization:`Bearer ${token}`},signal:request.signal});
   if(!response.ok)throw new UiError(uiMessage("Không tải được bản nháp đã lưu. Thử lại khi kết nối ổn định.","Could not load saved drafts. Retry when the connection is stable."));const data=await response.json();if(request.signal.aborted)return;
   setRows(old=>after?[...old,...data.drafts.filter((draft:DraftRow)=>!old.some(row=>row.id===draft.id))]:data.drafts);setCursor(data.pagination.nextCursor);
  }catch(e){if(!request.signal.aborted)setError(errorMessage(e,uiMessage("Không tải được bản nháp","Could not load drafts")));}finally{if(!request.signal.aborted)setLoading(false);}
 };
 useEffect(()=>{setRows([]);void load();return()=>controller.current?.abort();},[token,revision]);
 return <section className="glass-card" aria-labelledby="saved-drafts-title"><h2 id="saved-drafts-title">{text("Bản nháp đã lưu","Saved drafts")}</h2><p>{text("Mở lại từ tài khoản seller này. Điều khoản đã ghim với publish intent được giữ để phục hồi.","Reopen drafts owned by this seller account. Terms pinned to a publish intent are preserved for recovery.")}</p>{loading&&<p role="status">{text("Đang tải bản nháp…","Loading drafts…")}</p>}{error&&<p className="notice notice-error" role="alert">{messageText(error,language)}</p>}
 {!error&&<ul className="operator-order-list">{rows.map(row=><li key={row.id}><h3>{row.title}</h3><p>Version {row.draftVersion} · {row.publicationLocked?text("Đã ghim publish intent","Publish intent pinned"):text("Có thể sửa trước publish","Editable before publication")}</p><button className="btn btn-secondary" type="button" disabled={busy||loading} onClick={()=>onOpen(row.id)}>{text("Mở bản nháp ","Open draft ")}{row.title}</button></li>)}</ul>}
 {!loading&&!error&&rows.length===0&&<p>{text("Chưa có bản nháp đã lưu.","No saved drafts yet.")}</p>}<div className="action-row"><button className="btn btn-secondary" type="button" disabled={busy||loading} onClick={()=>setRevision(value=>value+1)}>{text("Tải lại bản nháp","Reload drafts")}</button>{cursor&&!error&&<button className="btn btn-secondary" type="button" disabled={busy||loading} onClick={()=>void load(cursor)}>{text("Tải thêm bản nháp","Load more drafts")}</button>}</div></section>;
}
