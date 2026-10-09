import crypto from 'node:crypto';
import {TextDecoder} from 'node:util';
import {SUPPORT_FILE_LIMIT,supportUploadSchema} from '../domain/support';

export class SupportContentError extends Error{constructor(){super('SUPPORT_FILE_INVALID');}}
const crcTable=Array.from({length:256},(_,value)=>{let crc=value;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;});
function crc32(bytes:Buffer){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
/** Validate bounded files and always serve as downloads, never inline documents. */
export function supportFile(input:unknown){
 const p=supportUploadSchema.safeParse(input);if(!p.success)throw new SupportContentError();const v=p.data;
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.dataBase64)||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\\/]/.test(v.filename)||v.filename==='.'||v.filename==='..')throw new SupportContentError();
 const bytes=Buffer.from(v.dataBase64,'base64');if(!bytes.length||bytes.length>SUPPORT_FILE_LIMIT||bytes.toString('base64')!==v.dataBase64)throw new SupportContentError();
 const ext=v.filename.toLowerCase().split('.').at(-1);
 if(v.mimeType==='text/plain'){
  if(ext!=='txt')throw new SupportContentError();try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw new Error();}catch{throw new SupportContentError();}
 }else if(v.mimeType==='application/pdf'){
  const text=bytes.toString('latin1');if(ext!=='pdf'||!/^%PDF-1\.[0-7][\r\n]/.test(text)||!text.trimEnd().endsWith('%%EOF')||/\/(?:JavaScript|JS|OpenAction|AA|Launch|RichMedia|EmbeddedFile|Encrypt|XFA)\b/.test(text)||/<\s*(?:script|html|svg)\b/i.test(text))throw new SupportContentError();
 }else if(v.mimeType==='image/png'){
  if(ext!=='png'||bytes.length<45||!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw new SupportContentError();
  let offset=8,first=true,ended=false,idat=false;while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),end=offset+12+length;if(end>bytes.length||crc32(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))throw new SupportContentError();const type=bytes.subarray(offset+4,offset+8).toString('ascii');if(!/^[A-Za-z]{4}$/.test(type)||!first&&type==='IHDR')throw new SupportContentError();if(first){if(type!=='IHDR'||length!==13)throw new SupportContentError();const w=bytes.readUInt32BE(offset+8),h=bytes.readUInt32BE(offset+12);if(!w||!h||w>16000||h>16000||w*h>12000000)throw new SupportContentError();first=false;}if(type==='IDAT')idat=true;if(type==='IEND'){if(length!==0||end!==bytes.length||!idat)throw new SupportContentError();ended=true;}offset=end;}if(!ended||offset!==bytes.length)throw new SupportContentError();
 }else{
  if(!['jpg','jpeg'].includes(ext!)||bytes.length<12||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)throw new SupportContentError();
  let offset=2,dimensions=false,scan=false;while(offset<bytes.length-2){if(bytes[offset++]!==0xff)throw new SupportContentError();while(bytes[offset]===0xff)offset++;const marker=bytes[offset++];if(marker===0xda){scan=true;break;}if(marker===0xd9||marker===0||marker===0xd8||marker>=0xd0&&marker<=0xd7||offset+2>bytes.length)throw new SupportContentError();const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)throw new SupportContentError();if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)throw new SupportContentError();const h=bytes.readUInt16BE(offset+3),w=bytes.readUInt16BE(offset+5);if(!w||!h||w>16000||h>16000||w*h>12000000)throw new SupportContentError();dimensions=true;}offset+=length;}if(!dimensions||!scan)throw new SupportContentError();
 }
 return {filename:v.filename.normalize('NFC'),mimeType:v.mimeType,bytes,byteLength:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
