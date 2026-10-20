import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { NotificationPreferences } from '../components/NotificationPreferences';
import { SellerIdentityPanel } from '../components/SellerIdentityPanel';
import { SessionManager } from '../components/SessionManager';
import { SellerFollowsPanel } from '../components/SellerFollowsPanel';

export function AccountPage({onOpenAuth}:{onOpenAuth:()=>void}) {
  const {user,token}=useAuth(),{language}=useLanguage(),en=language==='en';
  return <section className="account-page"><h1>{en?'Account':'Tài khoản'}</h1>
    <button className="btn btn-secondary" onClick={onOpenAuth}>{en?'Sign-in and account details':'Đăng nhập và thông tin tài khoản'}</button>
    {user&&token?<div className="account-sections" key={user.id}>
      <SellerIdentityPanel key={user.id+':'+token}/><NotificationPreferences token={token} userId={user.id}/>
      <SellerFollowsPanel token={token} userId={user.id}/>
      <SessionManager token={token} userId={user.id}/>
    </div>:<p>{en?'Sign in to manage notifications, followed sellers and sessions.':'Đăng nhập để quản lý thông báo, người bán đang theo dõi và các phiên đăng nhập.'}</p>}
  </section>;
}
