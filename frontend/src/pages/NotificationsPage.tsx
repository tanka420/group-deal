import {useAuth} from '../context/AuthContext';
import {useLanguage} from '../context/LanguageContext';
import {useNotificationInbox,type InboxItem} from '../services/notificationInbox';
import {NotificationInbox} from '../components/NotificationInbox';
import {navigateApp,parseAppHash} from '../utils/appRoute';
export function NotificationsPage({onOpenAuth}:{onOpenAuth:()=>void}) {
 const {user,token}=useAuth(),{language}=useLanguage(),en=language==='en',inbox=useNotificationInbox(token,user?.id);
 const open=async(item:InboxItem)=>{if(await inbox.markRead(item)&&item.link&&parseAppHash(item.link).kind!=='not-found')navigateApp(item.link);};
 return <section className="account-page"><h1>{en?'Notifications':'Thông báo'}</h1>{user?<NotificationInbox rows={inbox.rows} pending={inbox.pending} error={inbox.error} cursor={inbox.cursor} onReload={()=>void inbox.reload()} onMore={()=>void inbox.more()} onOpen={item=>void open(item)}/>:<button className="btn btn-primary" onClick={onOpenAuth}>{en?'Sign in':'Đăng nhập'}</button>}</section>;
}
