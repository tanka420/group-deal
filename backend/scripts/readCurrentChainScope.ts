import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { ArcReadProvider } from "../src/services/arcReadProvider";
import { config } from "../src/config";
import { HUB_ABI } from "../src/contracts/hubAbi";

async function main() {
  const provider = new ArcReadProvider();
  const root=path.resolve(__dirname,"../..");
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"shared/manifests/arc-testnet.json"),"utf8"));
  const report:Record<string,any>={recordedAt:new Date().toISOString(),scope:"READ_ONLY_CHAIN_INVENTORY",chainId:config.arcChainId,hubAddress:config.hubAddress,deploymentBlock:config.deploymentBlock,status:"UNVERIFIED",transactionsSent:false,databaseAccess:false};
  try {
    const head=await provider.getBlock("latest");
    if (!head?.hash || config.arcChainId!==manifest.chainId || config.hubAddress.toLowerCase()!==manifest.contracts.GroupDealHub.address.toLowerCase()) throw new Error();
    const hub=new ethers.Contract(config.hubAddress,HUB_ABI,provider),token=new ethers.Contract(config.usdcAddress,["function balanceOf(address) view returns(uint256)"],provider),at={blockTag:head.number};
    const [code,nextCampaign,nextOrder,balance]=await Promise.all([provider.getCode(config.hubAddress,head.number),hub.nextCampaignId(at),hub.nextOrderId(at),token.balanceOf(config.hubAddress,at)]);
    const runtimeHash=ethers.keccak256(code);
    if (runtimeHash!==manifest.contracts.GroupDealHub.bytecodeHash || (await provider.getBlock(head.number))?.hash!==head.hash) throw new Error();
    Object.assign(report,{status:"CHAIN_SCOPE_VERIFIED",blockNumber:head.number,blockHash:head.hash,runtimeBytecodeHash:runtimeHash,campaignCount:String(nextCampaign-1n),orderCount:String(nextOrder-1n),hubBalanceBaseUSDC:String(balance)});
  } catch {report.failure="Fixed-block chain scope could not be verified; no database or transaction was changed";process.exitCode=1;}
  finally {provider.destroy();const output=path.join(root,"reports/evidence",`CHAIN_SCOPE_${Date.now()}.json`);fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,evidence:path.relative(root,output).replaceAll("\\","/"),campaignCount:report.campaignCount,orderCount:report.orderCount}));}
}
main().catch(()=>{console.error("Read-only chain inventory could not start");process.exitCode=1;});
