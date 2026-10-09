import assert from "node:assert/strict";
import {ethers} from "ethers";
import {AuthService} from "../src/services/authService";
import {store} from "../src/db/store";

async function main(){
 assert.ok(store.isIsolated);
 const original=ethers.Wallet.createRandom(),added=ethers.Wallet.createRandom();
 const login=AuthService.issueWalletLoginChallenge(original.address);
 const session=AuthService.verifyWalletLogin(original.address,await original.signMessage(login.challengeMessage),login.challengeMessage,login.nonce);
 const challenge=AuthService.issueWalletChallenge(session.user.id,"LINK_WALLET",added.address);
 let accepted=false;try{AuthService.linkExternalWallet(session.user.id,added.address,await added.signMessage(challenge.challengeMessage),challenge.challengeMessage);accepted=true;}catch{}
 const retained=store.db.userByWallet[original.address.toLowerCase()]===session.user.id;
 console.log((retained?"PASS":"FAIL")+" N51: verified original sign-in binding remains on its account");
 console.log((!accepted?"PASS":"FAIL")+" N52: legacy target-only proof cannot add a new sign-in credential");
 assert.ok(retained&&!accepted);
}
main().catch(e=>{console.error("FAIL WALLET_IDENTITY_REGRESSION: "+(e instanceof Error?e.name:"UnknownError"));process.exitCode=1;}).finally(()=>store.close());
