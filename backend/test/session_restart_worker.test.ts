import {TransactionalStore} from "../src/db/store";
import {SessionRegistry,SessionError} from "../src/services/sessionService";
import path from "node:path";
import os from "node:os";
let raw="";
process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>{raw+=chunk;if(raw.length>20000)process.exit(1);});
process.stdin.on("end",()=>{
 let database:TransactionalStore|undefined;
 try{const input=JSON.parse(raw),directory=path.resolve(input.directory);if(!directory.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(directory).startsWith("groupdeal-test-session-"))throw new Error();database=new TransactionalStore(directory);try{new SessionRegistry(database).authenticate(input.token);throw new Error();}catch(e){if(!(e instanceof SessionError)||e.code!=="AUTH_SESSION_INACTIVE")throw new Error();}process.stdout.write("PASS restart rejects revoked session\n");}
 catch{process.stderr.write("FAIL isolated session restart\n");process.exitCode=1;}finally{database?.close();}
});
