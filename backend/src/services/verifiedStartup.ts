import type {Server} from 'node:http';

/** Port failure must not leave a poller or deliver queued external work. */
export async function startVerifiedRuntime(options:{verify:()=>Promise<void>;startIndexer:()=>Promise<void>;stopIndexer:()=>void;verifyFinancialReadiness:()=>Promise<void>;listen:()=>Promise<Server>;startWorkers:()=>()=>void;releaseStorage:()=>void}){
 let server:Server|undefined,stopWorkers:(()=>void)|undefined;
 try{await options.verify();await options.startIndexer();await options.verifyFinancialReadiness();server=await options.listen();stopWorkers=options.startWorkers();}
 catch(error){stopWorkers?.();if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));options.stopIndexer();options.releaseStorage();throw error;}
 let stopped=false;return{server,stop:async()=>{if(stopped)return;stopped=true;stopWorkers!();server!.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));options.stopIndexer();options.releaseStorage();}};
}
