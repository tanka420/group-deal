import {useEffect,useRef,useState} from 'react';
import {ArchiveRestore,ChevronLeft,ChevronRight,FileText,LayoutDashboard,Mail,Menu,Scale,Settings,ShieldCheck,Users,Wrench} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';
import {DialogSurface} from './DialogSurface';
import {focusPageElement} from '../utils/focus';
import '../styles/operator-navigation.css';
export type OperatorSection='DEALS'|'DISPUTES'|'VERIFICATIONS'|'RECONCILIATION'|'LOGS'|'OUTBOX'|'OPERATIONS'|'LEGACY'|'USERS'|'SETTINGS';
export function OperatorWorkspaceNavigation({active,disputeCount,expanded,onToggle,onChange}:{active:OperatorSection;disputeCount:number|string;expanded:boolean;onToggle:()=>void;onChange:(section:OperatorSection)=>void}){
 const {language}=useLanguage(),en=language==='en',root=useRef<HTMLDivElement>(null);
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width:767px)').matches),[opened,setOpened]=useState(false);
 useEffect(()=>{const query=window.matchMedia('(max-width:767px)'),update=()=>setMobile(query.matches);query.addEventListener('change',update);update();return()=>query.removeEventListener('change',update);},[]);
 useEffect(()=>{if(mobile||!opened)return;setOpened(false);const frame=requestAnimationFrame(()=>focusPageElement(root.current?.querySelector<HTMLElement>('[aria-current="page"]')??null));return()=>cancelAnimationFrame(frame);},[mobile]);
 const items=[{id:'DEALS' as const,label:en?'Inspect deals':'Kiểm tra deal',Icon:LayoutDashboard},{id:'OUTBOX' as const,label:en?'Email outbox':'Hàng đợi email',Icon:Mail},{id:'OPERATIONS' as const,label:en?'Operations':'Vận hành',Icon:Wrench},{id:'LEGACY' as const,label:en?'Recovery data':'Dữ liệu phục hồi',Icon:ArchiveRestore},{id:'USERS' as const,label:en?'Users / Roles':'Người dùng / Vai trò',Icon:Users},{id:'SETTINGS' as const,label:en?'Settings':'Cài đặt',Icon:Settings},{id:'DISPUTES' as const,label:(en?'Dispute arbitration':'Trọng tài tranh chấp')+' ('+disputeCount+')',Icon:Scale},{id:'VERIFICATIONS' as const,label:en?'Seller and distribution rights':'Xác minh người bán & Bản quyền',Icon:ShieldCheck},{id:'RECONCILIATION' as const,label:en?'Chain reconciliation':'Đối soát CSDL & Smart Contract',Icon:ChevronRight},{id:'LOGS' as const,label:en?'Audit logs':'Nhật ký Kiểm toán',Icon:FileText}];
 const title=en?'Workspace sections':'Các mục workspace';
 const list=(drawer=false)=><nav className="operator-navigation-list" aria-label={title}>{items.map(({id,label,Icon})=><button type="button" key={id} className={'btn btn-sm '+(active===id?'btn-primary':'btn-secondary')} title={label} aria-current={active===id?'page':undefined} aria-controls="operator-workspace-content" onClick={()=>{if(drawer)setOpened(false);onChange(id);}}><Icon size={19} aria-hidden="true"/><span className="operator-navigation-label">{label}</span></button>)}</nav>;
 return <div ref={root} className={'workspace-tabs operator-workspace-nav'+(expanded?' is-expanded':'')}>
  <button type="button" className="btn btn-secondary operator-menu-trigger" aria-label={en?'Open workspace menu':'Mở menu workspace'} aria-haspopup="dialog" aria-expanded={mobile&&opened} aria-controls="operator-workspace-drawer" onClick={()=>setOpened(true)}><Menu size={20} aria-hidden="true"/><span>{items.find(item=>item.id===active)?.label}</span></button>
  <div className="operator-navigation-desktop"><div className="operator-navigation-heading"><h2>{title}</h2><button type="button" className="btn btn-secondary operator-navigation-toggle" aria-label={expanded?(en?'Collapse navigation':'Thu gọn điều hướng'):(en?'Expand navigation':'Mở rộng điều hướng')} aria-expanded={expanded} onClick={onToggle}>{expanded?<ChevronLeft size={18} aria-hidden="true"/>:<ChevronRight size={18} aria-hidden="true"/>}</button></div>{list()}</div>
  {mobile&&opened&&<DialogSurface id="operator-workspace-drawer" className="operator-navigation-drawer" label={title} onClose={()=>setOpened(false)}><h2>{title}</h2>{list(true)}</DialogSurface>}
 </div>;
}
