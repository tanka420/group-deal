import {createHash} from 'node:crypto';

export const productImageLimit=1024*1024;
export type ProductImage={id:string;sellerId:string;sha256:string;mimeType:'image/png'|'image/jpeg';byteLength:number;dataBase64:string;createdAt:number};
export const productImageId=(sellerId:string,hash:string)=>'img_'+createHash('sha256').update(sellerId+'\0'+hash).digest('hex');
function crc32(bytes:Buffer){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
/** Raster formats only. Never reflect a caller's filename or content type into a response. */
export function inspectProductImage(bytes:Buffer):ProductImage['mimeType']{
 if(!bytes.length||bytes.length>productImageLimit)throw Error('MEDIA_INPUT_INVALID');
 let width=0,height=0;
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  if(bytes.length<45||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')throw Error('MEDIA_INPUT_INVALID');
  width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  let offset=8,ended=false,idat=false;
  while(offset+12<=bytes.length){const size=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);if(size>productImageLimit||offset+12+size>bytes.length||!/^([A-Za-z]){4}$/.test(kind)||kind==='acTL'||crc32(bytes.subarray(offset+4,offset+8+size))!==bytes.readUInt32BE(offset+8+size))throw Error('MEDIA_INPUT_INVALID');if(kind==='IDAT')idat=true;offset+=12+size;if(kind==='IEND'){ended=size===0&&offset===bytes.length;break}}
  if(!ended||!idat)throw Error('MEDIA_INPUT_INVALID');
  if(!width||!height||width>4096||height>4096||width*height>12000000)throw Error('MEDIA_INPUT_INVALID');
  return 'image/png';
 }
 if(bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217){
  let offset=2,scan=false;
  while(offset+4<=bytes.length){if(bytes[offset++]!==255)throw Error('MEDIA_INPUT_INVALID');while(bytes[offset]===255)offset++;if(offset+3>bytes.length)throw Error('MEDIA_INPUT_INVALID');const marker=bytes[offset++];const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)throw Error('MEDIA_INPUT_INVALID');if(marker===0xda){if(length<6||offset+length>=bytes.length-2)throw Error('MEDIA_INPUT_INVALID');scan=true;break;}if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)throw Error('MEDIA_INPUT_INVALID');height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);}offset+=length;}
  if(!scan||!width||!height||width>4096||height>4096||width*height>12000000)throw Error('MEDIA_INPUT_INVALID');
  return 'image/jpeg';
 }
 throw Error('MEDIA_INPUT_INVALID');
}
