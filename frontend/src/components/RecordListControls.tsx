import {Search} from 'lucide-react';

/** Filters the rows already loaded by the caller; it never issues a mutation. */
export function RecordListControls({id,search,filter,onSearch,onFilter,options,count,total,language}:{id:string;search:string;filter:string;onSearch:(value:string)=>void;onFilter:(value:string)=>void;options:{value:string;label:string}[];count:number;total:number;language:string}){
 const en=language==='en';
 return <div className="record-list-toolbar">
  <label className="record-search" htmlFor={id+'-search'}><span>{en?'Search records':'Tìm hồ sơ'}</span><div><Search size={18} aria-hidden="true"/><input id={id+'-search'} type="search" value={search} onChange={event=>onSearch(event.target.value)}/></div></label>
  <label htmlFor={id+'-status'}><span>{en?'Status':'Trạng thái'}</span><select id={id+'-status'} className="form-select" value={filter} onChange={event=>onFilter(event.target.value)}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  <p className="muted record-list-count" role="status">{count} / {total} {en?'records':'hồ sơ'}</p>
 </div>;
}
