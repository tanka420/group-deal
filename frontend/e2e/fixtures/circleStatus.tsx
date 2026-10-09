import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ethers} from 'ethers';
import {Web3Provider,useWeb3} from '../../src/context/Web3Context';
const principal='0x1111111111111111111111111111111111111111',hub='0x2222222222222222222222222222222222222222';
function Probe(){const web3=useWeb3(),[result,setResult]=useState('NONE'),[broadcasts,setBroadcasts]=useState<string[]>([]);return <main>
 <button disabled={!web3.account||!web3.hubAddress} onClick={()=>{setResult('PENDING');void web3.broadcastPreparedOperation({id:'status-operation',action:'CONFIRM',resourceId:'status-order',chainId:5042002,hubAddress:hub,principal,calldata:new ethers.Interface(['function confirmReceipt(uint256,uint256)']).encodeFunctionData('confirmReceipt',[1,1])},async hash=>{setBroadcasts(old=>[...old,hash])}).then(r=>setResult(r.txHash)).catch(()=>setResult('FAILED'))}}>Resume fixture Circle transaction</button>
 <output aria-label="Circle transaction result">{result}</output><output aria-label="Circle broadcasts">{JSON.stringify(broadcasts)}</output>
 </main>}
createRoot(document.getElementById('root')!).render(<Web3Provider><Probe/></Web3Provider>);
