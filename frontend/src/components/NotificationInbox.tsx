import {useLanguage} from "../context/LanguageContext";
import {InboxItem} from "../services/notificationInbox";
export function NotificationInbox({rows,pending,error,cursor,onReload,onMore,onOpen}:{rows:InboxItem[];pending:boolean;error:boolean;cursor:string|null;onReload:()=>void;onMore:()=>void;onOpen:(item:InboxItem)=>void}){
  const {language}=useLanguage(),en=language==="en";
  return <section className="notification-inbox" aria-label={en?"Your notifications":"Thông báo của bạn"} aria-busy={pending}>
    {pending&&<p role="status">{en?"Loading notifications…":"Đang tải thông báo…"}</p>}
    {error&&<p role="alert">{en?"Could not confirm notifications or read status. Reload to check.":"Chưa xác nhận được thông báo hoặc trạng thái đã đọc. Tải lại để kiểm tra."}</p>}
    {!pending&&!error&&rows.length===0&&<p>{en?"No notifications yet.":"Chưa có thông báo."}</p>}
    <div className="notification-inbox-items">{rows.map(n=>{const text=en&&n.translations?.en?n.translations.en:n,source=n.source;return <button type="button" key={n.id} className="notification-item" data-read={!!n.readAt} onClick={()=>onOpen(n)}>
      <strong>{text.title}</strong><span>{text.message}</span>
      <small>{source?(!["SUPPORT_MESSAGE","SUPPORT_TICKET"].includes(source.kind)?(source.kind==="SELLER_FOLLOW_EVENT"?(en?"Followed seller · verified chain event":"Seller đang theo dõi · sự kiện chain đã xác minh"):(en?"Verified chain event":"Sự kiện chain đã xác minh"))+(source.blockNumber!==undefined?` · Block ${source.blockNumber}`:""):(source.kind==="SUPPORT_TICKET"?(en?"Support ticket update":"Cập nhật ticket hỗ trợ"):(en?"Order support message":"Tin nhắn hỗ trợ theo đơn"))):(en?"Legacy notification: event source unavailable":"Thông báo cũ: chưa có nguồn sự kiện")}</small>
      <time dateTime={new Date(source?.occurredAt??n.createdAt).toISOString()}>{new Date(source?.occurredAt??n.createdAt).toLocaleString(en?"en-GB":"vi-VN")}</time>
      {source&&<small className="notification-source" title={source.eventId}>{source.eventId}</small>}
      <small>{n.readAt?(en?"Read":"Đã đọc"):(en?"Unread":"Chưa đọc")}</small>
    </button>;})}</div>
    <div className="notification-inbox-actions"><button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={onReload}>{en?"Reload notifications":"Tải lại thông báo"}</button>{cursor&&<button type="button" className="btn btn-sm btn-secondary" disabled={pending} onClick={onMore}>{en?"Older notifications":"Thông báo trước"}</button>}</div>
  </section>;
}
