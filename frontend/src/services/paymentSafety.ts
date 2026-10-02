import { ethers } from "ethers";
import type { BridgeEstimateResult } from "@circle-fin/app-kit";

export const bridgeSources = {
  Ethereum_Sepolia: { label: "Ethereum Sepolia", chainId: 11155111, chainIdHex: "0xaa36a7", usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
  Base_Sepolia: { label: "Base Sepolia", chainId: 84532, chainIdHex: "0x14a34", usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
  Arbitrum_Sepolia: { label: "Arbitrum Sepolia", chainId: 421614, chainIdHex: "0x66eee", usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
} as const;
export type BridgeSource = keyof typeof bridgeSources;

export function paymentError(error: unknown): string {
  const seen = new Set<unknown>();
  const messages: string[] = [];
  let current: any = error;
  for (let depth = 0; current && depth < 8 && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current.code === 4001 || current.code === "ACTION_REJECTED" || current.name === "UserRejectedRequestError") {
      return "Ví đã từ chối yêu cầu ký. Chưa thể xác nhận thanh toán; kiểm tra cảnh báo và lịch sử ví trước khi thử lại. Không tắt cảnh báo bảo mật.";
    }
    messages.push(typeof current === "string" ? current : String(current.message || ""));
    current = current.cause || current.error;
  }
  const message = messages.join(" ");
  if (/user (rejected|denied)|denied request signature/i.test(message)) {
    return "Ví đã từ chối yêu cầu ký. Kiểm tra mạng, phí gas và cảnh báo hợp đồng; không bỏ qua cảnh báo bảo mật.";
  }
  return messages[0] || "Không thể hoàn tất thanh toán. Kiểm tra trạng thái giao dịch trước khi gửi lại.";
}

export function parseUsdc(amount: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(amount)) throw new Error("Số USDC phải có tối đa 6 chữ số thập phân");
  const value = ethers.parseUnits(amount, 6);
  if (value <= 0n) throw new Error("Số USDC phải lớn hơn 0");
  return value;
}

/** Native gas budgets, not a promised final gas price. Reserve 20% for fluctuation. */
export function bridgeQuoteSummary(estimate: BridgeEstimateResult, source: BridgeSource, amount: string) {
  if (!Array.isArray(estimate.gasFees) || !estimate.gasFees.length || !Array.isArray(estimate.fees)) {
    throw new Error("Báo giá thiếu phí gas. Chưa được phép ký bridge.");
  }
  let sourceGas = 0n;
  let arcGas = 0n;
  let feesUsdc = 0n;
  for (const fee of estimate.fees) {
    if (fee.amount === null || fee.error || fee.token !== "USDC") throw new Error("Chưa xác định được phí USDC của tuyến bridge");
    const value = ethers.parseUnits(fee.amount, 6);
    if (value < 0n) throw new Error("Báo giá phí không hợp lệ");
    feesUsdc += value;
  }
  for (const item of estimate.gasFees) {
    if (!item.fees || item.error) throw new Error("Chưa ước tính được gas cho tất cả các bước bridge");
    const fee = BigInt(item.fees.fee);
    if (fee < 0n) throw new Error("Báo giá gas không hợp lệ");
    if (String(item.blockchain) === source && item.token === "ETH") sourceGas += fee;
    else if (String(item.blockchain) === "Arc_Testnet" && item.token === "USDC") arcGas += fee;
    else throw new Error("Báo giá chứa mạng hoặc token gas không được hỗ trợ");
  }
  const received = parseUsdc(amount) - feesUsdc;
  if (received <= 0n || sourceGas <= 0n) throw new Error("Báo giá không đủ số nhận hoặc phí gas nguồn");
  return { feesUsdc, received, sourceGas: (sourceGas * 120n + 99n) / 100n, arcGas: (arcGas * 120n + 99n) / 100n };
}
