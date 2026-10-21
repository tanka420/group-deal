import {useEffect,useRef,useState} from 'react';
import {useLanguage} from '../context/LanguageContext';

export function WebhookSecretField({secret}:{secret:string}){
  const {language}=useLanguage(),text=(vi:string,en:string)=>language==='en'?en:vi;
  const [revealed,setRevealed]=useState<string|null>(null);
  const [copyState,setCopyState]=useState<'IDLE'|'COPYING'|'COPIED'|'FAILED'>('IDLE');
  const attempt=useRef(0),visible=!!secret&&revealed===secret;
  useEffect(()=>{setRevealed(null);setCopyState('IDLE');attempt.current++;return()=>{attempt.current++;};},[secret]);
  const copy=async()=>{
    if(!secret||copyState==='COPYING')return;
    const id=++attempt.current;setCopyState('COPYING');
    try{await navigator.clipboard.writeText(secret);if(attempt.current===id)setCopyState('COPIED');}
    catch{if(attempt.current===id)setCopyState('FAILED');}
  };
  return <div className="form-group webhook-secret-field">
    <label className="form-label" htmlFor="seller-webhook-secret">{text('Webhook secret (xác thực chữ ký)','Webhook secret (signature verification)')}</label>
    <div className="webhook-secret-controls">
      <input type={visible?'text':'password'} id="seller-webhook-secret" autoComplete="off" spellCheck={false}
        className="form-input font-mono" value={secret} readOnly/>
      <div className="webhook-secret-actions">
        <button type="button" className="btn btn-secondary" disabled={!secret||copyState==='COPYING'} onClick={()=>void copy()}>
          {copyState==='COPYING'?text('Đang sao chép…','Copying…'):text('Sao chép secret','Copy secret')}
        </button>
        <button type="button" className="btn btn-secondary" disabled={!secret} aria-controls="seller-webhook-secret" aria-pressed={visible}
          onClick={()=>setRevealed(visible?null:secret)}>{visible?text('Ẩn secret','Hide secret'):text('Hiện secret','Show secret')}</button>
      </div>
    </div>
    {copyState==='COPIED'&&<p className="webhook-secret-feedback" role="status">{text('Đã sao chép secret.','Secret copied.')}</p>}
    {copyState==='FAILED'&&<p className="webhook-secret-feedback" role="alert">{text('Chưa sao chép được. Bấm “Hiện secret”, chọn toàn bộ nội dung trong ô rồi sao chép thủ công.','Could not copy. Select “Show secret”, select the entire field and copy it manually.')}</p>}
  </div>;
}
