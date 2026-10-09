/** Public JSON leaves may never carry arbitrary stored objects or arrays. */
export type PublicLeafKind='text'|'integer'|'boolean'|'amount'|'asset';
export function publicLeaf(value:unknown,kind:PublicLeafKind):any {
 if(value===undefined)return undefined;
 if(kind==='text'&&typeof value==='string'||kind==='integer'&&typeof value==='number'&&Number.isSafeInteger(value)&&value>=0||kind==='boolean'&&typeof value==='boolean')return value;
 if(kind==='amount'&&typeof value==='string'&&/^(0|[1-9]\d{0,77})$/.test(value)&&BigInt(value)<(1n<<256n))return value;
 if(kind==='asset'&&typeof value==='string'&&value.length<=2000){if(value==='')return value;try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password)return value;}catch{}}
 throw Error('PROJECTION_UNAVAILABLE');
}
type PublicProjection<T extends Record<string,PublicLeafKind>>={[K in keyof T]:T[K] extends 'integer'?number|undefined:T[K] extends 'boolean'?boolean|undefined:string|undefined};
export function publicRecord<T extends Record<string,PublicLeafKind>>(value:unknown,fields:T):PublicProjection<T>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('PROJECTION_UNAVAILABLE');
 return Object.fromEntries(Object.entries(fields).map(([field,kind])=>[field,publicLeaf((value as Record<string,unknown>)[field],kind)])) as PublicProjection<T>;
}
export function publicRecords<T extends Record<string,PublicLeafKind>>(value:unknown,fields:T){if(value===undefined)return undefined;if(!Array.isArray(value))throw Error('PROJECTION_UNAVAILABLE');return value.map(v=>publicRecord(v,fields))}
