const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),dist=path.join(root,"frontend/dist"),manifest=JSON.parse(fs.readFileSync(path.join(dist,".vite/manifest.json"),"utf8"));
const entry=Object.keys(manifest).find(key=>manifest[key].isEntry&&manifest[key].src==="fallback.html");if(!entry)throw new Error("Build the fallback entry before packaging");
const chunks=new Set(),files=new Set(["fallback.html"]);
function walk(key){if(chunks.has(key))return;chunks.add(key);const chunk=manifest[key];if(!chunk)throw new Error("Missing fallback build dependency");files.add(chunk.file);for(const file of [...(chunk.css||[]),...(chunk.assets||[])])files.add(file);for(const child of [...(chunk.imports||[]),...(chunk.dynamicImports||[])])walk(child);}
walk(entry);
const stamp=new Date().toISOString().replace(/[:.]/g,"-"),relative=".cache/fallback-release-"+stamp,destination=path.join(root,relative);fs.mkdirSync(destination,{recursive:false});
const artifacts=[];
for(const file of [...files].sort()){
  if(path.isAbsolute(file)||file.split(/[\\/]/).includes("..")||file!=="fallback.html"&&!file.startsWith("assets/"))throw new Error("Unexpected fallback artifact path");
  const bytes=fs.readFileSync(path.join(dist,file)),target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:"wx"});artifacts.push({path:file,byteLength:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex")});
}
const record={schemaVersion:1,createdAt:new Date().toISOString(),layer:"BUILT_STATIC_ARTIFACT",acceptanceEligible:false,artifactDirectory:relative,entry:"fallback.html",files:artifacts,dependencies:["static host","Arc read RPC","network","buyer/seller EIP1193 principal wallet"],unsupported:["independent Circle signing","live principal outage acceptance"]};
fs.writeFileSync(path.join(destination,"PACKAGE.json"),JSON.stringify(record,null,2)+"\n",{flag:"wx"});fs.writeFileSync(path.join(root,".cache/fallback-latest-package.json"),JSON.stringify(record));
console.log(JSON.stringify({package:relative+"/PACKAGE.json",files:artifacts.length,bytes:artifacts.reduce((sum,file)=>sum+file.byteLength,0),acceptanceEligible:false}));
