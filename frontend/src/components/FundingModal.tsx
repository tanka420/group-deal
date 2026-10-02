import React, { useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import { createPortal } from "react-dom";
import type { AppKit, BridgeResult, BridgeStep, BridgeEstimateResult } from "@circle-fin/app-kit";
import type { EIP1193Provider } from "viem";
import { useLanguage } from "../context/LanguageContext";
import { useWeb3 } from "../context/Web3Context";
import { useAuth } from "../context/AuthContext";
import { useExternalWallet } from "../context/ExternalWalletContext";
import { readArcBalance } from "../services/arcRpc";
import { paymentLockKey, withCheckoutLock } from "../services/checkout";
import { bridgeSources, BridgeSource, bridgeQuoteSummary, parseUsdc, paymentError } from "../services/paymentSafety";
import {
  X,
  Coins,
  ArrowRightLeft,
  ExternalLink,
  AlertCircle,
  Fuel,
  Copy,
  Check,
} from "lucide-react";

interface FundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredUsdc?: string;
  onContinueCheckout?: () => void;
}

type BridgeOperation = { source: BridgeSource; amount: string; recipient: string; sender: string };
type PreparedQuote = { operation: BridgeOperation; estimate: BridgeEstimateResult; expiresAt: number };

function checkpointKey(recipient: string) { return `groupdeal_bridge:${recipient.toLowerCase()}`; }
function saveCheckpoint(operation: BridgeOperation, result: BridgeResult<string> | null) {
  // External-wallet bridge metadata only: no Circle token, key or credentials.
  const safeResult = result ? { ...result, steps: result.steps.map(({ error: _error, ...step }) => step) } : null;
  localStorage.setItem(checkpointKey(operation.recipient), JSON.stringify({ version: 1, operation, result: safeResult },
    (_key, value) => typeof value === "bigint" ? { bigint: value.toString() } : value));
}

let circleAppKitPromise: Promise<AppKit> | null = null;

function getCircleAppKit(): Promise<AppKit> {
  circleAppKitPromise ||= import("@circle-fin/app-kit").then(({ AppKit: CircleAppKit }) => new CircleAppKit());
  return circleAppKitPromise;
}

