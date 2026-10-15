import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {providerWindowOpen} from './TxTrackerModal';
import {X} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';
import {focusPageElement} from '../utils/focus';

/** Shared presentation for existing review forms; callers retain their actions. */
export function DialogSurface({label,onClose,children,transaction=false,busy=false,returnFocus,className='',id}:{label:string;onClose:()=>void;children:ReactNode;transaction?:boolean;busy?:boolean;returnFocus?:()=>HTMLElement|null;className?:string;id?:string}){
 const ref=useRef<HTMLDialogElement>(null),{language}=useLanguage(),[handoff,setHandoff]=useState(false),closeState=useRef({busy,onClose,returnFocus});closeState.current={busy,onClose,returnFocus};
 useLayoutEffect(()=>{
  if(!transaction)return;const node=ref.current;if(!node)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,app=document.getElementById('root'),wasInert=app?.inert,overflow=document.body.style.overflow;
  if(app)app.inert=true;document.body.style.overflow='hidden';
  let provider=false;
  const focusHeading=()=>{const heading=node.querySelector<HTMLElement>('h2');if(heading){heading.tabIndex=-1;heading.focus();}};
  const sync=()=>{const next=providerWindowOpen();setHandoff(next);if(provider&&!next)focusHeading();provider=next;};
  const observer=new MutationObserver(sync);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','open','hidden']});sync();if(!provider)focusHeading();
  const keydown=(event:KeyboardEvent)=>{
   if(providerWindowOpen()||!node.contains(event.target as Node))return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!closeState.current.busy)closeState.current.onClose();return;}
   if(event.key!=='Tab')return;
   const controls=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length>0&&!el.closest('[hidden],[inert]')),first=controls[0],last=controls[controls.length-1];
   if(!first||!last){event.preventDefault();focusHeading();return;}
   if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement as HTMLElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!controls.includes(document.activeElement as HTMLElement))){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',keydown,true);return()=>{observer.disconnect();document.removeEventListener('keydown',keydown,true);if(app)app.inert=Boolean(wasInert);document.body.style.overflow=overflow;const target=closeState.current.returnFocus?.()??previous;if(target?.isConnected)focusPageElement(target);};
 },[transaction]);
 useLayoutEffect(()=>{if(transaction)return;const node=ref.current;if(!node)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';node.showModal();
  const keydown=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const items=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length>0),first=items[0],last=items[items.length-1];if(!first||!last)return;if(event.shiftKey&&(document.activeElement===first||!items.includes(document.activeElement as HTMLElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!items.includes(document.activeElement as HTMLElement))){event.preventDefault();first.focus();}};
  node.addEventListener('keydown',keydown);return()=>{node.removeEventListener('keydown',keydown);if(node.open)node.close();document.body.style.overflow=overflow;if(previous?.isConnected)focusPageElement(previous);};},[transaction]);
 if(transaction)return createPortal(<div className="modal-overlay transaction-overlay" hidden={handoff}><dialog open ref={ref} className="resource-dialog managed-operation-dialog" aria-label={label} aria-modal={!handoff} aria-busy={busy}>{children}</dialog></div>,document.body);
 return <dialog ref={ref} className={'modal-content ui-dialog '+className} id={id} aria-label={label} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target!==event.currentTarget)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();}}>
  <button className="modal-close ui-dialog-close" type="button" aria-label={language==='en'?'Close dialog':'Đóng hộp thoại'} onClick={onClose}><X size={20} aria-hidden="true"/></button>{children}
 </dialog>;
}
