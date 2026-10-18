import {useState} from 'react';
import {useLanguage} from '../context/LanguageContext';
import {RightsReview} from './RightsReview';
import {OperatorSellerVerification} from './OperatorSellerVerification';

export function OperatorVerifications(){
 const {language}=useLanguage(),en=language==='en',[active,setActive]=useState<'RIGHTS'|'SELLERS'>('RIGHTS'),[rightsBusy,setRightsBusy]=useState(false),[sellersBusy,setSellersBusy]=useState(false),busy=rightsBusy||sellersBusy;
 return <section className="verification-workspace">
  <div className="section-switcher" role="group" aria-label={en?'Verification lists':'Danh sách xác minh'}>
   <button className="btn btn-secondary" type="button" disabled={busy} aria-pressed={active==='RIGHTS'} aria-controls="verification-rights-list" onClick={()=>setActive('RIGHTS')}>{en?'Distribution rights':'Quyền phân phối'}</button>
   <button className="btn btn-secondary" type="button" disabled={busy} aria-pressed={active==='SELLERS'} aria-controls="verification-sellers-list" onClick={()=>setActive('SELLERS')}>{en?'Seller verification':'Xác minh người bán'}</button>
  </div>
  <div id="verification-rights-list" hidden={active!=='RIGHTS'}><RightsReview onBusyChange={setRightsBusy}/></div>
  <div id="verification-sellers-list" hidden={active!=='SELLERS'}><OperatorSellerVerification onBusyChange={setSellersBusy}/></div>
 </section>;
}
