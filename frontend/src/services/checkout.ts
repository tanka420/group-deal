import { ethers } from "ethers";
import { HUB_ABI } from "../contracts/hubAbi";
import { readArcRpc } from "./arcRpc";
import { UiError, uiMessage } from "../utils/uiMessage";

export type PurchaseParams = {
  campaignId: number;
  campaignIdentity: string;
  quantity: number;
  requireEarlySlot: boolean;
  maxAuthQuantity: number;
  authDeadline: number;
  authSignature: string;
  lockedUnitPriceUSDC: string;
  operationId?:string;
  onBroadcast?: (txHash: string) => void|Promise<void>;
  onStep?: (step: "APPROVE" | "BROADCAST") => void;
};

export type CheckoutIntent = {
  quantity: number; requireEarlySlot: boolean; maxGrossUsdc: string;
  phase: "FUNDING" | "BUY_PENDING" | "BUY_BROADCAST"; txHash?: string; createdAt: number;
  campaignIdentity?: string; onchainCampaignId?: number;
  operationId?:string;
};
export function checkoutKey(account: string, campaignId: string) {
  return `groupdeal_checkout:v1:${account.toLowerCase()}:${campaignId}`;
}
export function paymentLockKey(account: string) { return `groupdeal_payment:v1:${account.toLowerCase()}`; }

/** Hold one purchase lock across tabs. A second tab must never queue a second purchase. */
export async function withCheckoutLock(key: string, action: () => Promise<void>) {
  if (!navigator.locks) throw new UiError(uiMessage("Checkout cần trình duyệt hỗ trợ Web Locks trên HTTPS hoặc localhost", "Checkout requires a browser with Web Locks on HTTPS or localhost."));
  await navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new UiError(uiMessage("Một tab khác đang xử lý giao dịch này. Không ký lại giao dịch ở tab khác.", "Another tab is processing this transaction. Do not sign it again in another tab."));
    await action();
  });
}

const UINT256_MAX=(1n<<256n)-1n;
const USDC_NATIVE_SCALE=1_000_000_000_000n;
export const PURCHASE_BUDGET_TTL_MS=60_000;
export class PurchaseBudgetError extends UiError {
  constructor(readonly code:'PURCHASE_BUDGET_INVALID'|'PURCHASE_BUDGET_UNAVAILABLE'|'PURCHASE_BUDGET_STALE'|'PURCHASE_BUDGET_INSUFFICIENT') {
    super(code==='PURCHASE_BUDGET_INSUFFICIENT'?uiMessage('Không đủ USDC cho tiền hàng và ngân sách gas. Nạp thêm trước khi ký.','USDC is insufficient for the goods and gas budget. Fund your wallet before signing.'):code==='PURCHASE_BUDGET_STALE'?uiMessage('Ngân sách giao dịch đã hết hạn. Đọc lại số dư và phí trước khi ký.','The transaction budget expired. Refresh your balance and fees before signing.'):uiMessage('Chưa xác định được ngân sách USDC hợp lệ. Chưa gửi giao dịch; kiểm tra lại trước khi ký.','A valid USDC budget is unavailable. Check it before signing; no purchase was submitted.'));
    this.name='PurchaseBudgetError';
  }
}
export interface PurchaseBudget {
  account:string;grossUsdc:bigint;balance:bigint;gasPrice:bigint;
  approveGasReserve:bigint;commitGasReserve:bigint;gasReserve:bigint;
  required:bigint;shortfall:bigint;requestedAt:number;expiresAt:number;
}
function uint(value:unknown,positive=false):bigint {
  if(typeof value!=='bigint'||value<0n||value>UINT256_MAX||positive&&value===0n)throw new PurchaseBudgetError('PURCHASE_BUDGET_INVALID');
  return value;
}
function rpcQuantity(value:unknown,positive=false):bigint {
  if(typeof value!=='string'||!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value))throw new PurchaseBudgetError('PURCHASE_BUDGET_UNAVAILABLE');
  try{return uint(BigInt(value),positive);}catch{throw new PurchaseBudgetError('PURCHASE_BUDGET_UNAVAILABLE');}
}
function amounts(grossUsdc:bigint,gasPrice:bigint) {
  uint(grossUsdc,true);uint(gasPrice,true);
  // Pre-authorization policy, not a call-specific fee quote. Reserve both
  // approval and commitment, each with the existing 100% gas-price margin.
  // Each actual calldata is still estimated again immediately before signing.
  const approveGasReserve=uint(gasPrice*700_000n*2n,true),commitGasReserve=approveGasReserve;
  const gasReserve=uint(approveGasReserve+commitGasReserve,true);
  return {approveGasReserve,commitGasReserve,gasReserve,required:uint(grossUsdc*USDC_NATIVE_SCALE+gasReserve,true)};
}
export function purchaseBudgetIsFresh(budget:Pick<PurchaseBudget,'requestedAt'|'expiresAt'>,now=Date.now()) {
  return Number.isSafeInteger(now)&&Number.isSafeInteger(budget.requestedAt)&&budget.requestedAt>=0&&budget.requestedAt<=now&&budget.expiresAt===budget.requestedAt+PURCHASE_BUDGET_TTL_MS&&now<budget.expiresAt;
}
/** One USDC balance covers goods and both anticipated gas steps. */
export async function purchaseBudget(account: string, grossUsdc: bigint):Promise<PurchaseBudget> {
  uint(grossUsdc,true);uint(grossUsdc*USDC_NATIVE_SCALE,true);
  if(!ethers.isAddress(account)||ethers.getAddress(account)===ethers.ZeroAddress)throw new PurchaseBudgetError('PURCHASE_BUDGET_INVALID');
  account=ethers.getAddress(account);const requestedAt=Date.now();
  const [rawBalance,rawPrice]=await Promise.all([readArcRpc<unknown>('eth_getBalance',[account,'latest']),readArcRpc<unknown>('eth_gasPrice')]);
  const balance=rpcQuantity(rawBalance),gasPrice=rpcQuantity(rawPrice,true),sum=amounts(grossUsdc,gasPrice);
  const budget={account,grossUsdc,balance,gasPrice,...sum,shortfall:sum.required>balance?sum.required-balance:0n,requestedAt,expiresAt:requestedAt+PURCHASE_BUDGET_TTL_MS};
  if(!purchaseBudgetIsFresh(budget))throw new PurchaseBudgetError('PURCHASE_BUDGET_STALE');
  return budget;
}

