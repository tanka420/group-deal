import crypto from "node:crypto";
import {config} from "../config";
import {encryptionKey} from "../utils/crypto";

/** Purpose and record ID are authenticated, so subscription/job ciphertexts cannot be swapped. */
export function encryptWebhookSecret(secret:string,recordId:string):string {
  const keyId=config.masterEncryptionKeyId,iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey(keyId),iv);
  cipher.setAAD(Buffer.from("groupdeal:webhook:wh2:"+keyId+":"+recordId));
  const ciphertext=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
  return ["wh2",keyId,iv.toString("hex"),cipher.getAuthTag().toString("hex"),ciphertext.toString("hex")].join(":");
}

export function decryptWebhookSecret(payload:string,recordId:string):string {
  const [version,keyId,iv,tag,ciphertext,...extra]=payload.split(":");
  if(version!=="wh2"||extra.length||!/^[-a-zA-Z0-9_]{1,64}$/.test(keyId)||!/^[a-f0-9]{24}$/.test(iv)||!/^[a-f0-9]{32}$/.test(tag)||!/^(?:[a-f0-9]{2})+$/.test(ciphertext))throw new Error("Invalid encrypted webhook secret");
  try {
    const decipher=crypto.createDecipheriv("aes-256-gcm",encryptionKey(keyId),Buffer.from(iv,"hex"));
    decipher.setAAD(Buffer.from("groupdeal:webhook:wh2:"+keyId+":"+recordId));decipher.setAuthTag(Buffer.from(tag,"hex"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext,"hex")),decipher.final()]).toString("utf8");
  }catch{throw new Error("Webhook secret authentication or retained key failed");}
}
