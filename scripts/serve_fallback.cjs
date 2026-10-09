const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),directory=path.resolve(root,process.argv[2]||""),port=Number(process.argv[3]||4167);
if(!directory.startsWith(path.join(root,".cache","fallback-release-"))||!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error("Use an owned packaged fallback directory and local port");
const record=JSON.parse(fs.readFileSync(path.join(directory,"PACKAGE.json"),"utf8")),allowed=new Map(record.files.map(file=>["/"+file.path,file]));
for(const file of record.files){const resolved=path.resolve(directory,file.path);if(!resolved.startsWith(directory+path.sep)||crypto.createHash("sha256").update(fs.readFileSync(resolved)).digest("hex")!==file.sha256)throw new Error("Fallback package integrity check failed");}
const server=http.createServer((request,response)=>{
  if(request.method!=="GET"&&request.method!=="HEAD"){response.writeHead(405);response.end();return;}
  const pathname=new URL(request.url,"http://127.0.0.1").pathname,file=allowed.get(pathname==="/"?"/fallback.html":pathname);
  if(!file){response.writeHead(404);response.end();return;}
  const mime=file.path.endsWith(".js")?"application/javascript":file.path.endsWith(".css")?"text/css":file.path.endsWith(".html")?"text/html":"application/octet-stream";
  response.writeHead(200,{"Content-Type":mime,"X-Content-Type-Options":"nosniff","Cache-Control":"no-store"});if(request.method==="HEAD")response.end();else response.end(fs.readFileSync(path.join(directory,file.path)));
});server.listen(port,"127.0.0.1",()=>console.log(JSON.stringify({scope:"OWNED_STATIC_ONLY_PACKAGE_SERVER",host:"127.0.0.1",port,pid:process.pid,files:allowed.size,apiRoutes:false})));
const close=()=>server.close(()=>process.exit(0));process.once("SIGINT",close);process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>{if(chunk.trim()==="STOP_FALLBACK")close();});
