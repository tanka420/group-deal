import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,ImagePlus,Trash2} from 'lucide-react';
import {useDealLanguage} from './DealPresentation';
import {useAuth} from '../context/AuthContext';
import {UiError,messageText,uiMessage,type UiMessage} from '../utils/uiMessage';

export type ProductMedia={url:string;alt:string};
type Props={thumbnail:string;media:ProductMedia[];disabled:boolean;coverError?:boolean;albumError?:boolean;onChange:(thumbnail:string,media:ProductMedia[])=>void;onBusyChange:(busy:boolean)=>void};
/** Re-encode in the browser to remove metadata and bound storage; a blob URL is never saved. */
async function prepareImage(file:File){
 if(!['image/png','image/jpeg'].includes(file.type)||file.size<1||file.size>8*1024*1024)throw new UiError(uiMessage('Chọn ảnh PNG hoặc JPEG, tối đa 8 MB.','Choose a PNG or JPEG image up to 8 MB.'));
 const bitmap=await createImageBitmap(file);
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width>12000||bitmap.height>12000||bitmap.width*bitmap.height>40000000)throw new UiError(uiMessage('Ảnh quá lớn. Chọn ảnh không quá 40 megapixel.','This image is too large. Choose an image up to 40 megapixels.'));
  const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const context=canvas.getContext('2d');if(!context)throw Error();context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error()),'image/jpeg',.86));
  if(blob.size>1024*1024)throw new UiError(uiMessage('Ảnh sau tối ưu vẫn quá 1 MB. Chọn ảnh nhỏ hơn.','The optimized image is still over 1 MB. Choose a smaller image.'));return blob;
 }finally{bitmap.close();}
}
export function ProductMediaEditor({thumbnail,media,disabled,coverError,albumError,onChange,onBusyChange}:Props){
 const {text,language}=useDealLanguage(),{token,user}=useAuth();
 const [busy,setBusy]=useState(false),[error,setError]=useState<UiMessage|null>(null),[notice,setNotice]=useState('');
 const controller=useRef<AbortController|null>(null),working=useRef(false),identity=JSON.stringify([user?.id,token]),identityRef=useRef(identity);identityRef.current=identity;
 const changeRef=useRef(onChange);changeRef.current=onChange;
 useEffect(()=>()=>{controller.current?.abort();onBusyChange(false);},[identity]);
 const upload=async(files:File[],album:boolean)=>{
  if(disabled||working.current||!token||!user||!files.length)return;
  if(album&&media.length+files.length>8){setError(uiMessage('Album có tối đa 8 ảnh. Chọn ít ảnh hơn.','The album holds up to 8 images. Select fewer images.'));return;}
  const captured=identity,abort=new AbortController();controller.current=abort;working.current=true;setBusy(true);onBusyChange(true);setError(null);setNotice('');let nextThumbnail=thumbnail,nextMedia=[...media],uploaded=0;
  try{
   for(const file of files){
    const image=await prepareImage(file);if(abort.signal.aborted||identityRef.current!==captured)return;
    const response=await fetch('/api/product-images',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream'},body:image,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});
    if(!response.ok)throw new UiError(response.status===401||response.status===403?uiMessage('Phiên hoặc quyền người bán đã đổi. Đăng nhập và thử lại.','Your session or seller access changed. Sign in and try again.'):response.status===413?uiMessage('Đã vượt giới hạn lưu ảnh. Giữ ảnh hiện tại hoặc dùng link HTTPS.','Image storage capacity was exceeded. Keep existing images or use HTTPS links.'):uiMessage('Chưa xác nhận được tải ảnh. Có thể chọn lại file để kiểm tra an toàn.','The upload could not be confirmed. Select the same file to safely check again.'));
    const value=await response.json();if(abort.signal.aborted||identityRef.current!==captured)return;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await image.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(abort.signal.aborted||identityRef.current!==captured)return;
    const url=new URL(value.url);if(!/^img_[a-f0-9]{64}$/.test(value.id)||value.sha256!==hash||value.mimeType!==image.type||value.byteLength!==image.size||url.origin!==location.origin||url.pathname!=='/api/product-images/'+value.id||url.search||url.hash)throw Error();
    if(album){if(!nextMedia.some(m=>m.url===value.url))nextMedia.push({url:value.url,alt:text('Ảnh sản phẩm','Product image')});}else nextThumbnail=value.url;
    uploaded++;changeRef.current(nextThumbnail,[...nextMedia]);setNotice(text(`Đã tải ${uploaded}/${files.length} ảnh.`,`Uploaded ${uploaded}/${files.length} images.`));
   }
  }catch(e){if(!abort.signal.aborted&&identityRef.current===captured)setError(e instanceof UiError?e.displayMessage:uiMessage('Chưa tải được ảnh. Giữ nội dung và thử chọn lại file.','The image could not be uploaded. Keep your content and select the file again.'));}
  finally{if(identityRef.current===captured){working.current=false;setBusy(false);onBusyChange(false);}controller.current=null;}
 };
 const move=(index:number,offset:number)=>{const next=[...media];[next[index],next[index+offset]]=[next[index+offset],next[index]];onChange(thumbnail,next)};
 const locked=disabled||busy;
 return <section className="product-media-editor" aria-labelledby="product-media-heading" aria-busy={busy}>
  <div><h4 id="product-media-heading">{text('Ảnh sản phẩm','Product images')}</h4><p className="muted">{text('PNG/JPEG, tối đa 8 MB mỗi ảnh. Ảnh được tối ưu trước khi tải. Ảnh được lưu công khai ngay khi tải lên. Chỉ dùng ảnh quảng bá.','PNG/JPEG, up to 8 MB each. Images are optimized before upload. Images become public as soon as they are uploaded. Use marketing images only.')}</p></div>
  {error&&<p role="alert" className="notice notice-error">{messageText(error,language)}</p>}
  <p role="status" className="muted">{busy?text('Đang tối ưu và tải ảnh…','Optimizing and uploading images…'):notice}</p>
  <div className="product-cover-editor">
   {thumbnail?<img src={thumbnail} alt={text('Ảnh đại diện sản phẩm','Product cover')} className="product-cover-preview"/>:<div className="product-cover-preview product-image-empty"><ImagePlus size={32} aria-hidden="true"/></div>}
   <div className="product-image-actions"><label className="form-group"><span className="form-label">{text('Tải ảnh đại diện','Upload cover image')}</span><input type="file" accept="image/png,image/jpeg" disabled={locked} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void upload(files.slice(0,1),false)}}/></label><p className="muted">{text('Dùng làm ảnh của sản phẩm và deal.','Used as the product and deal cover.')}</p>{thumbnail&&<button type="button" className="btn btn-secondary" disabled={locked} onClick={()=>onChange('',media)}>{text('Gỡ ảnh đại diện','Remove cover')}</button>}</div>
  </div>
  <label className="form-group" htmlFor="product-thumbnailUrl"><span className="form-label">{text('Hoặc dùng link ảnh đại diện HTTPS','Or use an HTTPS cover link')}</span><input id="product-thumbnailUrl" className="form-input" type="url" aria-invalid={coverError||undefined} aria-describedby={coverError?"product-thumbnailUrl-error":undefined} value={thumbnail} disabled={locked} maxLength={2000} onChange={e=>onChange(e.target.value,media)} required/></label>
  <div className="product-album-heading"><h4>{text('Album ảnh','Image album')} <span className="muted">{media.length}/8</span></h4><label className="form-group"><span className="form-label">{text('Thêm ảnh album','Add album images')}</span><input type="file" accept="image/png,image/jpeg" multiple disabled={locked||media.length>=8} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void upload(files,true)}}/></label></div>
  {media.length?<ol className="product-album-list">{media.map((image,index)=><li key={index} className="product-album-item"><img src={image.url} alt={image.alt}/><label className="form-group"><span className="form-label">{text(`Mô tả ảnh ${index+1}`,`Image ${index+1} description`)}</span><input id={index===0?"product-media":undefined} aria-invalid={albumError||undefined} aria-describedby={albumError?"product-media-error":undefined} className="form-input" maxLength={180} value={image.alt} disabled={locked} required onChange={e=>onChange(thumbnail,media.map((m,i)=>i===index?{...m,alt:e.target.value}:m))}/></label><div className="action-row"><button type="button" className="btn btn-secondary" disabled={locked||index===0} aria-label={text(`Đưa ảnh ${index+1} lên trước`,`Move image ${index+1} earlier`)} onClick={()=>move(index,-1)}><ArrowUp size={16}/></button><button type="button" className="btn btn-secondary" disabled={locked||index===media.length-1} aria-label={text(`Đưa ảnh ${index+1} xuống sau`,`Move image ${index+1} later`)} onClick={()=>move(index,1)}><ArrowDown size={16}/></button><button type="button" className="btn btn-secondary" disabled={locked} aria-label={text(`Gỡ ảnh ${index+1}`,`Remove image ${index+1}`)} onClick={()=>onChange(thumbnail,media.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div></li>)}</ol>:<p className="muted">{text('Chưa có ảnh album. Có thể thêm tối đa 8 ảnh.','No album images yet. Add up to 8 images.')}</p>}
 </section>;
}
