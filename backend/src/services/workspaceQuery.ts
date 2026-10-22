import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {config} from '../config';
const id=z.string().regex(/^[-A-Za-z0-9_:]{1,180}$/),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const workspaceQuery=z.object({limit:z.literal('20').default('20'),cursor:z.string().max(4096).optional(),q:z.string().trim().max(180).optional(),status:z.string().max(40).optional(),from:date.optional(),to:date.optional(),campaignId:id.optional(),productId:id.optional(),orderId:id.optional(),sort:z.enum(['START_DESC','END_ASC','TITLE']).optional(),principal:z.string().regex(/^0x[\da-fA-F]{40}$/).transform(v=>v.toLowerCase()).optional(),direction:z.enum(['BUY','SELL']).optional()}).strict();
export type WorkspaceKind='seller-campaigns'|'seller-orders'|'buyer-orders'|'seller-products'|'wallet-trades';
export type WorkspaceSelection={kind:WorkspaceKind;filters:Omit<z.infer<typeof workspaceQuery>,'cursor'|'limit'>;after?:{value:string|number;id:string};from?:number;to?:number};
export function workspaceSelection(input:unknown,owner:string,kind:WorkspaceKind):WorkspaceSelection{
 const {cursor,limit,...filters}=workspaceQuery.parse(input),selection:WorkspaceSelection={kind,filters};
 const bound=(v:string)=>{const stamp=Date.parse(v+'T00:00:00+07:00');if(!Number.isFinite(stamp)||new Date(stamp+25200000).toISOString().slice(0,10)!==v)throw Error('WORKSPACE_DATE_INVALID');return stamp;};
 if(filters.from)selection.from=bound(filters.from);if(filters.to)selection.to=bound(filters.to)+86400000;if(selection.from!==undefined&&selection.to!==undefined&&selection.from>=selection.to)throw Error('WORKSPACE_DATE_INVALID');
 if(cursor){try{const [body,signature,...rest]=cursor.split('.'),expected=mac(owner,kind,filters,body);if(rest.length||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))throw Error();const v=JSON.parse(Buffer.from(body,'base64url').toString());if(!Array.isArray(v)||v.length!==2||typeof v[0]!=='string'&&!(Number.isSafeInteger(v[0])&&v[0]>=0)||typeof v[0]==='string'&&v[0].length>1000||!id.safeParse(v[1]).success)throw Error();selection.after={value:v[0],id:v[1]};}catch{throw Error('WORKSPACE_CURSOR_INVALID');}}
 return selection;
}
function mac(owner:string,kind:WorkspaceKind,filters:unknown,body:string){return createHmac('sha256',config.jwtSecret).update(JSON.stringify(['workspace:v1',owner,kind,config.arcChainId,config.hubAddress.toLowerCase(),filters,body])).digest('hex');}
export function workspacePagination(owner:string,selection:WorkspaceSelection,total:number,rows:{value:string|number;id:string}[]){const last=rows.slice(0,20).at(-1),body=rows.length>20&&last?Buffer.from(JSON.stringify([last.value,last.id])).toString('base64url'):null;return {limit:20,total,nextCursor:body?body+'.'+mac(owner,selection.kind,selection.filters,body):null};}
