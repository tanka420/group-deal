import {useLanguage} from '../context/LanguageContext';
export type PaginationInfo={limit:number;total?:number;nextCursor:string|null};
export function readPagination(value:unknown):PaginationInfo{
 const v=value as PaginationInfo;
 if(!v||v.limit!==20||v.total!==undefined&&(!Number.isSafeInteger(v.total)||v.total<0)||v.nextCursor!==null&&(typeof v.nextCursor!=='string'||!v.nextCursor||v.nextCursor.length>4096))throw Error('PAGINATION_INVALID');
 return v;
}
export function ListPagination({page,nextCursor,total,pending,onPrevious,onNext}:{page:number;nextCursor:string|null;total?:number;pending?:boolean;onPrevious:()=>void;onNext:()=>void}){
 const {language}=useLanguage(),en=language==='en';
 return <nav className="list-pagination" aria-label={en?'List pagination':'Phân trang danh sách'}><span role="status">{en?'Page':'Trang'} {page}{total!==undefined?` · ${total} ${en?'records':'bản ghi'}`:''} · 20 {en?'per page':'mỗi trang'}</span><div><button type="button" className="btn btn-secondary" disabled={pending||page===1} onClick={onPrevious}>{en?'Previous':'Trước'}</button><button type="button" className="btn btn-secondary" disabled={pending||!nextCursor} onClick={onNext}>{en?'Next':'Sau'}</button></div></nav>;
}
