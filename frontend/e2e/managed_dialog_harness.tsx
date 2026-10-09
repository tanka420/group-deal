import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LanguageProvider,useLanguage} from '../src/context/LanguageContext';
import {ManagedClaim} from '../src/components/ManagedClaim';
import {ManagedOrderAction,ManagedOrderActionHandle} from '../src/components/ManagedOrderAction';
import {ManagedFulfillment} from '../src/components/ManagedFulfillment';
import '../src/index.css';import '../src/styles/masterScreens.css';import '../src/styles/application.css';
const fixture=window as unknown as {fixtureKind:string;fixtureCompleted:number};
const principal='0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
function Harness(){
 const [open,setOpen]=useState(false),ref=useRef<ManagedOrderActionHandle>(null),{setLanguage}=useLanguage();
 const done=()=>{fixture.fixtureCompleted++;setOpen(false)};
 return <><button onClick={()=>setLanguage('vi')}>Vietnamese</button><button onClick={()=>setLanguage('en')}>English</button>
 {fixture.fixtureKind==='claim'?<ManagedClaim action="BUYER_CLAIM" campaignId="campaign" orderId="order" principal={principal} amount={89000000n} onClaimed={done}/>:fixture.fixtureKind==='order'?<><button onClick={()=>void ref.current?.begin('order',principal,{action:'CONFIRM'})}>Open action</button><ManagedOrderAction ref={ref} onRecovered={done}/></>:<><button onClick={()=>setOpen(true)}>Open delivery</button>{open&&<ManagedFulfillment order={{id:'order',quantity:2,campaignTitle:'Retained resources'}} onClose={()=>setOpen(false)} onDelivered={done}/>}</>}
 </>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Harness/></LanguageProvider>);
