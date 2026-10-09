export function cleanHttpsEvidenceUrl(value){
  if(typeof value!=="string"||value.length>2000)return null;
  try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
