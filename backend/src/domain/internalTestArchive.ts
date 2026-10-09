import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import type {DatabaseSchema} from '../db/store';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
const footprintSchema=z.array(z.object({file:z.enum(['groupdeal.sqlite','groupdeal.sqlite-wal','groupdeal.sqlite-shm','groupdeal_db.json','groupdeal_db.json.tmp']),byteLength:z.number().int().nonnegative(),sha256:digest}).strict()).min(1).max(5);
const recordSchema=z.object({kind:z.enum(['CAMPAIGN','ORDER']),reference:digest}).strict();
const originSchema=z.object({schemaVersion:z.literal(1),classification:z.literal('INTERNAL_TEST'),classificationScope:z.literal('LEGACY_ROWS_ONLY'),declaredSource:z.literal('DIRECT_USER_REPLY'),declaredAt:z.string().datetime(),userStatement:z.literal('Dữ liệu thử nội bộ'),sourceFootprint:footprintSchema,records:z.array(recordSchema).min(1).max(1000),ownershipReassignmentAllowed:z.literal(false),financialBindingAssignmentAllowed:z.literal(false),heldWorkReleaseAllowed:z.literal(false),applicationAdmissionAllowed:z.literal(false)}).strict();
export class InternalTestArchiveError extends Error{constructor(public readonly code:string){super(code);}}
const fail=(code:string):never=>{throw new InternalTestArchiveError(code);};
const reference=(kind:string,id:string)=>crypto.createHash('sha256').update('groupdeal:legacy-review:'+kind+':'+id).digest('hex');
const fixtureAddresses=new Set(['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266','0x70997970c51812dc3a010c7d01b50e0d17dc79c8','0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc','0x90f79bf6eb2c4f870365e785982e1f101e93b906','0x15d34aaf54267db7d7c367839aaf71a00a2c6a65','0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc','0x976ea74026e726554db657fa54763abd0c3a0aa9','0x14dc79964da2c08b23698b3d3cc7ca32193d9955','0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f','0xa0ee7a142d267c1f36714e4a8f75612f20a79720']);
const fixture=(value:unknown)=>typeof value==='string'&&fixtureAddresses.has(value.toLowerCase());
const receipt=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value);
export function parseInternalTestOrigin(value:unknown,sourceFootprint:unknown){
 const result=originSchema.safeParse(value);if(!result.success)fail('INTERNAL_TEST_ORIGIN_INVALID');
 const origin=result.data!;if(new Set(origin.sourceFootprint.map(row=>row.file)).size!==origin.sourceFootprint.length||!origin.sourceFootprint.some(row=>row.file==='groupdeal.sqlite'&&row.byteLength>0)||new Set(origin.records.map(row=>row.kind+':'+row.reference)).size!==origin.records.length||Date.parse(origin.declaredAt)>Date.now()+30000)fail('INTERNAL_TEST_ORIGIN_INVALID');
 if(!isDeepStrictEqual(origin.sourceFootprint,sourceFootprint))fail('INTERNAL_TEST_ORIGIN_SOURCE_CHANGED');return origin;
}
/** Scoped classification is not proof of ownership, financial binding, job review or admission. */
export function assertInternalTestArchiveContent(origin:ReturnType<typeof parseInternalTestOrigin>,state:DatabaseSchema,review:{campaigns:{reference:string}[];orders:{reference:string}[]}){
 const declared=origin.records.map(row=>row.kind+':'+row.reference).sort(),actual=[...review.campaigns.map(row=>'CAMPAIGN:'+row.reference),...review.orders.map(row=>'ORDER:'+row.reference)].sort();
 if(!isDeepStrictEqual(declared,actual))fail('INTERNAL_TEST_ORIGIN_RECORDS_CHANGED');
 for(const item of origin.records){const kind=item.kind==='CAMPAIGN'?'campaign':'order',rows=item.kind==='CAMPAIGN'?state.campaigns:state.orders;const matches=Object.entries(rows).filter(([id])=>reference(kind,id)===item.reference);if(matches.length!==1)fail('INTERNAL_TEST_ORIGIN_RECORDS_CHANGED');const [id,value]=matches[0],row=value as any;
  if(row.id!==id||row.chainId!==undefined&&row.chainId!==null||row.hubAddress||receipt(row.txHash)||receipt(row.commitmentTxHash))fail('INTERNAL_TEST_CANONICAL_PROVENANCE_REQUIRES_REVIEW');
  if(row.productSnapshot||row.deliveredEntitlementEncrypted)fail('INTERNAL_TEST_PRIVATE_RIGHTS_REQUIRE_REVIEW');
  if(item.kind==='CAMPAIGN'){if(!fixture(row.sellerPayoutWallet))fail('INTERNAL_TEST_ACTOR_REQUIRES_REVIEW');}
  else{if(!fixture(row.buyerPrincipal)||row.buyerAccountId!=='unknown_buyer')fail('INTERNAL_TEST_ACTOR_REQUIRES_REVIEW');
   if(Object.values(state.resourceGrants).some(value=>value.orderId===id)||Object.values(state.licenseInventory).some(value=>value.orderId===id)||Object.values(state.supportTickets).some(value=>value.orderId===id)||(state.supportMessages[id]?.length||0)>0)fail('INTERNAL_TEST_PRIVATE_RIGHTS_REQUIRE_REVIEW');
  }
 }
 return{classificationScope:'LEGACY_ROWS_ONLY' as const,campaigns:review.campaigns.length,orders:review.orders.length,originalRightsPreserved:true,usersOrExternalWorkClassifiedAsTest:false,accountOrFinancialAuthorityAssigned:false};
}
const fileReference=z.object({path:z.string().min(1).max(1024).refine(value=>!value.startsWith('/')&&!value.includes('..')&&!value.includes('\\')&&!value.includes(':')),sha256:digest,byteLength:z.number().int().positive()}).strict();
const receiptBody=z.object({version:z.literal(1),purpose:z.literal('INTERNAL_TEST_ARCHIVE_PREPARATION'),keyId:z.string().regex(/^[-A-Za-z0-9_]{1,64}$/),origin:fileReference,sourceFootprint:footprintSchema,archive:fileReference,recoveryProof:fileReference,sourceToolInputs:z.array(z.object({path:z.string().min(1).max(1024),sha256:digest}).strict()).min(1).max(300),classificationScope:z.literal('LEGACY_ROWS_ONLY'),originalRecordsPreserved:z.literal(true),heldWorkReleaseAllowed:z.literal(false),accountOrFinancialAuthorityAssigned:z.literal(false),applicationAdmissionAllowed:z.literal(false),acceptanceEligible:z.literal(false)}).strict();
const envelopeSchema=z.object({body:receiptBody,mac:digest}).strict();
const mac=(body:unknown,key:Buffer)=>crypto.createHmac('sha256',key).update('groupdeal:internal-test-archive:v1:'+JSON.stringify(body)).digest('hex');
export function signInternalTestArchiveReceipt(body:unknown,key:Buffer){if(!Buffer.isBuffer(key)||key.length!==32)fail('INTERNAL_TEST_ARCHIVE_KEY_INVALID');const parsed=receiptBody.safeParse(body);if(!parsed.success)fail('INTERNAL_TEST_ARCHIVE_RECEIPT_INVALID');return{body:parsed.data!,mac:mac(parsed.data,key)};}
export function verifyInternalTestArchiveReceipt(value:unknown,key:Buffer){if(!Buffer.isBuffer(key)||key.length!==32)fail('INTERNAL_TEST_ARCHIVE_KEY_INVALID');const parsed=envelopeSchema.safeParse(value);if(!parsed.success)fail('INTERNAL_TEST_ARCHIVE_RECEIPT_INVALID');const receipt=parsed.data!;if(!crypto.timingSafeEqual(Buffer.from(receipt.mac,'hex'),Buffer.from(mac(receipt.body,key),'hex')))fail('INTERNAL_TEST_ARCHIVE_RECEIPT_INVALID');return receipt.body;}
