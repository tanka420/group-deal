import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider,useAuth} from '../../src/context/AuthContext';

// Dev-only test entry, served only by the owning Playwright document fixture.
function Probe({instance}:{instance:number}){
 const auth=useAuth(),[result,setResult]=useState('NONE');
 const prepare=()=>{for(let i=0;i<2;i++)void auth.prepareCircle().then(()=>{
  ((window as any).fixtureLifecycleResults??=[]).push(`${instance}:READY`);setResult('READY');
 }).catch(()=>{((window as any).fixtureLifecycleResults??=[]).push(`${instance}:FAILED`);});};
 const otp=()=>{void auth.requestOtp('fixture-circle@example.test').then(()=>setResult('OTP_REQUESTED')).catch(()=>setResult('FAILED'));};
 const verify=()=>{void auth.verifyOtp('fixture-circle@example.test').then(()=>setResult('SIGNED_IN')).catch(()=>setResult('FAILED'));};
 return <main>
  <button onClick={prepare}>Prepare Circle twice</button>
  <button onClick={otp}>Request fixture OTP</button>
  <button onClick={verify}>Verify fixture OTP</button>
  <output aria-label="Circle initialization">{auth.circleInitState}</output>
  <output aria-label="Current lifecycle result">{result}</output>
  <output aria-label="Current identity">{auth.user?.id||'GUEST'}</output>
 </main>;
}
function Harness(){
 const [instance,setInstance]=useState(0);
 return <><button onClick={()=>setInstance(id=>id+1)}>Remount auth provider</button><AuthProvider key={instance}><Probe instance={instance}/></AuthProvider></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
