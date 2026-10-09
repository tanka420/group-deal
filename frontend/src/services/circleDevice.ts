import type {W3SSdk} from '@circle-fin/w3s-pw-web-sdk';

// The installed SDK is a singleton and owns only one device resolver. Share that
// request across provider remounts; issuing a second request would orphan the first.
const devices=new WeakMap<W3SSdk,Promise<string>>();
export function circleDeviceId(sdk:W3SSdk):Promise<string>{
 const pending=devices.get(sdk);if(pending)return pending;
 const own=(async()=>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const request=sdk.getDeviceId();
  const frame=document.getElementById('sdkIframe');
  try{
   const value=await Promise.race([request,new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('CIRCLE_INITIALIZATION_TIMEOUT')),15_000);})]);
   if(typeof value!=='string'||!value||value.length>4096)throw new Error('CIRCLE_DEVICE_UNAVAILABLE');
   return value;
  }finally{
   clearTimeout(timeout);
   // Only remove this initialization's frame. No OTP/signing flow can begin
   // until the shared device promise settles and the active provider is ready.
   if(frame&&document.getElementById('sdkIframe')===frame)frame.remove();
  }
 })();
 devices.set(sdk,own);
 void own.catch(()=>{if(devices.get(sdk)===own)devices.delete(sdk);});
 return own;
}
