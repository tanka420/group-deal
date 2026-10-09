import type {Locator} from '@playwright/test';
/** Measure painted character boxes, not only scrollWidth or textContent. */
export async function textGeometry(locator:Locator){return locator.evaluate(element=>{
 const box=(r:DOMRect)=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});
 const bounds=element.getBoundingClientRect(),text=element.firstChild;
 if(!text||text.nodeType!==Node.TEXT_NODE)throw Error('Expected a leading text node');
 const ancestors:Element[]=[];for(let a:Element|null=element;a;a=a.parentElement)ancestors.push(a);
 const clips=ancestors.filter(a=>{const s=getComputedStyle(a);return ['hidden','clip','scroll','auto'].includes(s.overflowX)||['hidden','clip','scroll','auto'].includes(s.overflowY)}).map(a=>({tag:a.tagName,className:a.className,bounds:box(a.getBoundingClientRect()),overflowX:getComputedStyle(a).overflowX,overflowY:getComputedStyle(a).overflowY}));
 const chars=Array.from(text.textContent??'').map((char,index)=>{const range=document.createRange();range.setStart(text,index);range.setEnd(text,index+1);const r=range.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2,hit=document.elementFromPoint(x,y);return{char,index,...box(r),withinElement:r.left>=bounds.left-.5&&r.right<=bounds.right+.5,withinViewport:r.left>=-.5&&r.right<=innerWidth+.5,unoccluded:!!hit&&(hit===element||element.contains(hit)),clipped:clips.some(c=>['hidden','clip','scroll','auto'].includes(c.overflowX)&&(r.left<c.bounds.left-.5||r.right>c.bounds.right+.5)||['hidden','clip','scroll','auto'].includes(c.overflowY)&&(r.top<c.bounds.top-.5||r.bottom>c.bounds.bottom+.5))}}).filter(c=>c.char.trim());
 return{text:text.textContent,bounds:box(bounds),viewport:{width:innerWidth,height:innerHeight},font:getComputedStyle(element).fontFamily,fontSize:getComputedStyle(element).fontSize,scrollLeft:element.scrollLeft,scrollWidth:element.scrollWidth,clientWidth:element.clientWidth,clips,chars};
 });}
