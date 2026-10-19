import {useId,useState,type MouseEventHandler} from 'react';
import type {LucideIcon} from 'lucide-react';
export function CampaignIconAction({label,Icon,onClick,href,disabled=false,primary=false,dialog=false,expanded}:{label:string;Icon:LucideIcon;onClick?:MouseEventHandler<HTMLButtonElement>;href?:string;disabled?:boolean;primary?:boolean;dialog?:boolean;expanded?:boolean}){
 const id=useId(),[dismissed,setDismissed]=useState(false),content=<Icon size={18} aria-hidden="true"/>;
 return <span className={'campaign-icon-wrap'+(dismissed?' tooltip-dismissed':'')} onMouseLeave={()=>setDismissed(false)} onBlur={()=>setDismissed(false)} onKeyDown={event=>{if(event.key==='Escape')setDismissed(true);}}>
  {href?<a className={'campaign-icon-action'+(primary?' is-primary':'')} href={href} aria-label={label} title={label} aria-describedby={id}>{content}</a>:<button type="button" className={'campaign-icon-action'+(primary?' is-primary':'')} onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-describedby={id} aria-haspopup={dialog?'dialog':undefined} aria-expanded={expanded}>{content}</button>}
  <span role="tooltip" id={id} className="campaign-action-tooltip">{label}</span>
 </span>;
}
