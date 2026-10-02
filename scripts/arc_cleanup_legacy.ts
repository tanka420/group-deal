import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

const requireFromBackend = createRequire(path.resolve(__dirname, "../backend/package.json"));
const { ethers } = requireFromBackend("ethers");
const dotenv = requireFromBackend("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const ARC_CHAIN_ID = 5042002;
const ARC_RPC_URL = process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const LEGACY_HUB_ADDRESS = "0x7d4b958b3e19DA4c5374F70F84297748E5a79F9a";
const EXPECTED_DEPLOYER = "0x73307Bdd39d875f98857FfCE0FED1Cdc62F50b6d";
const EXPECTED_OPERATOR = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const EXPECTED_SECURITY = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
const CAMPAIGN_ID = 1n;
const PENDING_ORDER_ID = 2n;
const GAS_PRICE = 25_000_000_000n;
const MIN_EXECUTION_GAS_BALANCE = ethers.parseEther("0.01");
const EXECUTION_ACK = "I_UNDERSTAND_THIS_SENDS_ARC_TESTNET_TRANSACTIONS";

const deliveryStatusNames = [
  "PENDING",
  "DELIVERED",
  "CONFIRMED",
  "DISPUTED",
  "BREACHED_REFUNDED",
  "RESOLVED",
];

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function serialize(value: unknown) {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);
}

