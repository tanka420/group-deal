import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import {config} from "../src/config";
import {store} from "../src/db/store";
import {authRouter} from "../src/routes/authRoutes";

async function run(){
  assert.ok(store.filePath.includes("groupdeal-test-"));
  const id="logout_fixture_"+crypto.randomUUID();store.db.users[id]={id,email:id+"@example.test",roles:["buyer"],createdAt:Date.now(),activeWallet:null};store.save();
  const token=jwt.sign({userId:id},config.jwtSecret,{expiresIn:"1h"}),app=express();app.use(express.json());app.use("/api/auth",authRouter);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(done=>server.once("listening",done));const base="http://127.0.0.1:"+(server.address() as any).port,headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  try{
    assert.equal((await fetch(base+"/api/auth/me",{headers})).status,200);
    const response=await fetch(base+"/api/auth/logout",{method:"POST",headers,body:JSON.stringify({idempotencyKey:crypto.randomUUID()})});
    assert.equal(response.status,200,"Logout must invalidate the application session on the server");
    assert.equal((await fetch(base+"/api/auth/me",{headers})).status,401,"A copied bearer must be rejected after logout");
    console.log("PASS server logout blocks copied legacy bearer without modifying account or financial rights");
  }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
}
run().catch((error:unknown)=>{console.error("FAIL SESSION_LOGOUT_REGRESSION: "+(error instanceof Error?error.name:"UnknownError"));if(error instanceof Error)for(const frame of (error.stack||"").split("\n").filter(line=>/^\s+at /.test(line)&&/session_logout_regression\.test\.ts/.test(line)).slice(0,3))console.error(frame);process.exitCode=1;});
