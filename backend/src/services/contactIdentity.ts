import crypto from "node:crypto";
import {z} from "zod";
import {store,ContactChallengeRecord,UserRecord} from "../db/store";
import {decryptEntitlement,encryptionKey} from "../utils/crypto";
export const contactEmailSchema=z.string().email().max(254);
const verifiedSchema=z.object({kind:z.literal("CONTACT_VERIFIED_V1"),userId:z.string(),revision:z.number().int().nonnegative(),email:contactEmailSchema}).strict();
const targetSchema=z.object({kind:z.literal("CONTACT_TARGET_V1"),userId:z.string(),challengeId:z.string(),baseRevision:z.number().int().nonnegative(),email:contactEmailSchema}).strict();
export function verifiedContactEmail(userId:string):string|null {return verifiedContactEmailFor(userId,store.db.users[userId]);}
export function verifiedContactEmailFor(userId:string,user:UserRecord|undefined):string|null {
  if(!user)return null;
  if(!user.contact)return user.emailVerified===true&&contactEmailSchema.safeParse(user.email).success?user.email:null;
  try{
    const record=user.contact,verified=record.verified;if(!verified||record.version!==1)return null;
    const payload=verifiedSchema.parse(JSON.parse(decryptEntitlement(verified.payloadEncrypted)));
    return payload.userId===userId&&payload.revision===record.revision?payload.email:null;
  }catch{return null;}
}
export function contactStatusFor(userId:string,user:UserRecord|undefined):"VERIFIED"|"UNVERIFIED"|"MISSING" {
  if(verifiedContactEmailFor(userId,user))return "VERIFIED";
  if(user?.contact)return user.contact.pending?.state==="PENDING"||user.contact.verified?"UNVERIFIED":"MISSING";
  return user?.email&&contactEmailSchema.safeParse(user.email).success?"UNVERIFIED":"MISSING";
}
export function contactStatus(userId:string):"VERIFIED"|"UNVERIFIED"|"MISSING" {return contactStatusFor(userId,store.db.users[userId]);}
export function challengeTarget(userId:string,challenge:ContactChallengeRecord):string {
  const payload=targetSchema.parse(JSON.parse(decryptEntitlement(challenge.targetEncrypted)));
  if(payload.userId!==userId||payload.challengeId!==challenge.id||payload.baseRevision!==challenge.baseRevision)throw new Error("CONTACT_BINDING_INVALID");
  return payload.email;
}
export function contactCodeDigest(userId:string,challenge:Pick<ContactChallengeRecord,"id"|"keyId"|"salt"|"baseRevision">,code:string):string {
  const purposeKey=crypto.createHmac("sha256",encryptionKey(challenge.keyId)).update("groupdeal:contact:otp:v1").digest();
  return crypto.createHmac("sha256",purposeKey).update(JSON.stringify([userId,challenge.id,challenge.baseRevision,challenge.salt,code])).digest("hex");
}
export function contactCodeMatches(userId:string,challenge:ContactChallengeRecord,code:string):boolean {
  if(!/^\d{6}$/.test(code)||! /^[a-f0-9]{64}$/.test(challenge.codeDigest))return false;
  const actual=Buffer.from(contactCodeDigest(userId,challenge,code),"hex"),expected=Buffer.from(challenge.codeDigest,"hex");
  return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
export function maskedContact(email:string):string {const at=email.lastIndexOf("@");return email.slice(0,1)+"***"+email.slice(at);}