async function main() {
  const execute = process.argv.includes("--execute");
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) {
    throw new Error("[FAIL-CLOSED] DEPLOYER_PRIVATE_KEY is missing; the key is never printed or written.");
  }
  if (execute && process.env.ALLOW_LEGACY_CLEANUP !== EXECUTION_ACK) {
    throw new Error(
      `[FAIL-CLOSED] Live mode also requires ALLOW_LEGACY_CLEANUP=${EXECUTION_ACK}.`
    );
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== ARC_CHAIN_ID) {
    throw new Error(`[FAIL-CLOSED] Expected Arc Testnet chain ${ARC_CHAIN_ID}, got ${network.chainId}.`);
  }

  const deployer = new ethers.Wallet(deployerKey, provider);
  if (!sameAddress(deployer.address, EXPECTED_DEPLOYER)) {
    throw new Error(
      `[FAIL-CLOSED] DEPLOYER_PRIVATE_KEY resolves to ${deployer.address}, not ${EXPECTED_DEPLOYER}.`
    );
  }

  const artifactPath = path.resolve(
    __dirname,
    "../contracts/artifacts/contracts/GroupDealHub.sol/GroupDealHub.json"
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error("[FAIL-CLOSED] Contract artifact is missing. Run npm run compile first.");
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const hub = new ethers.Contract(LEGACY_HUB_ADDRESS, artifact.abi, provider);
  const usdc = new ethers.Contract(
    USDC_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );

  const seller = new ethers.Wallet(
    ethers.keccak256(ethers.toUtf8Bytes(`${deployerKey}:arc:seller`)),
    provider
  );
  const buyer2 = new ethers.Wallet(
    ethers.keccak256(ethers.toUtf8Bytes(`${deployerKey}:arc:buyer2`)),
    provider
  );

  const [code, owner, authorizedSigner, operator, securityAuthority, tokenAddress] = await Promise.all([
    provider.getCode(LEGACY_HUB_ADDRESS),
    hub.owner(),
    hub.authorizedSigner(),
    hub.operatorAddress(),
    hub.securityAuthority(),
    hub.usdcToken(),
  ]);
  if (code === "0x") throw new Error("[FAIL-CLOSED] Legacy Hub has no bytecode.");
  if (!sameAddress(owner, EXPECTED_DEPLOYER) || !sameAddress(authorizedSigner, EXPECTED_DEPLOYER)) {
    throw new Error("[FAIL-CLOSED] Legacy Hub owner/signer identity does not match the accepted target.");
  }
  if (!sameAddress(operator, EXPECTED_OPERATOR) || !sameAddress(securityAuthority, EXPECTED_SECURITY)) {
    throw new Error("[FAIL-CLOSED] Legacy Hub role fingerprint changed; refusing cleanup.");
  }
  if (!sameAddress(tokenAddress, USDC_ADDRESS)) {
    throw new Error("[FAIL-CLOSED] Legacy Hub does not use the Arc USDC predeploy.");
  }

  const terms = await hub.campaignTerms(CAMPAIGN_ID);
  let state = await hub.campaignStates(CAMPAIGN_ID);
  let order = await hub.getOrderDetails(PENDING_ORDER_ID);
  if (!sameAddress(terms.sellerPayoutWallet, seller.address)) {
    throw new Error("[FAIL-CLOSED] Derived seller does not match campaign 1 payout wallet.");
  }
  if (!sameAddress(order.buyerPrincipal, buyer2.address) || order.campaignId !== CAMPAIGN_ID) {
    throw new Error("[FAIL-CLOSED] Derived buyer2 does not match campaign 1/order 2.");
  }

  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) throw new Error("[FAIL-CLOSED] Cannot read latest Arc block.");
  const slaDeadline = state.finalizedAt + terms.deliverySlaSeconds;
  const [currentEscrow, hubUsdcBalance, buyerClaimedAmount, sellerGas, buyer2Gas] = await Promise.all([
    hub.campaignEscrowBalance(CAMPAIGN_ID),
    usdc.balanceOf(LEGACY_HUB_ADDRESS),
    hub.buyerClaimedAmount(PENDING_ORDER_ID),
    provider.getBalance(seller.address),
    provider.getBalance(buyer2.address),
  ]);
  const status = Number(order.deliveryStatus);
  const plan: string[] = [];

  if (status === 0) {
    plan.push(
      BigInt(latestBlock.timestamp) <= slaDeadline
        ? "Seller dẫn xuất ghi nhận delivery cho order 2."
        : "Buyer2 dẫn xuất claimDeliveryBreach vì SLA đã hết."
    );
  }
  if (status === 0 && BigInt(latestBlock.timestamp) <= slaDeadline || status === 1) {
    plan.push("Buyer2 dẫn xuất xác nhận đã nhận hàng cho order 2.");
  }
  const buyerClaimable = order.rebateAllocated + order.buyerRefundAllocated - buyerClaimedAmount;
  if (buyerClaimable > 0n || status === 0 || status === 1) {
    plan.push("Buyer2 rút rebate/refund còn lại.");
  }
  if (!order.sellerClaimed && (status === 0 || status === 1 || status === 2 || status === 5)) {
    plan.push("Seller dẫn xuất rút proceeds còn lại nếu được phân bổ.");
  }
  plan.push("Đối chiếu campaign escrow và số dư USDC của Hub về 0.");

  console.log("=== LEGACY ARC CLEANUP PREFLIGHT ===");
  console.log(`Mode: ${execute ? "LIVE EXECUTION" : "READ-ONLY DRY RUN"}`);
  console.log(`Chain: ${network.chainId}; Hub: ${LEGACY_HUB_ADDRESS}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Derived seller: ${seller.address}`);
  console.log(`Derived buyer2: ${buyer2.address}`);
  console.log(`Order 2 status: ${deliveryStatusNames[status] ?? status}`);
  console.log(`Campaign escrow: ${ethers.formatUnits(currentEscrow, 6)} USDC`);
  console.log(`Hub USDC balance: ${ethers.formatUnits(hubUsdcBalance, 6)} USDC`);
  console.log(`Seller gas balance: ${ethers.formatEther(sellerGas)}`);
  console.log(`Buyer2 gas balance: ${ethers.formatEther(buyer2Gas)}`);
  console.log(`SLA deadline: ${slaDeadline}; latest timestamp: ${latestBlock.timestamp}`);
  console.log("Transaction plan:");
  plan.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));

  if (!execute) {
    console.log("DRY RUN COMPLETE: no transaction was signed or broadcast.");
    return;
  }
  if (sellerGas < MIN_EXECUTION_GAS_BALANCE || buyer2Gas < MIN_EXECUTION_GAS_BALANCE) {
    throw new Error("[FAIL-CLOSED] Derived seller or buyer2 lacks the minimum gas balance for cleanup.");
  }

  const receipts: Array<Record<string, unknown>> = [];
  async function submit(label: string, transactionPromise: Promise<any>) {
    const transaction = await transactionPromise;
    console.log(`[BROADCAST] ${label}: ${transaction.hash}`);
    const receipt = await transaction.wait(2);
    if (!receipt || receipt.status !== 1) throw new Error(`${label} did not confirm successfully.`);
    receipts.push({ label, txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed });
  }

  const sellerHub = hub.connect(seller) as any;
  const buyerHub = hub.connect(buyer2) as any;
  order = await hub.getOrderDetails(PENDING_ORDER_ID);
  state = await hub.campaignStates(CAMPAIGN_ID);
  const executionBlock = await provider.getBlock("latest");
  if (!executionBlock) throw new Error("Cannot read execution block.");

  if (Number(order.deliveryStatus) === 0) {
    if (BigInt(executionBlock.timestamp) <= state.finalizedAt + terms.deliverySlaSeconds) {
      await submit(
        "recordDelivery",
        sellerHub.recordDelivery(
          CAMPAIGN_ID,
          PENDING_ORDER_ID,
          ethers.id("LEGACY-CLEANUP-CAMPAIGN-1-ORDER-2"),
          { gasPrice: GAS_PRICE }
        )
      );
    } else {
      await submit(
        "claimDeliveryBreach",
        buyerHub.claimDeliveryBreach(CAMPAIGN_ID, PENDING_ORDER_ID, { gasPrice: GAS_PRICE })
      );
    }
  }

  order = await hub.getOrderDetails(PENDING_ORDER_ID);
  if (Number(order.deliveryStatus) === 1) {
    await submit(
      "confirmReceipt",
      buyerHub.confirmReceipt(CAMPAIGN_ID, PENDING_ORDER_ID, { gasPrice: GAS_PRICE })
    );
  }

  order = await hub.getOrderDetails(PENDING_ORDER_ID);
  const claimed = await hub.buyerClaimedAmount(PENDING_ORDER_ID);
  if (order.rebateAllocated + order.buyerRefundAllocated > claimed) {
    await submit(
      "claimBuyerFunds",
      buyerHub.claimBuyerFunds(CAMPAIGN_ID, [PENDING_ORDER_ID], { gasPrice: GAS_PRICE })
    );
  }

  order = await hub.getOrderDetails(PENDING_ORDER_ID);
  if (!order.sellerClaimed && order.sellerAllocated > 0n) {
    await submit(
      "claimSellerProceeds",
      sellerHub.claimSellerProceeds(CAMPAIGN_ID, [PENDING_ORDER_ID], { gasPrice: GAS_PRICE })
    );
  }

  const [finalEscrow, finalHubBalance, finalOrder] = await Promise.all([
    hub.campaignEscrowBalance(CAMPAIGN_ID),
    usdc.balanceOf(LEGACY_HUB_ADDRESS),
    hub.getOrderDetails(PENDING_ORDER_ID),
  ]);
  if (finalEscrow !== 0n || finalHubBalance !== 0n) {
    throw new Error(
      `[RECONCILIATION FAILED] escrow=${finalEscrow}, Hub USDC balance=${finalHubBalance}.`
    );
  }

  const evidence = {
    executedAt: new Date().toISOString(),
    chainId: ARC_CHAIN_ID,
    legacyHub: LEGACY_HUB_ADDRESS,
    campaignId: CAMPAIGN_ID,
    orderId: PENDING_ORDER_ID,
    finalDeliveryStatus: deliveryStatusNames[Number(finalOrder.deliveryStatus)],
    finalEscrow,
    finalHubUsdcBalance: finalHubBalance,
    receipts,
  };
  const evidencePath = path.resolve(__dirname, "../reports/evidence/LEGACY_ARC_CLEANUP.json");
  fs.writeFileSync(evidencePath, serialize(evidence) + "\n");
  console.log(`CLEANUP PASS: escrow and Hub balance are 0. Evidence: ${evidencePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
