import {useState} from 'react';
export type CursorPageState={scope:string;pages:(string|null)[];index:number};
/** Optional cache is owned and cleared by the account-scoped application shell. */
export function useCursorPage(scope:string,cache?:Map<string,CursorPageState>){
 const [state,setState]=useState<CursorPageState>(()=>cache?.get(scope)??{scope,pages:[null],index:0});
 const current=state.scope===scope?state:cache?.get(scope)??{scope,pages:[null],index:0};
 const update=(next:CursorPageState)=>{if(cache){cache.delete(scope);cache.set(scope,next);if(cache.size>32)cache.delete(cache.keys().next().value!);}setState(next);};
 return {cursor:current.pages[current.index],page:current.index+1,reset:()=>update({scope,pages:[null],index:0}),previous:()=>update({...current,index:Math.max(0,current.index-1)}),next:(cursor:string|null)=>{if(cursor)update({...current,pages:[...current.pages.slice(0,current.index+1),cursor],index:current.index+1});}};
}
