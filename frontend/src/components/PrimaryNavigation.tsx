import { Home, Compass, Shield, ShoppingBag, Wallet, UserRound } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { appHref } from '../utils/appRoute';

/** The same destinations and active state on desktop and mobile. */
export function PrimaryNavigation({ currentTab, admin, onNavigate }: {currentTab:string;seller:boolean;admin:boolean;onNavigate:(tab:string)=>void}) {
  const {language}=useLanguage(), en=language==='en';
  const links=admin
    ? [{tab:'operator',label:en?'Administration':'Quản trị',Icon:Shield},{tab:'explore',label:en?'Explore':'Khám phá',Icon:Compass}]
    : [{tab:'home',label:en?'Home':'Trang chủ',Icon:Home},{tab:'explore',label:en?'Explore':'Khám phá',Icon:Compass},{tab:'orders',label:en?'Orders':'Đơn hàng',Icon:ShoppingBag},{tab:'wallet',label:en?'Wallet':'Ví',Icon:Wallet},{tab:'account',label:en?'Account':'Tài khoản',Icon:UserRound}];
  return <nav className="primary-navigation" aria-label={en?'Main navigation':'Điều hướng chính'}>{links.map(({tab,label,Icon})=><a key={tab} href={appHref('#'+tab)} aria-current={currentTab===tab||(tab==='support'&&currentTab.startsWith('support-'))?'page':undefined} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onNavigate(tab);}}}><Icon size={18} aria-hidden="true"/><span>{label}</span></a>)}</nav>;
}
