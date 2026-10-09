import {useLayoutEffect,useRef} from 'react';

/** Fence UI/signature continuations; already broadcast hashes still get persisted by callers. */
export function useOperationScope(identity:string){
 const scope=useRef({identity,epoch:0,active:true,pending:false});
 if(scope.current.identity!==identity)scope.current={identity,epoch:scope.current.epoch+1,active:true,pending:false};
 useLayoutEffect(()=>{scope.current.active=true;return()=>{scope.current.active=false;scope.current.epoch++;scope.current.pending=false;};},[identity]);
 return {start(supersede=false){
  if(!scope.current.active||scope.current.identity!==identity||scope.current.pending&&!supersede)return null;
  const epoch=++scope.current.epoch;scope.current.pending=true;
  const current=()=>scope.current.active&&scope.current.identity===identity&&scope.current.epoch===epoch;
  return {current,finish(){if(current())scope.current.pending=false;}};
 }};
}
