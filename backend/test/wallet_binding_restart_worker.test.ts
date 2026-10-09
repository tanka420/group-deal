import fs from "node:fs";
import path from "node:path";
import {TransactionalStore} from "../src/db/store";
import {WalletBindingRegistry} from "../src/services/walletBindingService";
const input=JSON.parse(fs.readFileSync(0,"utf8"));
if(typeof input.directory!=="string"||!path.basename(input.directory).startsWith("groupdeal-test-wallet-binding-")||typeof input.token!=="string")throw new Error("Invalid isolated worker input");
const db=new TransactionalStore(input.directory);
try{const w=new WalletBindingRegistry(db),status=w.status(input.token,input.id),wallets=w.inventory(input.token,{});if(status.state!=="COMMITTED"||status.currentActiveWallet!==input.expected||wallets.wallets.length!==2)throw new Error("Wallet recovery failed");process.stdout.write("PASS wallet intent and retained credentials after process restart\n");}finally{db.close();}