export function assertPurchaseBudget(budget:PurchaseBudget) {
  if(!purchaseBudgetIsFresh(budget))throw new PurchaseBudgetError('PURCHASE_BUDGET_STALE');
  const sum=amounts(budget.grossUsdc,budget.gasPrice);uint(budget.balance);
  if(!ethers.isAddress(budget.account)||ethers.getAddress(budget.account)===ethers.ZeroAddress||Object.entries(sum).some(([key,value])=>budget[key as keyof PurchaseBudget]!==value)||budget.shortfall!==(budget.required>budget.balance?budget.required-budget.balance:0n))throw new PurchaseBudgetError('PURCHASE_BUDGET_INVALID');
  if (budget.balance < budget.required) {
    throw new PurchaseBudgetError('PURCHASE_BUDGET_INSUFFICIENT');
  }
}

export type CallBudgetInput={account:string;to:string;data:string;grossUsdc:bigint};
export type CallBudget={key:string;account:string;gasLimit:bigint;gasPrice:bigint;networkFee:bigint;feeReserve:bigint;grossNative:bigint;balance:bigint;required:bigint;shortfall:bigint;requestedAt:number;expiresAt:number};
export function callBudgetKey(input:CallBudgetInput){
  uint(input.grossUsdc);uint(input.grossUsdc*USDC_NATIVE_SCALE);
  if(!ethers.isAddress(input.account)||ethers.getAddress(input.account)===ethers.ZeroAddress||!ethers.isAddress(input.to)||ethers.getAddress(input.to)===ethers.ZeroAddress||!/^0x(?:[0-9a-fA-F]{2})+$/.test(input.data))throw new PurchaseBudgetError('PURCHASE_BUDGET_INVALID');
  return JSON.stringify([input.account.toLowerCase(),input.to.toLowerCase(),input.data.toLowerCase(),input.grossUsdc.toString()]);
}
/** Exact calldata estimate; goods and the fee reserve share one native USDC balance. */
export async function readCallBudget(input:CallBudgetInput):Promise<CallBudget>{
  const key=callBudgetKey(input),account=ethers.getAddress(input.account),requestedAt=Date.now();
  const [rawBalance,rawGas,rawPrice]=await Promise.all([
    readArcRpc<unknown>('eth_getBalance',[account,'latest']),
    readArcRpc<unknown>('eth_estimateGas',[{from:account,to:ethers.getAddress(input.to),data:input.data}]),
    readArcRpc<unknown>('eth_gasPrice'),
  ]);
  const balance=rpcQuantity(rawBalance),gasLimit=rpcQuantity(rawGas,true),gasPrice=rpcQuantity(rawPrice,true);
  const networkFee=uint(gasLimit*gasPrice,true),feeReserve=uint(networkFee*2n,true),grossNative=uint(input.grossUsdc*USDC_NATIVE_SCALE),required=uint(grossNative+feeReserve,true);
  const budget={key,account,gasLimit,gasPrice,networkFee,feeReserve,grossNative,balance,required,shortfall:required>balance?required-balance:0n,requestedAt,expiresAt:requestedAt+PURCHASE_BUDGET_TTL_MS};
  if(!purchaseBudgetIsFresh(budget))throw new PurchaseBudgetError('PURCHASE_BUDGET_STALE');
  return budget;
}
export function assertReviewedCallBudget(budget:CallBudget,input:CallBudgetInput){
  if(!purchaseBudgetIsFresh(budget))throw new PurchaseBudgetError('PURCHASE_BUDGET_STALE');
  if(budget.key!==callBudgetKey(input)||budget.account.toLowerCase()!==input.account.toLowerCase()||budget.networkFee!==uint(uint(budget.gasLimit,true)*uint(budget.gasPrice,true),true)||budget.feeReserve!==uint(budget.networkFee*2n,true)||budget.grossNative!==uint(input.grossUsdc*USDC_NATIVE_SCALE)||budget.required!==uint(budget.grossNative+budget.feeReserve,true)||budget.shortfall!==(budget.required>uint(budget.balance)?budget.required-budget.balance:0n))throw new PurchaseBudgetError('PURCHASE_BUDGET_INVALID');
  if(budget.shortfall>0n)throw new PurchaseBudgetError('PURCHASE_BUDGET_INSUFFICIENT');
}
/** A changed fee reserve requires new consent; re-read funds before handing off to the wallet. */
export async function assertCurrentCallBudget(budget:CallBudget,input:CallBudgetInput,assertCurrent:()=>void){
  assertCurrent();assertReviewedCallBudget(budget,input);
  const latest=await readCallBudget(input);
  assertCurrent();assertReviewedCallBudget(budget,input);assertReviewedCallBudget(latest,input);
  if(latest.feeReserve>budget.feeReserve)throw new PurchaseBudgetError('PURCHASE_BUDGET_STALE');
  if(latest.balance<budget.required)throw new PurchaseBudgetError('PURCHASE_BUDGET_INSUFFICIENT');
}
export async function assertCallBudget(account:string,to:string,data:string,grossUsdc:bigint){
  const input={account,to,data,grossUsdc};assertReviewedCallBudget(await readCallBudget(input),input);
}

