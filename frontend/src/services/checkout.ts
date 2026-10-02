import { ethers } from "ethers";
import { HUB_ABI } from "../contracts/hubAbi";
import { readArcBalance, readArcRpc } from "./arcRpc";

export type PurchaseParams = {
  campaignId: number;
  campaignIdentity: string;
  quantity: number;
  requireEarlySlot: boolean;
  maxAuthQuantity: number;
  authDeadline: number;
  authSignature: string;
  lockedUnitPriceUSDC: string;
  onBroadcast?: (txHash: string) => void;
  onStep?: (step: "APPROVE" | "BROADCAST") => void;
};

export type CheckoutIntent = {
  quantity: number; requireEarlySlot: boolean; maxGrossUsdc: string;
  phase: "FUNDING" | "BUY_PENDING" | "BUY_BROADCAST"; txHash?: string; createdAt: number;
  campaignIdentity?: string; onchainCampaignId?: number;
};
export function checkoutKey(account: string, campaignId: string) {
  return `groupdeal_checkout:v1:${account.toLowerCase()}:${campaignId}`;
}
export function paymentLockKey(account: string) { return `groupdeal_payment:v1:${account.toLowerCase()}`; }

/** Hold one purchase lock across tabs. A second tab must never queue a second purchase. */
export async function withCheckoutLock(key: string, action: () => Promise<void>) {
  if (!navigator.locks) throw new Error("Checkout cần trình duyệt hỗ trợ Web Locks trên HTTPS hoặc localhost");
  await navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("Một tab khác đang xử lý giao dịch này. Không ký lại giao dịch ở tab khác.");
    await action();
  });
}

/** A conservative pre-approval reserve; exact call estimates are checked again before signing. */
export async function purchaseBudget(account: string, grossUsdc: bigint) {
  if (grossUsdc <= 0n) throw new Error("Giá trị đơn hàng phải lớn hơn 0");
  const [balance, price] = await Promise.all([readArcBalance(account), readArcRpc("eth_gasPrice")]);
  const gasPrice = BigInt(price);
  if (gasPrice <= 0n) throw new Error("Chưa xác định được gas price Arc");
  const gasReserve = gasPrice * 700_000n * 2n;
  return { balance, gasPrice, gasReserve, required: grossUsdc * 1_000_000_000_000n + gasReserve };
}

export function assertPurchaseBudget(budget: Awaited<ReturnType<typeof purchaseBudget>>) {
  if (budget.balance < budget.required) {
    throw new Error(`Cần ít nhất ${ethers.formatUnits(budget.required, 18)} USDC trên Arc (tiền hàng và ngân sách gas). Hãy nạp thêm trước khi ký.`);
  }
}

export async function assertCallBudget(account: string, to: string, data: string, grossUsdc: bigint) {
  const [balance, gas, price] = await Promise.all([
    readArcBalance(account), readArcRpc("eth_estimateGas", [{ from: account, to, data }]), readArcRpc("eth_gasPrice"),
  ]);
  if (BigInt(gas) <= 0n || BigInt(price) <= 0n) throw new Error("Không ước tính được gas giao dịch");
  if (balance < grossUsdc * 1_000_000_000_000n + BigInt(gas) * BigInt(price) * 2n) {
    throw new Error("Không đủ USDC cho tiền hàng và gas của giao dịch này. Chưa gửi giao dịch.");
  }
}

type CommitExpectation = { hubAddress: string; buyer: string; campaignId: number; campaignIdentity: string; quantity: number; maxGross: bigint };
type RpcReceipt = { status: string; to: string; from: string; transactionHash: string; logs: Array<{ address: string; topics: string[]; data: string }> };

export function assertCommitReceipt(receipt: RpcReceipt, txHash: string, expected: CommitExpectation) {
  if (receipt.transactionHash.toLowerCase() !== txHash.toLowerCase() ||
      receipt.to?.toLowerCase() !== expected.hubAddress.toLowerCase() || receipt.from?.toLowerCase() !== expected.buyer.toLowerCase()) {
    throw new Error("Receipt mua hàng không khớp hợp đồng/ví hoặc giao dịch đã revert");
  }
  if (BigInt(receipt.status) === 0n) throw Object.assign(new Error("Giao dịch mua đã revert trên Arc; chưa tạo đơn hàng."), { code: "PURCHASE_REVERTED" });
  if (BigInt(receipt.status) !== 1n) throw new Error("Trạng thái receipt chưa được xác định");
  const hub = new ethers.Interface(HUB_ABI);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expected.hubAddress.toLowerCase()) continue;
    let event: ethers.LogDescription | null;
    try { event = hub.parseLog(log); } catch { continue; }
    if (event?.name !== "CommitmentMade") continue;
    const args = event.args;
    if (args.campaignId !== BigInt(expected.campaignId) || args.campaignIdentity.toLowerCase() !== expected.campaignIdentity.toLowerCase() ||
        args.buyerPrincipal.toLowerCase() !== expected.buyer.toLowerCase() || args.quantity !== BigInt(expected.quantity) ||
        args.committedGross <= 0n || args.committedGross > expected.maxGross || args.committedGross !== args.lockedUnitPrice * args.quantity) {
      throw new Error("Sự kiện CommitmentMade không khớp đơn hàng đã xác nhận");
    }
    return { orderId: args.orderId.toString(), committedGross: args.committedGross.toString() };
  }
  throw new Error("Receipt chưa có sự kiện CommitmentMade hợp lệ; chưa thể xác nhận đơn");
}

export async function verifyArcCommitment(txHash: string, expected: CommitExpectation) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const receipt = await readArcRpc<RpcReceipt | null>("eth_getTransactionReceipt", [txHash]);
    if (receipt) return assertCommitReceipt(receipt, txHash, expected);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Giao dịch đã gửi nhưng chưa xác minh được receipt. Không mua lại; kiểm tra giao dịch này sau.");
}

export async function waitForIndexedOrder(token: string, txHash: string, buyer: string, orderId: string) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await fetch("/api/orders/buyer", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Chưa đọc được đơn hàng từ backend; không gửi lại giao dịch mua");
    const data = await response.json();
    const found = data.orders?.find((order: any) => order.txHash?.toLowerCase() === txHash.toLowerCase() &&
      order.buyerPrincipal?.toLowerCase() === buyer.toLowerCase() && String(order.onchainOrderId ?? order.id) === orderId);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Receipt đã xác minh, backend đang chờ đồng bộ đơn. Giữ mã giao dịch; không mua lại.");
}
