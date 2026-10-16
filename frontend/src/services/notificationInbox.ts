import {useEffect,useRef,useState} from "react";
export type InboxItem={id:string;userId:string;type:string;title:string;message:string;link?:string;createdAt:number;readAt?:number;translations?:{en:{title:string;message:string}};source?:{kind:string;eventId:string;occurredAt:number;eventName?:string;blockNumber?:number}};
const idPattern=/^[A-Za-z0-9_-]{1,180}$/;
const timestamp=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
function item(value:unknown,userId:string):InboxItem {
  const n=value as InboxItem;if(!n||!idPattern.test(n.id)||n.userId!==userId||typeof n.title!=="string"||n.title.length>500||typeof n.message!=="string"||n.message.length>64000||typeof n.type!=="string"||!timestamp(n.createdAt)||n.readAt!==undefined&&!timestamp(n.readAt))throw new Error("INVALID_NOTIFICATION");
  let source:InboxItem["source"];
  if(n.source){const s=n.source as any;
    if(!["CHAIN_EVENT","SELLER_FOLLOW_EVENT","SUPPORT_MESSAGE","SUPPORT_TICKET"].includes(s.kind)||typeof s.eventId!=="string"||s.eventId.length>220||!timestamp(s.occurredAt))throw new Error("INVALID_SOURCE");
    if(["CHAIN_EVENT","SELLER_FOLLOW_EVENT"].includes(s.kind)&&(typeof s.eventName!=="string"||s.eventName.length>80||!Number.isSafeInteger(s.blockNumber)||s.blockNumber<0||!Number.isSafeInteger(s.chainId)||s.chainId<=0||!Number.isSafeInteger(s.logIndex)||s.logIndex<0||!/^0x[a-fA-F0-9]{64}$/.test(s.txHash)||!/^0x[a-fA-F0-9]{64}$/.test(s.blockHash)||!/^0x[a-fA-F0-9]{40}$/.test(s.hubAddress)||s.eventId!==`${s.chainId}_${s.hubAddress.toLowerCase()}_${s.txHash.toLowerCase()}_${s.logIndex}`))throw new Error("INVALID_SOURCE");
    if(s.kind==="SUPPORT_MESSAGE"&&(!idPattern.test(s.eventId)||!idPattern.test(s.orderId)))throw new Error("INVALID_SOURCE");
    if(s.kind==="SELLER_FOLLOW_EVENT"&&(!/^[A-Za-z0-9_-]{1,128}$/.test(s.sellerId)||!idPattern.test(s.campaignId)||n.link!=="#campaign-"+s.campaignId||n.type!=="SELLER_FOLLOW_"+s.eventName))throw new Error("INVALID_SOURCE");
    if(s.kind==='SUPPORT_TICKET'&&(!/^support_command_[a-f0-9]{64}$/.test(s.eventId)||!/^tkt_[a-f0-9-]{36}$/.test(s.ticketId)||n.link!=='#support-ticket-'+s.ticketId||n.type!=='SUPPORT_TICKET_EVENT'))throw new Error('INVALID_SOURCE');
    source={kind:s.kind,eventId:s.eventId,occurredAt:s.occurredAt,...(["CHAIN_EVENT","SELLER_FOLLOW_EVENT"].includes(s.kind)?{eventName:s.eventName,blockNumber:s.blockNumber}:{})};
  }
  const en=n.translations?.en,translations=en&&typeof en.title==="string"&&en.title.length<=500&&typeof en.message==="string"&&en.message.length<=64000?{en:{title:en.title,message:en.message}}:undefined;
  const orderId=(n.source as any)?.orderId;
  const link=n.link==='#orders'&&source&&typeof orderId==='string'&&idPattern.test(orderId)?'#order-'+orderId:typeof n.link==="string"&&(/^(?:#orders|#seller|#operator)$/.test(n.link)||/^#(?:campaign|order)-[A-Za-z0-9_-]{1,180}$/.test(n.link)||/^#support-ticket-tkt_[a-f0-9-]{36}$/.test(n.link))?n.link:undefined;
  return {id:n.id,userId:n.userId,type:n.type,title:n.title,message:n.message,createdAt:n.createdAt,...(n.readAt!==undefined?{readAt:n.readAt}:{}),...(source?{source}:{}),...(translations?{translations}:{}),...(link?{link}:{})};
}
export function useNotificationInbox(token:string|null,userId:string|undefined){
  const [state,setState]=useState<{token:string|null;userId:string|undefined;rows:InboxItem[];unread:number;cursor:string|null}>({token:null,userId:undefined,rows:[],unread:0,cursor:null});
  const [pending,setPending]=useState(false),[error,setError]=useState(false);
  const scope=useRef({token,userId}),epoch=useRef(0),loading=useRef(false),reads=useRef(new Set<string>()),revision=useRef(0),controllers=useRef(new Set<AbortController>());scope.current={token,userId};
  const browsingOlder=useRef(false);
  const request=async(path:string,init:RequestInit={})=>{const controller=new AbortController();controllers.current.add(controller);const timeout=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(path,{...init,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},signal:controller.signal});if(!response.ok)throw new Error("NOTIFICATION_REQUEST_FAILED");return await response.json();}finally{clearTimeout(timeout);controllers.current.delete(controller);}};
  const current=(ownEpoch:number)=>scope.current.token===token&&scope.current.userId===userId&&epoch.current===ownEpoch;
  const load=async(cursor?:string)=>{
    if(!token||!userId||loading.current||reads.current.size)return;loading.current=true;setPending(true);const ownEpoch=epoch.current,ownRevision=revision.current;
    try{
      const value=await request("/api/notifications?limit=20"+(cursor?"&cursor="+encodeURIComponent(cursor):""));
      if(!Array.isArray(value.notifications)||value.notifications.length>100||!Number.isSafeInteger(value.unread)||value.unread<0)throw new Error("INVALID_PAGE");
      const rows=value.notifications.map((n:unknown)=>item(n,userId));if(new Set(rows.map((n:InboxItem)=>n.id)).size!==rows.length)throw new Error("INVALID_PAGE");
      const next=value.pagination?.nextCursor??null;if(next!==null&&(typeof next!=="string"||next.length>1024))throw new Error("INVALID_CURSOR");
      if(current(ownEpoch)&&ownRevision===revision.current&&!reads.current.size){browsingOlder.current=!!cursor;setState(previous=>({token,userId,rows:cursor&&previous.token===token&&previous.userId===userId?[...previous.rows,...rows.filter((n:InboxItem)=>!previous.rows.some(p=>p.id===n.id))]:rows,unread:value.unread,cursor:next}));setError(false);}
    }catch{if(current(ownEpoch)){setError(true);setState({token,userId,rows:[],unread:0,cursor:null});}}
    finally{if(current(ownEpoch)){loading.current=false;setPending(false);}}
  };
  useEffect(()=>{
    epoch.current++;loading.current=false;reads.current.clear();revision.current++;browsingOlder.current=false;setError(false);setPending(false);
    if(token&&userId){void load();const timer=setInterval(()=>{if(!browsingOlder.current)void load();},30000);return()=>{clearInterval(timer);epoch.current++;for(const controller of controllers.current)controller.abort();};}
    return()=>{epoch.current++;for(const controller of controllers.current)controller.abort();};
  },[token,userId]);
  const markRead=async(n:InboxItem)=>{
    if(!token||!userId||n.userId!==userId||reads.current.has(n.id))return false;const ownEpoch=epoch.current;if(n.readAt)return current(ownEpoch);
    reads.current.add(n.id);revision.current++;
    try{
      const value=await request("/api/notifications/"+encodeURIComponent(n.id)+"/read",{method:"POST"}),confirmed=item(value.notification,userId);
      if(confirmed.id!==n.id||!confirmed.readAt)throw new Error("READ_UNCONFIRMED");
      if(current(ownEpoch)){revision.current++;setState(previous=>{if(previous.token!==token||previous.userId!==userId)return previous;const wasUnread=previous.rows.some(p=>p.id===n.id&&!p.readAt);return {...previous,rows:previous.rows.map(p=>p.id===n.id?confirmed:p),unread:Math.max(0,previous.unread-(wasUnread?1:0))};});setError(false);}
    }catch{if(current(ownEpoch))setError(true);return false;}
    finally{if(current(ownEpoch))reads.current.delete(n.id);}
    return current(ownEpoch);
  };
  const visible=state.token===token&&state.userId===userId?state:{rows:[],unread:0,cursor:null};
  return {...visible,pending,error,reload:()=>load(),more:()=>visible.cursor?load(visible.cursor):Promise.resolve(),markRead};
}