type CommitExpectation = { hubAddress: string; buyer: string; campaignId: number; campaignIdentity: string; quantity: number; maxGross: bigint };
type RpcReceipt = { status: string; to: string; from: string; transactionHash: string; logs: Array<{ address: string; topics: string[]; data: string }> };

export function assertCommitReceipt(receipt: RpcReceipt, txHash: string, expected: CommitExpectation) {
  if (receipt.transactionHash.toLowerCase() !== txHash.toLowerCase() ||
      receipt.to?.toLowerCase() !== expected.hubAddress.toLowerCase() || receipt.from?.toLowerCase() !== expected.buyer.toLowerCase()) {
    throw new UiError(uiMessage("Receipt mua hàng không khớp hợp đồng hoặc ví. Giữ giao dịch để kiểm tra lại.", "The purchase receipt does not match the contract or wallet. Keep the transaction for review."));
  }
  if (BigInt(receipt.status) === 0n) throw Object.assign(new UiError(uiMessage("Giao dịch mua đã revert trên Arc; chưa tạo đơn hàng.", "The purchase reverted on Arc; no order was created.")), { code: "PURCHASE_REVERTED" });
  if (BigInt(receipt.status) !== 1n) throw new UiError(uiMessage("Trạng thái receipt chưa được xác định. Giữ giao dịch để kiểm tra lại.", "The receipt status is unknown. Keep the transaction for review."));
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
      throw new UiError(uiMessage("Sự kiện CommitmentMade không khớp đơn hàng đã xác nhận. Giữ giao dịch để kiểm tra lại.", "The CommitmentMade event does not match the reviewed purchase. Keep the transaction for review."));
    }
    return { orderId: args.orderId.toString(), committedGross: args.committedGross.toString() };
  }
  throw new UiError(uiMessage("Receipt chưa có sự kiện CommitmentMade hợp lệ; chưa thể xác nhận đơn.", "The receipt has no valid CommitmentMade event; the order is unconfirmed."));
}

export async function verifyArcCommitment(txHash: string, expected: CommitExpectation) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const receipt = await readArcRpc<RpcReceipt | null>("eth_getTransactionReceipt", [txHash]);
    if (receipt) return assertCommitReceipt(receipt, txHash, expected);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new UiError(uiMessage("Giao dịch đã gửi nhưng chưa xác minh được receipt. Không mua lại; kiểm tra giao dịch này sau.", "The transaction was submitted, but its receipt is unverified. Do not buy again; check this transaction later."));
}

export async function waitForIndexedOrder(token: string, txHash: string, buyer: string, orderId: string) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await fetch("/api/orders/buyer", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new UiError(uiMessage("Chưa đọc được đơn hàng từ backend; không gửi lại giao dịch mua.", "The order could not be read from the backend; do not submit the purchase again."));
    const data = await response.json();
    const found = data.orders?.find((order: any) => (order.commitmentTxHash || order.txHash)?.toLowerCase() === txHash.toLowerCase() &&
      order.buyerPrincipal?.toLowerCase() === buyer.toLowerCase() && String(order.onchainOrderId ?? order.id) === orderId);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new UiError(uiMessage("Receipt đã xác minh, backend đang chờ đồng bộ đơn. Giữ mã giao dịch; không mua lại.", "The receipt is verified and the backend is still synchronizing the order. Keep the transaction hash; do not buy again."));
}
