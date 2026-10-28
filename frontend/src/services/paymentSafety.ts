import {ARC_KIT_CHAIN} from '../../../shared/network.mjs';
import { ethers } from "ethers";
import type { BridgeEstimateResult } from "@circle-fin/app-kit";
import {signerHoldMessage} from "./signerHoldMessage";
import { UiError, uiMessage, type UiMessage } from "../utils/uiMessage";

export const bridgeSources = {
  Ethereum_Sepolia: { label: "Ethereum Sepolia", chainId: 11155111, chainIdHex: "0xaa36a7", usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
  Base_Sepolia: { label: "Base Sepolia", chainId: 84532, chainIdHex: "0x14a34", usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
  Arbitrum_Sepolia: { label: "Arbitrum Sepolia", chainId: 421614, chainIdHex: "0x66eee", usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
} as const;
export type BridgeSource = keyof typeof bridgeSources;

/** Provider diagnostics are not display copy. Preserve only messages owned by the app. */
export function paymentError(error: unknown): UiMessage {
  const seen = new Set<unknown>();
  let display: UiMessage | undefined;
  let connection: "timeout" | "network" | undefined;
  let current: unknown = error;
  for (let depth = 0; current && depth < 8 && !seen.has(current); depth += 1) {
    seen.add(current);
    const details = typeof current === "object" ? current as Record<string, unknown> : {};
    const message = typeof current === "string" ? current.slice(0, 2000) : typeof details.message === "string" ? details.message.slice(0, 2000) : "";
    if (details.code === 4001 || details.code === "4001" || details.code === "ACTION_REJECTED" || details.name === "UserRejectedRequestError" || /user (rejected|denied)|denied request signature/i.test(message)) {
      return uiMessage(
        "Ví đã từ chối yêu cầu ký. Chưa thể xác nhận thanh toán; kiểm tra cảnh báo và lịch sử ví trước khi thử lại. Không tắt cảnh báo bảo mật.",
        "Your wallet rejected the signature request. Payment is unconfirmed; check the warnings and wallet history before retrying. Do not disable security warnings.",
      );
    }
    if (current instanceof UiError && display === undefined) display = current.displayMessage;
    if (display === undefined) display = signerHoldMessage(details.code);
    if (details.name === "TimeoutError" || details.name === "AbortError") connection = "timeout";
    else if (!connection && (details.code === "NETWORK_ERROR" || current instanceof TypeError && /fetch|network/i.test(message))) connection = "network";
    current = details.cause || details.error;
  }
  if (display !== undefined) return display;
  if (connection === "timeout") return uiMessage(
    "Kết nối hết thời gian trước khi xác nhận thanh toán. Kiểm tra cùng giao dịch và giữ intent để phục hồi.",
    "The connection timed out before payment was confirmed. Check this transaction and keep the intent for recovery.",
  );
  if (connection === "network") return uiMessage(
    "Lỗi kết nối chưa xác nhận được thanh toán. Kiểm tra cùng giao dịch và giữ intent để phục hồi.",
    "A connection error left payment unconfirmed. Check this transaction and keep the intent for recovery.",
  );
  return uiMessage(
    "Chưa xác nhận thanh toán. Kiểm tra trạng thái giao dịch và lịch sử ví trước khi thử lại.",
    "Payment is unconfirmed. Check the transaction status and wallet history before retrying.",
  );
}

export function parseUsdc(amount: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(amount)) throw new Error("Số USDC phải có tối đa 6 chữ số thập phân");
  const value = ethers.parseUnits(amount, 6);
  if (value <= 0n) throw new Error("Số USDC phải lớn hơn 0");
  return value;
}

/** Installed AppKit formats gas fees in each chain's native currency, not wei.
 * Approved source ETH and Arc native USDC both use 18 decimals. */
const maxBridgeBudget=(1n<<256n)-1n;
function boundedBridgeBudget(value:bigint){if(value<0n||value>maxBridgeBudget)throw new Error("Báo giá phí vượt giới hạn hợp lệ");return value;}
function nativeBridgeFee(value:unknown){
  if(typeof value!=="string"||value.length>100||!/^\d+(?:\.\d{1,18})?$/.test(value))throw new Error("Báo giá gas không hợp lệ");
  return boundedBridgeBudget(ethers.parseUnits(value,18));
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
    feesUsdc = boundedBridgeBudget(feesUsdc + value);
  }
  for (const item of estimate.gasFees) {
    if (!item.fees || item.error) throw new Error("Chưa ước tính được gas cho tất cả các bước bridge");
    const fee = nativeBridgeFee(item.fees.fee);
    if (fee < 0n) throw new Error("Báo giá gas không hợp lệ");
    if (String(item.blockchain) === source && item.token === "ETH") sourceGas = boundedBridgeBudget(sourceGas + fee);
    else if (String(item.blockchain) === ARC_KIT_CHAIN && item.token === "USDC") arcGas = boundedBridgeBudget(arcGas + fee);
    else throw new Error("Báo giá chứa mạng hoặc token gas không được hỗ trợ");
  }
  const received = parseUsdc(amount) - feesUsdc;
  if (received <= 0n || sourceGas <= 0n) throw new Error("Báo giá không đủ số nhận hoặc phí gas nguồn");
  return { feesUsdc, received, sourceGas: boundedBridgeBudget((sourceGas * 120n + 99n) / 100n), arcGas: boundedBridgeBudget((arcGas * 120n + 99n) / 100n) };
}
