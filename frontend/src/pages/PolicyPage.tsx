import {useLanguage} from '../context/LanguageContext';
import {focusPageElement} from '../utils/focus';
import {policyPages} from '../content/policyPages';
import {userGuide} from '../content/userGuide';
import type {LocalizedCopy} from '../content/readingContent';

export function PolicyPage({section}:{section:string}){
 const {language}=useLanguage(),en=language==='en',copy=(value:LocalizedCopy)=>value[en?1:0];
 const page=section==='help'?userGuide:policyPages[section]??userGuide;
 const headingId=(id:string)=>'information-'+section+'-'+id;
 return <article className="app-page policy-page information-page" aria-labelledby="information-title" data-scroll-ready="true">
  <header className="catalog-heading information-heading">
   <h1 id="information-title">{copy(page.title)}</h1>
   <p>{copy(page.intro)}</p>
  </header>
  <details key={section} className="information-contents">
   <summary>{en?'On this page':'Nội dung trang'} <span>{page.sections.length} {en?'sections':'mục'}</span></summary>
   <nav aria-label={en?'On this page':'Nội dung trang'}>
    <ul>{page.sections.map(item=><li key={item.id}><button type="button" aria-controls={headingId(item.id)} onClick={()=>{const heading=document.getElementById(headingId(item.id));focusPageElement(heading);heading?.scrollIntoView({block:'start',behavior:'instant'});}}>{copy(item.title)}</button></li>)}</ul>
   </nav>
  </details>
  <div className="information-sections">{page.sections.map(item=>{
   const list=item.items?.map((value,index)=><li key={index}>{copy(value)}</li>);
   return <section key={item.id} className="information-section" aria-labelledby={headingId(item.id)}>
    <h2 id={headingId(item.id)} tabIndex={-1}>{copy(item.title)}</h2>
    <div className="information-section-content">
     {item.paragraphs?.map((value,index)=><p key={index}>{copy(value)}</p>)}
     {list&&(item.ordered?<ol>{list}</ol>:<ul>{list}</ul>)}
     {item.links&&<div className="information-links">{item.links.map(link=><a key={link.href} href={link.href} target={link.href.startsWith('https://')?'_blank':undefined} rel={link.href.startsWith('https://')?'noreferrer':undefined}>{copy(link.label)}</a>)}</div>}
    </div>
   </section>;
  })}</div>
 </article>;
}
