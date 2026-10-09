import crypto from "node:crypto";
import {RequestHandler} from "express";

/** Per-process abuse budget. Express defaults to the socket peer; untrusted Forwarded/X-Forwarded-For headers cannot choose a bucket. */
export function publicRateLimit(maxRequests=120,windowMs=60000,capacity=4096):RequestHandler {
  const buckets=new Map<string,{count:number;expiresAt:number}>(),salt=crypto.randomBytes(32);
  return (req,res,next)=>{
    const now=Date.now(),key=crypto.createHmac("sha256",salt).update(req.ip||req.socket.remoteAddress||"unknown").digest("hex");
    let bucket=buckets.get(key);
    if(!bucket||bucket.expiresAt<=now){
      for(const [id,entry] of buckets)if(entry.expiresAt<=now)buckets.delete(id);
      if(buckets.size>=capacity&&!bucket){res.setHeader("Retry-After","60");res.status(429).json({code:"RATE_LIMITED",error:"Public API request budget exhausted; retry later"});return;}
      bucket={count:0,expiresAt:now+windowMs};buckets.set(key,bucket);
    }
    bucket.count++;if(bucket.count>maxRequests){res.setHeader("Retry-After",String(Math.max(1,Math.ceil((bucket.expiresAt-now)/1000))));res.status(429).json({code:"RATE_LIMITED",error:"Public API request budget exhausted; retry later"});return;}
    next();
  };
}