export const FundingModal: React.FC<FundingModalProps> = ({ isOpen, onClose, requiredUsdc, onContinueCheckout }) => {
  const { t } = useLanguage();
  const { account, usdcBalance, balanceError, refreshBalance } = useWeb3();
  const external = useExternalWallet();
  const { token } = useAuth();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetMessage, setFaucetMessage] = useState("");

  const [activeTab, setActiveTab] = useState<"FAUCET" | "BRIDGE" | "ONRAMP">("FAUCET");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [bridgeSource, setBridgeSource] = useState<BridgeSource>("Ethereum_Sepolia");
  const [bridgeAmount, setBridgeAmount] = useState("1");
  const [bridgeProgress, setBridgeProgress] = useState("");
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState("");
  const [bridgeResult, setBridgeResult] = useState<BridgeResult<string> | null>(null);
  const [bridgeOperation, setBridgeOperation] = useState<BridgeOperation | null>(null);
  const [bridgeNeedsReview, setBridgeNeedsReview] = useState(false);
  const [bridgeQuote, setBridgeQuote] = useState<PreparedQuote | null>(null);
  const busyRef = useRef(false);
  const recipientRef = useRef(account);
  recipientRef.current = account;

  useEffect(() => { setBridgeQuote(null); }, [bridgeSource, bridgeAmount, account]);
  useEffect(() => {
    if (isOpen && requiredUsdc) { setActiveTab("BRIDGE"); setBridgeAmount(requiredUsdc); }
  }, [isOpen, requiredUsdc]);

  useEffect(() => {
    if (!account || bridgeBusy) return;
    const raw = localStorage.getItem(checkpointKey(account)) || sessionStorage.getItem(checkpointKey(account));
    if (!raw) { setBridgeOperation(null); setBridgeResult(null); setBridgeNeedsReview(false); return; }
    try {
      const saved = JSON.parse(raw, (_key, value) => value && typeof value === "object" && Object.keys(value).length === 1 && typeof value.bigint === "string" ? BigInt(value.bigint) : value);
      if (saved.operation?.recipient.toLowerCase() !== account.toLowerCase() || !(saved.operation.source in bridgeSources) ||
        !ethers.isAddress(saved.operation.sender) || parseUsdc(saved.operation.amount) <= 0n) throw new Error("Invalid checkpoint");
      setBridgeOperation(saved.operation);
      setBridgeSource(saved.operation.source);
      setBridgeAmount(saved.operation.amount);
      setBridgeResult(saved.result);
      setBridgeNeedsReview(!saved.result);
      if (!saved.result) setBridgeError("Trang đã tải lại khi bridge chưa trả kết quả. Kiểm tra lịch sử ví/Explorer trước khi gửi giao dịch khác; không tự động burn lại.");
    } catch { setBridgeNeedsReview(true); setBridgeError("Không đọc được trạng thái bridge cũ. Cần kiểm tra lịch sử ví trước khi tiếp tục."); }
  }, [account]);

  if (!isOpen) return null;

  const claimFaucet = async () => {
    if (!token || !account || faucetBusy) return;
    setFaucetBusy(true);
    setFaucetMessage("");
    try {
      const response = await fetch("/api/faucet/usdc", {
        method: "POST", signal: AbortSignal.timeout(25_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address: account }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể gửi yêu cầu faucet");
      setFaucetMessage(data.message);
      await refreshBalance();
    } catch (error) {
      setFaucetMessage(error instanceof Error ? error.message : "Faucet chưa phản hồi");
    } finally { setFaucetBusy(false); }
  };

  const validateBridgeAmount = () => {
    parseUsdc(bridgeAmount);
  };

  const createBridgeAdapter = async (source: BridgeSource) => {
    if (!external.configured) throw new Error("Thiếu VITE_REOWN_PROJECT_ID");
    if (!external.provider) await external.connect();
    const provider = external.getProvider();
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: bridgeSources[source].chainIdHex }],
    });
    const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
    return createViemAdapterFromProvider({
      provider: provider as unknown as EIP1193Provider,
    });
  };

  const executeBridge = async (retry = false, locked = false): Promise<void> => {
    if (account && !locked) {
      try { await withCheckoutLock(paymentLockKey(account), () => executeBridge(retry, true)); }
      catch (error) { setBridgeError(paymentError(error)); }
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBridgeBusy(true);
    setBridgeError("");
    setBridgeProgress("Đang chuẩn bị Circle Arc App Kit...");
    const eventHandler = (payload: unknown) => {
      const event = payload as { action?: string; name?: string; values?: { state?: string; name?: string } };
      setBridgeProgress(
        [event.values?.name || event.action || event.name || "Đang xử lý bước bridge", event.values?.state]
          .filter(Boolean)
          .join(" — ")
      );
    };
    let circleAppKit: AppKit | undefined;
    try {
      validateBridgeAmount();
      if (!account) throw new Error("Hãy đăng nhập và chọn ví nhận trước khi bridge");
      if (!retry) {
        const saved = localStorage.getItem(checkpointKey(account)) || sessionStorage.getItem(checkpointKey(account));
        if (saved && JSON.parse(saved).result?.state !== "success") throw new Error("Có bridge cũ chưa hoàn tất. Khôi phục lượt cũ hoặc kiểm tra lịch sử ví; không burn lần nữa.");
      }
      if (retry && (!bridgeOperation || bridgeOperation.recipient.toLowerCase() !== account.toLowerCase())) {
        throw new Error("Ví nhận đã thay đổi. Không được thử lại giao dịch cũ bằng tài khoản khác.");
      }
      if (retry && (!bridgeResult || bridgeResult.token !== "USDC" || String(bridgeResult.source.chain.chain) !== bridgeOperation?.source ||
        String(bridgeResult.destination.chain.chain) !== "Arc_Testnet" ||
        bridgeResult.source.address.toLowerCase() !== bridgeOperation?.sender.toLowerCase() ||
        (bridgeResult.destination.recipientAddress || bridgeResult.destination.address).toLowerCase() !== account.toLowerCase() ||
        parseUsdc(bridgeResult.amount) !== parseUsdc(bridgeOperation.amount))) {
        throw new Error("Hồ sơ bridge cũ không khớp tuyến USDC testnet. Dừng và kiểm tra trước khi thử lại.");
      }
      circleAppKit = await getCircleAppKit();
      circleAppKit.on("*", eventHandler);
      const source = retry && bridgeOperation ? bridgeOperation.source : bridgeSource;
      const adapter = await createBridgeAdapter(source);
      const signer = await external.getSigner();
      const sender = await signer.getAddress();
      if (retry && bridgeOperation?.sender.toLowerCase() !== sender.toLowerCase()) {
        throw new Error("Chọn lại đúng ví nguồn của giao dịch bridge trước đó");
      }
      const sourceProvider = new ethers.BrowserProvider(external.getProvider());
      if (Number((await sourceProvider.getNetwork()).chainId) !== bridgeSources[source].chainId) {
        throw new Error("Ví chưa chuyển sang đúng mạng nguồn bridge");
      }
      const params = {
        from: { adapter, chain: source, address: sender },
        to: { adapter, chain: "Arc_Testnet" as const, address: sender, recipientAddress: account },
        amount: retry && bridgeOperation ? bridgeOperation.amount : bridgeAmount,
        token: "USDC" as const,
        // Explicit sequential signing avoids requiring wallet_sendCalls support.
        config: { batchTransactions: false, transferSpeed: "SLOW" as const, maxFee: "0" },
      };
      const operation = retry && bridgeOperation ? bridgeOperation : { source, amount: bridgeAmount, recipient: account, sender };
      if (!retry) {
        const tokenContract = new ethers.Contract(bridgeSources[source].usdc, ["function balanceOf(address) view returns (uint256)"], sourceProvider);
        const [sourceBalance, nativeBalance] = await Promise.all([tokenContract.balanceOf(sender), sourceProvider.getBalance(sender)]);
        if (sourceBalance < parseUsdc(operation.amount)) throw new Error("Không đủ USDC trên mạng nguồn để bridge");
        if (nativeBalance === 0n) throw new Error(`Ví nguồn không có ETH trên ${bridgeSources[source].label}. Nạp ETH testnet trước; USDC không trả được gas trên mạng nguồn.`);
        setBridgeProgress("Đang kiểm tra tuyến CCTP và ước tính phí trước khi ký...");
        const estimate = await circleAppKit.estimateBridge(params);
        if (estimate.token !== "USDC" || parseUsdc(estimate.amount) !== parseUsdc(operation.amount) ||
          String(estimate.source.chain) !== source || estimate.source.address.toLowerCase() !== sender.toLowerCase() ||
          String(estimate.destination.chain) !== "Arc_Testnet" ||
          (estimate.destination.recipientAddress || estimate.destination.address).toLowerCase() !== account.toLowerCase()) {
          throw new Error("Báo giá không khớp mạng, số tiền hoặc ví của checkout");
        }
        const summary = bridgeQuoteSummary(estimate, source, operation.amount);
        if (nativeBalance < summary.sourceGas) throw new Error("Không đủ ETH nguồn cho ngân sách gas của bridge");
        // Mint is signed by the source adapter, which may differ from the recipient.
        if (summary.arcGas > 0n && await readArcBalance(sender) < summary.arcGas) throw new Error("Ví ký mint cần USDC gas trên Arc Testnet. Nạp gas cho ví nguồn trên Arc trước khi burn.");
        const old = bridgeQuote && bridgeQuoteSummary(bridgeQuote.estimate, source, operation.amount);
        if (!bridgeQuote || bridgeQuote.expiresAt <= Date.now() || JSON.stringify(bridgeQuote.operation) !== JSON.stringify(operation) ||
          !old || summary.received < old.received || summary.sourceGas > old.sourceGas || summary.arcGas > old.arcGas) {
          setBridgeQuote({ operation, estimate, expiresAt: Date.now() + 60_000 });
          setBridgeProgress("Báo giá đã sẵn sàng. Kiểm tra số nhận và gas rồi bấm xác nhận; chưa gửi giao dịch.");
          return;
        }
        params.amount = operation.amount;
      }
      setBridgeOperation(operation);
      if (recipientRef.current?.toLowerCase() !== operation.recipient.toLowerCase()) throw new Error("Ví nhận đã thay đổi; không ký bridge của phiên cũ");
      // Reserve intent before the first write. A reload with unknown outcome
      // blocks a new burn until the user has checked their wallet history.
      saveCheckpoint(operation, retry ? bridgeResult : null);
      setBridgeNeedsReview(true);
      const result = retry && bridgeResult
        ? await circleAppKit.retryBridge(bridgeResult, { from: adapter, to: adapter })
        : await circleAppKit.bridge({
            ...params,
            quote: bridgeQuote?.estimate.quote,
            invocationMeta: {
              traceId: crypto.randomUUID().replace(/-/g, ""),
              callers: [{ type: "app", name: "GroupDeal", version: "1.0.0" }],
            },
          });
      setBridgeResult(result);
      setBridgeQuote(null);
      saveCheckpoint(operation, result);
      setBridgeNeedsReview(false);
      if (result.state !== "success") {
        setBridgeError(paymentError(result.steps.find((step) => step.state === "error")?.errorMessage || `Bridge chưa hoàn tất: ${result.state}. Không gửi giao dịch mới nếu burn đã thành công.`));
      }
      setBridgeProgress(
        result.state === "success"
          ? "App Kit báo đã mint USDC trên Arc Testnet; hãy kiểm tra số dư nhận trước khi mua"
          : `Bridge kết thúc ở trạng thái ${result.state}`
      );
      if (result.state === "success") await refreshBalance();
    } catch (error) {
      setBridgeError(paymentError(error));
    } finally {
      circleAppKit?.off("*", eventHandler);
      setBridgeBusy(false);
      busyRef.current = false;
    }
  };

  const bridgeCanRetry = Boolean(
    bridgeResult?.steps.some((step) => step.state === "error")
  );

  return createPortal(
    <div className="modal-overlay" onClick={() => { if (!bridgeBusy) onClose(); }}>
      <div
        className="modal-content"
        style={{ maxWidth: "560px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Coins size={22} color="var(--primary-light)" />
            <h3 style={{ fontSize: "1.2rem" }}>Nạp USDC — Arc Testnet Funding</h3>
          </div>
          <button className="modal-close" onClick={onClose} disabled={bridgeBusy} aria-label="Đóng nạp USDC">
            <X size={18} />
          </button>
        </div>

        {/* Balance Overview Card */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.7)",
            border: "1px solid var(--border-medium)",
            borderRadius: "var(--radius-lg)",
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Số dư ví người mua (Arc Testnet):
              </div>
              <div
                className="font-mono"
                style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--cyan)" }}
              >
                {!account
                  ? "Chưa kết nối ví"
                  : usdcBalance === null ? balanceError || "Đang tải số dư..." : `${usdcBalance} USDC`}
              </div>
              {balanceError && usdcBalance !== null && <p role="status" style={{ fontSize: "0.8rem", color: "var(--warning)" }}>{balanceError}</p>}
            </div>
            <div
              style={{
                textAlign: "right",
                fontSize: "0.8rem",
                color: "var(--text-muted)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", justifyContent: "flex-end" }}>
                <Fuel size={14} color="var(--warning)" />
                <span>Gas Arc:</span>
              </div>
              <span className="font-mono" style={{ color: "var(--warning)" }}>
                Trừ từ cùng số dư
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: "0.76rem",
              color: "var(--text-muted)",
              marginTop: "0.5rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            Arc chỉ có một số dư USDC. Giao diện native 18 decimals dùng cho gas và giao diện ERC-20 6 decimals dùng cho approve/transfer cùng trỏ tới số dư này; ứng dụng hiển thị một dòng duy nhất với tối đa 6 chữ số thập phân.
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            borderBottom: "1px solid var(--border-medium)",
            marginBottom: "1.25rem",
          }}
        >
          <button
            className={`btn btn-sm ${activeTab === "FAUCET" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("FAUCET")}
            style={{ borderRadius: "var(--radius-md) var(--radius-md) 0 0" }}
          >
            <Coins size={14} />
            Testnet Faucet
          </button>
          <button
            className={`btn btn-sm ${activeTab === "BRIDGE" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("BRIDGE")}
            style={{ borderRadius: "var(--radius-md) var(--radius-md) 0 0" }}
          >
            <ArrowRightLeft size={14} />
            CCTP Bridge
          </button>
          <button
            className={`btn btn-sm ${activeTab === "ONRAMP" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("ONRAMP")}
            style={{ borderRadius: "var(--radius-md) var(--radius-md) 0 0" }}
          >
            Fiat Onramp (Sandbox)
          </button>
        </div>

        {/* Tab 1: Faucet */}
        {activeTab === "FAUCET" && (
          <div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Nhận USDC Arc Testnet trực tiếp qua API faucet chính thức của Circle. Không ký giao dịch, không dùng tiền từ ví dự án; chịu hạn mức cấp token của Circle.
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              API trực tiếp cần Console đã nâng cấp quyền mainnet của Circle; token vẫn là Arc Testnet. Nếu chưa có quyền API, dùng faucet web dự phòng bên dưới.
            </p>

            {account ? (
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid var(--border-subtle)",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.78rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                <span className="font-mono" style={{ overflowWrap: "anywhere" }}>{account}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(account);
                    setCopiedAddress(true);
                    window.setTimeout(() => setCopiedAddress(false), 2000);
                  }}
                >
                  {copiedAddress ? <Check size={14} /> : <Copy size={14} />}
                  {copiedAddress ? "Đã chép" : "Chép"}
                </button>
              </div>
            ) : (
              <p role="alert" style={{ color: "var(--warning)", fontSize: "0.82rem", marginBottom: "0.75rem" }}>
                Hãy đăng nhập hoặc kết nối ví trước để lấy địa chỉ nhận USDC.
              </p>
            )}

            <button type="button" className="btn btn-primary" onClick={() => void claimFaucet()}
              disabled={!account || !token || faucetBusy} style={{ width: "100%", justifyContent: "center", marginBottom: "0.75rem" }}>
              {faucetBusy ? "Đang yêu cầu Circle faucet..." : "Nhận USDC testnet trực tiếp"}
            </button>
            {faucetMessage && <p role="status">{faucetMessage}</p>}
            <a
              className="btn btn-secondary"
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              style={{ width: "100%", justifyContent: "center", marginBottom: "0.75rem" }}
            >
              Faucet dự phòng (mở trang Circle) <ExternalLink size={14} />
            </a>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void refreshBalance()}
              disabled={!account}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Tôi đã nhận USDC — cập nhật số dư
            </button>
          </div>
        )}

        {/* Tab 2: CCTP Bridge */}
        {activeTab === "BRIDGE" && (
          <div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Chuyển USDC testnet từ ví Reown sang Arc Testnet bằng Circle Arc App Kit và CCTP. Mỗi giao dịch approve, burn và mint đều do ví người dùng xác nhận.
            </p>

            <div
              style={{
                background: "rgba(30, 41, 59, 0.6)",
                border: "1px solid var(--border-medium)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                marginBottom: "1rem",
              }}
            >
              <label style={{ display: "block", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>Mạng nguồn</span>
                <select
                  value={bridgeSource}
              onChange={(event) => { setBridgeQuote(null); setBridgeSource(event.target.value as BridgeSource); }}
                  disabled={bridgeBusy || bridgeCanRetry || bridgeNeedsReview}
                  style={{ width: "100%", padding: "0.65rem", borderRadius: "var(--radius-md)" }}
                >
                  {Object.entries(bridgeSources).map(([value, source]) => (
                    <option key={value} value={value}>{source.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "block", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.35rem" }}>Số USDC</span>
                <input
                  inputMode="decimal"
                  value={bridgeAmount}
                  onChange={(event) => { setBridgeQuote(null); setBridgeAmount(event.target.value); }}
                  disabled={bridgeBusy || bridgeCanRetry || bridgeNeedsReview}
                  aria-label="Số USDC cần bridge"
                  style={{ width: "100%", padding: "0.65rem", borderRadius: "var(--radius-md)" }}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Đích:</span>
                <span>Arc Testnet (5042002)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Ví nhận:</span>
                <span className="font-mono" style={{ overflowWrap: "anywhere" }}>{account || "Hãy đăng nhập trước"}</span>
              </div>
            </div>

            {bridgeQuote && (() => {
              const summary = bridgeQuoteSummary(bridgeQuote.estimate, bridgeQuote.operation.source, bridgeQuote.operation.amount);
              return <div role="status" style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
                Số nhận dự kiến tối thiểu: {ethers.formatUnits(summary.received, 6)} USDC.<br />
                Phí USDC dự kiến: {ethers.formatUnits(summary.feesUsdc, 6)}.<br />
                Ngân sách gas (+20%): {ethers.formatUnits(summary.sourceGas, 18)} ETH nguồn; {ethers.formatUnits(summary.arcGas, 18)} USDC Arc.<br />
                Báo giá hiệu lực 60 giây; kiểm tra lại trước ký. CCTP standard có thể chờ finality lâu hơn fast.
              </div>;
            })()}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void executeBridge(false)}
              disabled={bridgeBusy || bridgeCanRetry || bridgeNeedsReview}
              style={{ width: "100%", justifyContent: "center", marginBottom: "0.75rem" }}
            >
              <ArrowRightLeft size={16} />
              {bridgeBusy ? "Đang xử lý CCTP..." : bridgeQuote ? "Xác nhận bridge USDC vào Arc" : "Lấy báo giá bridge USDC vào Arc"}
            </button>

            {bridgeProgress && <p role="status" style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{bridgeProgress}</p>}
            <p style={{ fontSize: "0.8rem", color: "var(--warning)" }}>Ví nguồn cần USDC và ETH testnet để trả phí. Nếu ví cảnh báo rủi ro, hãy dừng và kiểm tra mạng, hợp đồng, quyền approve; không bỏ qua cảnh báo.</p>
            {bridgeError && <p role="alert" style={{ fontSize: "0.82rem", color: "var(--danger, #ef4444)" }}>{bridgeError}</p>}
            {bridgeCanRetry && (
              <button type="button" className="btn btn-secondary" onClick={() => void executeBridge(true)} disabled={bridgeBusy}>
                Thử lại từ bước bị lỗi
              </button>
            )}
            {bridgeNeedsReview && !bridgeBusy && account && (
              <button type="button" className="btn btn-secondary" onClick={() => {
                void withCheckoutLock(paymentLockKey(account), async () => {
                  if (!window.confirm("Chỉ tiếp tục nếu đã kiểm tra lịch sử ví và chắc chắn chưa có giao dịch burn được gửi. Nếu đã burn, hủy thao tác này và giữ hồ sơ để khôi phục mint. Bạn xác nhận chưa gửi burn?")) return;
                  sessionStorage.removeItem(checkpointKey(account));
                  localStorage.removeItem(checkpointKey(account));
                  setBridgeNeedsReview(false); setBridgeOperation(null); setBridgeResult(null); setBridgeError("");
                }).catch(error => setBridgeError(paymentError(error)));
              }}>Tôi đã kiểm tra: chưa gửi burn</button>
            )}
            {bridgeResult?.steps.map((step: BridgeStep, index) => (
              <div key={`${step.name}-${index}`} style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                <strong>{step.name}</strong>: {step.state}
                {step.explorerUrl && (
                  <> — <a href={step.explorerUrl} target="_blank" rel="noreferrer">Explorer <ExternalLink size={11} /></a></>
                )}
                {step.errorMessage && <details><summary>Chi tiết kỹ thuật</summary><div style={{ overflowWrap: "anywhere" }}>{step.errorMessage}</div></details>}
              </div>
            ))}
          </div>
        )}
        {requiredUsdc && onContinueCheckout && <div style={{ marginTop: "1rem" }}>
          <p>Số cần nạp dự kiến: {requiredUsdc} USDC (đã tính khoản thiếu và ngân sách gas khi thiếu số dư Arc). Nạp tiền không tạo đơn hàng. Sau khi nạp, hệ thống kiểm tra lại chiến dịch trước khi xin chữ ký mua.</p>
          <p>Hiện chỉ hỗ trợ USDC từ các testnet bên trên. ETH/BTC/token khác chưa có tuyến Swap testnet được hỗ trợ; không dùng tiền mainnet ở đây.</p>
          <button type="button" className="btn btn-primary" disabled={bridgeBusy || bridgeNeedsReview || bridgeCanRetry} onClick={onContinueCheckout}>Kiểm tra số dư và tiếp tục mua</button>
        </div>}

        {/* Tab 3: Onramp */}
        {activeTab === "ONRAMP" && (
          <div>
            <div
              style={{
                background: "rgba(234, 179, 8, 0.12)",
                border: "1px solid var(--warning)",
                color: "var(--warning)",
                padding: "0.85rem",
                borderRadius: "var(--radius-md)",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>Feature Gate (Sandbox):</strong> Module Onramp thanh toán thẻ/ngân hàng đang ở chế độ sandbox theo quy định kiến trúc G1.3/G4.3. Chỉ được mở sau khi qua rà soát KYC và pháp lý.
              </div>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Trong môi trường Arc Testnet, vui lòng sử dụng tab <strong>Testnet Faucet</strong> hoặc <strong>CCTP Bridge</strong> để nạp tiền kiểm thử.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
