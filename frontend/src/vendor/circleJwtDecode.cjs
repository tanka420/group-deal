'use strict';

// Circle 1.1.11 uses decode only for its social-login nonce comparison.
// This preserves jsonwebtoken/jws default decoding, including malformed-input
// behaviour. It performs no signature verification and grants no app authority.
const shape=/^[a-zA-Z0-9_-]+?\.[a-zA-Z0-9_-]+?\.([a-zA-Z0-9_-]+)?$/;
function binary(part){
  // Node's base64 decoder ignores a final one-character fragment.
  const source=(part.length%4===1?part.slice(0,-1):part).replace(/-/g,'+').replace(/_/g,'/');
  return atob(source+'='.repeat((4-source.length%4)%4));
}
function decode(token){
  if(typeof token!=='string'||!shape.test(token))return null;
  const parts=token.split('.');let header;
  try{header=JSON.parse(binary(parts[0]));}catch{return null;}
  if(!header)return null;
  const raw=binary(parts[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  // Buffer.toString('utf8') preserves a leading BOM and replaces invalid UTF-8.
  let payload=new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes);
  if(header.typ==='JWT')payload=JSON.parse(payload);
  if(typeof payload==='string')try{const value=JSON.parse(payload);if(value!==null&&typeof value==='object')payload=value;}catch{}
  return payload;
}
exports.decode=decode;
