import {useLayoutEffect,useRef} from 'react';
import {ensureAppNavigationEntry} from '../utils/appRoute';

type Position={x:number;y:number};
type Current={key:string;url:string;path:string;position:Position};
const here=()=>location.pathname+location.search+location.hash;
const position=():Position=>({x:window.scrollX,y:window.scrollY});

/** Restore history entries after their content is ready; user input always wins. */
export function usePageScroll(pagePath:string,ownerScope:string){
 const current=useRef<Current|null>(null),positions=useRef(new Map<string,Position>()),byUrl=useRef(new Map<string,Position>());
 const pending=useRef<'pop'|'navigate'|null>(null),stopRestore=useRef<()=>void>(()=>{});
 const remember=()=>{const entry=current.current;if(!entry)return;const value=position();entry.position=value;positions.current.set(entry.key,value);byUrl.current.delete(entry.url);byUrl.current.set(entry.url,value);for(const map of [positions.current,byUrl.current])if(map.size>100)map.delete(map.keys().next().value!);};
 useLayoutEffect(()=>{
  const previous=history.scrollRestoration;history.scrollRestoration='manual';ensureAppNavigationEntry();
  const before=()=>{stopRestore.current();remember();};
  const navigate=()=>{pending.current='navigate';};
  const pop=()=>{stopRestore.current();remember();pending.current='pop';};
  const cancel=()=>stopRestore.current();
  window.addEventListener('groupdeal:before-navigate',before);window.addEventListener('groupdeal:navigate',navigate);window.addEventListener('popstate',pop);
  document.addEventListener('pointerdown',cancel,true);document.addEventListener('touchmove',cancel,{passive:true,capture:true});document.addEventListener('wheel',cancel,{passive:true,capture:true});document.addEventListener('keydown',cancel,true);
  return()=>{stopRestore.current();history.scrollRestoration=previous;window.removeEventListener('groupdeal:before-navigate',before);window.removeEventListener('groupdeal:navigate',navigate);window.removeEventListener('popstate',pop);document.removeEventListener('pointerdown',cancel,true);document.removeEventListener('touchmove',cancel,true);document.removeEventListener('wheel',cancel,true);document.removeEventListener('keydown',cancel,true);};
 },[]);
 useLayoutEffect(()=>{stopRestore.current();positions.current.clear();byUrl.current.clear();},[ownerScope]);
 useLayoutEffect(()=>{
  const entry=ensureAppNavigationEntry(),url=here(),previous=current.current,kind=pending.current;pending.current=null;
  if(previous&&previous.key===entry.key&&previous.url===url&&!kind)return;
  stopRestore.current();
  const restore=kind==='pop'||kind==='navigate'&&entry.scroll==='restore';
  const target=restore?(positions.current.get(entry.key)??byUrl.current.get(url)??{x:0,y:0}):previous?.path===pagePath?previous.position:{x:0,y:0};
  current.current={key:entry.key,url,path:pagePath,position:target};
  if(!restore&&previous?.path!==pagePath){window.scrollTo({left:0,top:0,behavior:'instant'});return;}
  if(!restore)return;
  const main=document.querySelector<HTMLElement>('.main-content');if(!main)return;
  let active=true,frame=0;
  const stop=()=>{active=false;cancelAnimationFrame(frame);clearTimeout(timer);resize.disconnect();mutations.disconnect();};
  const attempt=(force=false)=>{
   if(!active||here()!==url||ensureAppNavigationEntry().key!==entry.key){stop();return;}
   const waiting=!!main.querySelector('[data-scroll-ready="false"]');
   const maxY=Math.max(0,document.documentElement.scrollHeight-innerHeight);
   if(!force&&(waiting||maxY+1<target.y&&!main.querySelector('[data-scroll-ready="true"]')))return;
   window.scrollTo({left:target.x,top:Math.min(target.y,maxY),behavior:'instant'});stop();
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>attempt());};
  const resize=new ResizeObserver(schedule),mutations=new MutationObserver(schedule),timer=setTimeout(()=>attempt(true),20000);
  resize.observe(main);mutations.observe(main,{subtree:true,childList:true,attributes:true,attributeFilter:['data-scroll-ready']});
  stopRestore.current=stop;schedule();
 });
}
