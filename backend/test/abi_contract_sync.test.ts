import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { HUB_ABI } from "../src/services/onchainService";

async function runAbiSyncTest() {
  console.log("=== Running ABI & Contract Sync Verification Test ===");

  const artifactPath = path.resolve(__dirname, "../../contracts/artifacts/contracts/GroupDealHub.sol/GroupDealHub.json");
  assert.ok(fs.existsSync(artifactPath), "Artifact file must exist");

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const contractIface = new ethers.Interface(artifact.abi);
  const serviceIface = new ethers.Interface(HUB_ABI);

  const keyFunctions = [
    "createCampaign",
    "recordDelivery",
    "finalizeCampaign",
    "confirmReceipt",
    "settleUndisputedOrder",
    "resolveDispute",
    "emergencyCancelCampaign",
    "allocateRebatesBatch",
    "nextCampaignId",
    "getCampaignTiers",
  ];

  for (const fn of keyFunctions) {
    const contractFn = contractIface.getFunction(fn);
    assert.ok(contractFn, `Function ${fn} must exist in contract ABI`);

    const serviceFn = serviceIface.getFunction(fn);
    assert.ok(serviceFn, `Function ${fn} must exist in backend HUB_ABI`);

    assert.strictEqual(
      serviceFn.selector,
      contractFn.selector,
      `Selector mismatch for ${fn}: service=${serviceFn.selector}, contract=${contractFn.selector}`
    );
    console.log(`✔ Function ${fn} selector matches perfectly: ${serviceFn.selector}`);
  }

  console.log("🎉 ALL KEY FUNCTION SELECTORS MATCH THE COMPILED CONTRACT ARTIFACT!\n");
}

runAbiSyncTest().catch((e) => {
  console.error("ABI Sync Test Failed:", e);
  process.exit(1);
});
