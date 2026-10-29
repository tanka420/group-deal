import {useLanguage} from '../context/LanguageContext';

type Props={title:string;description:string;onOpenAuth:()=>void};

export function SignedOutPage({title,description,onOpenAuth}:Props){
 const {language}=useLanguage();
 return <section className="signed-out-page">
  <h1>{title}</h1>
  <p className="muted">{description}</p>
  <button type="button" className="btn btn-primary" onClick={onOpenAuth}>{language==='en'?'Sign in':'Đăng nhập'}</button>
 </section>;
}
