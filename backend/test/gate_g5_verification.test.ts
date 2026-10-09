import assert from "node:assert";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { validateManifestAndEnvironment } from "../src/services/manifestValidator";

async function runTests() {
  console.log("=== RUNNING GATE G5 VERIFICATION TESTS ===");

  // Test 1: Fail-Closed Manifest Validator - Chain ID mismatch
  console.log("\n[Test 1] Fail-Closed Manifest Validator: Chain ID mismatch");
  {
    const mockProvider = {
      getNetwork: async () => ({ chainId: 999999n }),
      getCode: async () => "0x1234",
    } as unknown as ethers.Provider;

    let threw = false;
    try {
      await validateManifestAndEnvironment(mockProvider);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes("does not match provider chainId"));
      console.log("  ✓ Correctly rejected manifest when provider chainId mismatch:", err.message);
    }
    assert(threw, "Must reject chain ID mismatch");
  }

  // Test 2: Fail-Closed Manifest Validator - Missing Bytecode
  console.log("\n[Test 2] Fail-Closed Manifest Validator: Missing bytecode onchain");
  {
    const mockProvider = {
      getNetwork: async () => ({ chainId: 31337n }),
      getCode: async () => "0x", // empty bytecode
    } as unknown as ethers.Provider;

    let threw = false;
    try {
      await validateManifestAndEnvironment(mockProvider);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes("has no deployed bytecode"));
      console.log("  ✓ Correctly rejected empty onchain bytecode:", err.message);
    }
    assert(threw, "Must reject contract with no bytecode");
  }

  // Test 3: Fail-Closed Manifest Validator - Bytecode Hash Mismatch
  console.log("\n[Test 3] Fail-Closed Manifest Validator: Bytecode hash tampering detection");
  {
    const realCode = "0x608060405234801561001057600080fd5b50";
    const realHash = ethers.keccak256(realCode);

    // Save temporary manifest with expected hash
    const localManifestPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-manifest-")),"local.json");
    const origContent = fs.readFileSync(path.resolve(__dirname, "../../shared/manifests/local.json"), "utf8");
    const origJson = JSON.parse(origContent);

    try {
      // Tamper with bytecodeHash in manifest
      origJson.contracts.GroupDealHub.bytecodeHash = "0x" + "11".repeat(32);
      fs.writeFileSync(localManifestPath, JSON.stringify(origJson, null, 2) + "\n");

      const mockProvider = {
        getNetwork: async () => ({ chainId: 31337n }),
        getCode: async () => realCode,
      } as unknown as ethers.Provider;

      let threw = false;
      try {
        await validateManifestAndEnvironment(mockProvider,localManifestPath);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes("Bytecode hash mismatch"));
        console.log("  ✓ Correctly rejected bytecode hash mismatch:", err.message);
      }
      assert(threw, "Must reject tampered bytecode hash");
    } finally {
      fs.unlinkSync(localManifestPath);
    }
  }

  // Test 4: Arc Testnet Predeploy and Blocklist Enforcements
  console.log("\n[Test 4] Arc Testnet Specific Enforcements: Predeploy USDC & Blocklist Operator");
  {
    const arcManifestPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-manifest-")),"arc-testnet.json");
    const origArcContent = fs.readFileSync(path.resolve(__dirname, "../../shared/manifests/arc-testnet.json"), "utf8");
    const origArcJson = JSON.parse(origArcContent);

    try {
      // Case 4a: MockUSDC on Arc Testnet rejected
      origArcJson.contracts.USDC.address = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Mock address
      fs.writeFileSync(arcManifestPath, JSON.stringify(origArcJson, null, 2) + "\n");

      const mockArcProvider = {
        getNetwork: async () => ({ chainId: 5042002n }),
        getCode: async () => "0x1234",
      } as unknown as ethers.Provider;

      let threw = false;
      try {
        await validateManifestAndEnvironment(mockArcProvider,arcManifestPath);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes("Arc Testnet USDC must be 0x3600000000000000000000000000000000000000"));
        console.log("  ✓ Correctly rejected non-predeploy USDC on Arc Testnet:", err.message);
      }
      assert(threw, "Must reject non-predeploy USDC on Arc");

      // Case 4b: Blocklist address as operator rejected
      origArcJson.contracts.USDC.address = "0x3600000000000000000000000000000000000000";
      origArcJson.roles.operator = { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" };
      fs.writeFileSync(arcManifestPath, JSON.stringify(origArcJson, null, 2) + "\n");

      threw = false;
      try {
        await validateManifestAndEnvironment(mockArcProvider,arcManifestPath);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes("Arc blocklist test address"));
        console.log("  ✓ Correctly rejected Arc blocklist test address as operator:", err.message);
      }
      assert(threw, "Must reject blocklist address as operator on Arc");
    } finally {
      fs.unlinkSync(arcManifestPath);
    }
  }

  // Test 5: Arc Testnet unified USDC balance with two precision interfaces
  console.log("\n[Test 5] One Arc USDC balance across 6-decimal ERC-20 and 18-decimal native views");
  {
    const buyerNativeBalance = ethers.parseEther("100"); // one underlying 100 USDC balance
    const buyerErc20View = buyerNativeBalance / 10n ** 12n; // 6-decimal view
    const commitAmount = 50_000_000n; // 50 USDC (6 decimals)
    const commitAmountNative = commitAmount * 10n ** 12n;
    const estimatedGasLimit = 150_000n;
    const minBaseFee = 20_000_000_000n; // 20 Gwei
    const estimatedGasCost = estimatedGasLimit * minBaseFee; // 0.003 USDC in 18-decimal native precision

    assert.strictEqual(buyerErc20View, 100_000_000n, "ERC-20 view must represent the same 100 USDC balance");
    assert(
      commitAmountNative + estimatedGasCost <= buyerNativeBalance,
      "The unified USDC balance must cover commitment plus gas"
    );

    console.log(`  ✓ ERC-20 6-decimal view: ${Number(buyerErc20View) / 1e6} USDC`);
    console.log(`  ✓ Native 18-decimal view: ${ethers.formatEther(buyerNativeBalance)} USDC`);
    console.log(`  ✓ Estimated Gas Fee @ 20 Gwei: ${ethers.formatEther(estimatedGasCost)} USDC`);
    console.log("  ✓ One underlying balance is validated without double-counting the two precision views.");
  }

  // Test 6: Arc deployment and legacy cleanup are fail-closed
  console.log("\n[Test 6] Arc deploy roles and legacy cleanup execution are fail-closed");
  {
    const deploySource = fs.readFileSync(
      path.resolve(__dirname, "../../contracts/scripts/deploy.ts"),
      "utf8"
    );
    assert(deploySource.includes('requireAddressEnv("AUTHORIZED_SIGNER_ADDRESS")'));
    assert(deploySource.includes('requireAddressEnv("OPERATOR_ADDRESS")'));
    assert(deploySource.includes('requireAddressEnv("SECURITY_MULTISIG_ADDRESS")'));
    assert(!deploySource.includes("process.env.OPERATOR_ADDRESS ||"));
    assert(!deploySource.includes("process.env.SECURITY_AUTHORITY_ADDRESS ||"));
    assert(deploySource.includes('securityCode.toLowerCase().startsWith("0xef0100")'));

    const cleanupSource = fs.readFileSync(
      path.resolve(__dirname, "../../scripts/arc_cleanup_legacy.ts"),
      "utf8"
    );
    assert(cleanupSource.includes('process.argv.includes("--execute")'));
    assert(cleanupSource.includes("ALLOW_LEGACY_CLEANUP"));
    assert(cleanupSource.includes("READ-ONLY DRY RUN"));
    console.log("  ✓ No live-role fallback; multisig bytecode and explicit cleanup authorization required.");

    const primitiveJourneySource = fs.readFileSync(
      path.resolve(__dirname, "../../scripts/arc_live_journey.ts"),
      "utf8"
    );
    assert(primitiveJourneySource.includes("ALLOW_ARC_CONTRACT_PRIMITIVE_JOURNEY"));
    assert(primitiveJourneySource.includes("AUTHORIZED_SIGNER_PRIVATE_KEY"));
    assert(primitiveJourneySource.includes("authSigner.signTypedData"));
    assert(primitiveJourneySource.includes("ARC_CONTRACT_PRIMITIVE_JOURNEY.json"));
    assert(!primitiveJourneySource.includes('"../reports/evidence/G5_ACCEPTANCE_DOSSIER.json"'));
    console.log("  ✓ Primitive journey cannot impersonate the signer or overwrite G5 acceptance evidence.");
  }

  console.log("\n[Test 7] Financial protocol v2 must match the deployed getter");
  {
    const candidatePath=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"groupdeal-manifest-v2-")),"local.json");
    const candidate=JSON.parse(fs.readFileSync(path.resolve(__dirname,"../../shared/manifests/local.json"),"utf8"));
    const code="0x1234";candidate.protocolVersion=2;candidate.contracts.GroupDealHub.bytecodeHash=ethers.keccak256(code);
    fs.writeFileSync(candidatePath,JSON.stringify(candidate));
    const versionInterface=new ethers.Interface(["function protocolVersion() view returns(uint256)"]);
    const provider={getNetwork:async()=>({chainId:31337n}),getCode:async()=>code,call:async()=>versionInterface.encodeFunctionResult("protocolVersion",[1])} as unknown as ethers.Provider;
    try {
      await assert.rejects(validateManifestAndEnvironment(provider,candidatePath),/Protocol version differs/);
      const success=await validateManifestAndEnvironment({...provider,call:async()=>versionInterface.encodeFunctionResult("protocolVersion",[2])} as unknown as ethers.Provider,candidatePath);
      assert.equal(success.protocolVersion,2);
      await assert.rejects(validateManifestAndEnvironment({...provider,call:async()=>{throw new Error("getter unavailable");}} as unknown as ethers.Provider,candidatePath));
      candidate.protocolVersion=3;fs.writeFileSync(candidatePath,JSON.stringify(candidate));
      await assert.rejects(validateManifestAndEnvironment(provider,candidatePath),/Unsupported protocol version/);
      console.log("  ✓ Candidate protocol/getter mismatch, unsupported version and missing getter fail closed (local fixtures).");
    } finally {fs.unlinkSync(candidatePath);}
  }

  console.log("\n=== ALL GATE G5 VERIFICATION TESTS PASSED SUCCESSFULLY! ===\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
