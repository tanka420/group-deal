import {useLayoutEffect,useRef} from 'react';
import {Users} from 'lucide-react';
import {useLanguage} from '../context/LanguageContext';

export function AdminHeader(){
 const {language,setLanguage}=useLanguage(),en=language==='en',header=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{const element=header.current;if(!element)return;const update=()=>document.documentElement.style.setProperty('--app-header-height',element.getBoundingClientRect().height+'px');const observer=new ResizeObserver(update);observer.observe(element);update();return()=>observer.disconnect();},[]);
 return <header className="header admin-header" ref={header}><div className="header-inner">
  <a href="/admin" className="logo-group" aria-label={en?'GroupDeal administration':'Quản trị GroupDeal'}><span className="logo-mark"><Users size={23} aria-hidden="true"/></span><span className="logo-text">GroupDeal <small>Admin</small></span></a>
  <nav className="ui-row" aria-label={en?'Admin workspace links':'Liên kết khu quản trị'}><a className="btn btn-secondary" href="/">{en?'Back to app':'Về ứng dụng'}</a><button className="btn btn-secondary" onClick={()=>setLanguage(en?'vi':'en')}>{en?'Language: EN':'Ngôn ngữ: VI'}</button></nav>
 </div></header>;
}
