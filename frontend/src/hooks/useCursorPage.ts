import {useState} from 'react';
/** Cursors are scoped to the account, filters and sort supplied by the caller. */
export function useCursorPage(scope:string){
 const [state,setState]=useState<{scope:string;pages:(string|null)[];index:number}>({scope,pages:[null],index:0});
 const current=state.scope===scope?state:{scope,pages:[null],index:0};
 return {cursor:current.pages[current.index],page:current.index+1,reset:()=>setState({scope,pages:[null],index:0}),previous:()=>setState({...current,index:Math.max(0,current.index-1)}),next:(cursor:string|null)=>{if(cursor)setState({...current,pages:[...current.pages.slice(0,current.index+1),cursor],index:current.index+1});}};
}
