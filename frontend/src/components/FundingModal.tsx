import React, { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useWeb3 } from "../context/Web3Context";
import {
  X,
  Coins,
  ArrowRightLeft,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Fuel,
  Info,
} from "lucide-react";

interface FundingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FundingModal: React.FC<FundingModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const { account, usdcBalance, claimFaucet } = useWeb3();

  const [activeTab, setActiveTab] = useState<"FAUCET" | "BRIDGE" | "ONRAMP">("FAUCET");
  const [isFauceting, setIsFauceting] = useState(false);
  const [faucetSuccess, setFaucetSuccess] = useState(false);
  const [faucetTxHash, setFaucetTxHash] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClaimFaucet = async () => {
    setIsFauceting(true);
    setFaucetSuccess(false);
    try {
      const res = await claimFaucet();
      setFaucetSuccess(true);
      if (res?.txHash) setFaucetTxHash(res.txHash);
      setTimeout(() => setFaucetSuccess(false), 5000);
    } catch (e: any) {
      alert("Faucet error: " + e.message);
    } finally {
      setIsFauceting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
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
          <button className="modal-close" onClick={onClose}>
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
                ${Number(usdcBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC
              </div>
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
                <span>Phí gas Arc:</span>
              </div>
              <span className="font-mono" style={{ color: "var(--warning)" }}>
                ~0.005 USDC/tx
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
            Lưu ý: USDC ERC-20 (6 decimals) được quản lý tách biệt tuyệt đối với native gas fees. Thao tác nạp quỹ không bị đánh đồng với mua hàng.
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
              Nhận ngay 500 USDC testnet vào ví đang kết nối để thử nghiệm đặt mua hàng theo nhóm trên Arc Testnet.
            </p>

            <button
              className="btn btn-primary"
              onClick={handleClaimFaucet}
              disabled={isFauceting}
              style={{ width: "100%", justifyContent: "center", marginBottom: "0.75rem" }}
            >
              <Coins size={16} />
              {isFauceting ? "Đang yêu cầu 500 USDC..." : "Yêu cầu 500 Test USDC"}
            </button>

            {faucetSuccess && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid var(--success)",
                  color: "var(--success)",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <CheckCircle2 size={16} />
                <span>Đã chuyển 500 USDC vào ví thành công!</span>
              </div>
            )}

            <div
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "0.75rem 1rem",
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Circle Official Faucet:</span>
                <a
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--primary-light)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    textDecoration: "none",
                  }}
                >
                  faucet.circle.com <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: CCTP Bridge */}
        {activeTab === "BRIDGE" && (
          <div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Sử dụng giao thức Circle CCTP V2 (Cross-Chain Transfer Protocol) để chuyển USDC từ Ethereum/Sepolia, Arbitrum, Base sang Arc Testnet với tính bất biến tuyệt đối.
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
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Token Messenger V2:</span>
                <span className="font-mono" style={{ fontSize: "0.78rem" }}>0x8fe6d1fa08d3e91d5757fe1a8a25c3453b3fb34b</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Phí chuyển liên chuỗi:</span>
                <span style={{ color: "var(--success)" }}>0% (Sponsored)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Thời gian xác nhận (Finality):</span>
                <span>~15-30 giây</span>
              </div>
            </div>

            <a
              href="https://testnet.arc.io/bridge"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <ArrowRightLeft size={16} />
              Mở Arc CCTP Bridge Portal <ExternalLink size={14} />
            </a>
          </div>
        )}

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
    </div>
  );
};
