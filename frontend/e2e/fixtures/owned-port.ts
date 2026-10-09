import net from 'node:net';
/** Windows may release a child listener shortly after the tsx parent exits. */
export async function waitForOwnedPorts(ports:number[]){
 for(const port of ports){let free=false;
  for(let attempt=0;attempt<25;attempt++){
   free=await new Promise<boolean>((resolve,reject)=>{const probe=net.createServer();probe.once('error',(error:NodeJS.ErrnoException)=>{if(error.code==='EADDRINUSE')resolve(false);else reject(error);});probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)));});
   if(free)break;await new Promise(resolve=>setTimeout(resolve,200));
  }if(!free)throw new Error('Owned fixture port did not become free: '+port);
 }
}
