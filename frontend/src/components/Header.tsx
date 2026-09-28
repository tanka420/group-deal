import React, { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { AuthModal } from "./AuthModal";
import {
  Compass,
  ShoppingBag,
  Store,
  ShieldAlert,
  Code2,
  Coins,
  Globe,
  User as UserIcon,
  LogOut,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onTabChange }) => {
  const { t, language, setLanguage } = useLanguage();
  const { user, logout } = useAuth();
  const { account, usdcBalance, claimFaucet, walletMode } = useWeb3();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isFauceting, setIsFauceting] = useState(false);
  const [faucetSuccess, setFaucetSuccess] = useState(false);

  const handleFaucet = async () => {
    if (!account) {
      setIsAuthModalOpen(true);
      return;
    }
    setIsFauceting(true);
    setFaucetSuccess(false);
    try {
      await claimFaucet();
      setFaucetSuccess(true);
      setTimeout(() => setFaucetSuccess(false), 4000);
    } catch (e: any) {
      alert("Faucet error: " + e.message);
    } finally {
      setIsFauceting(false);
    }
  };

  const truncateAddress = (addr: string) =>
    addr ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : "";

  return (
    <header className="header">
      <div className="header-inner">
        {/* Brand & Network */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <a
            href="#explore"
            className="logo-group"
            onClick={(e) => {
              e.preventDefault();
              onTabChange("explore");
            }}
          >
            <div className="logo-mark">G</div>
            <span className="logo-text">
              GroupDeal
              <span style={{ fontSize: "0.85rem", color: "var(--cyan)", fontWeight: 500 }}>Arc</span>
            </span>
          </a>
          <span className="network-badge">{t("arcNetwork")}</span>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-links">
          <button
            className={`nav-item ${currentTab === "explore" ? "active" : ""}`}
            onClick={() => onTabChange("explore")}
          >
            <Compass size={17} />
            {t("explore")}
          </button>

          <button
            className={`nav-item ${currentTab === "orders" ? "active" : ""}`}
            onClick={() => onTabChange("orders")}
          >
            <ShoppingBag size={17} />
            {t("myOrders")}
          </button>

          <button
            className={`nav-item ${currentTab === "seller" ? "active" : ""}`}
            onClick={() => onTabChange("seller")}
          >
            <Store size={17} />
            {t("sellerStudio")}
          </button>

          <button
            className={`nav-item ${currentTab === "operator" ? "active" : ""}`}
            onClick={() => onTabChange("operator")}
          >
            <ShieldAlert size={17} />
            {t("operatorPortal")}
          </button>

          <button
            className={`nav-item ${currentTab === "docs" ? "active" : ""}`}
            onClick={() => onTabChange("docs")}
          >
            <Code2 size={17} />
            {t("devDocs")}
          </button>
        </nav>

        {/* Actions & Wallet Bar */}
        <div className="header-actions">
          {/* Faucet Button */}
          <button
            className="btn btn-sm btn-secondary"
            onClick={handleFaucet}
            disabled={isFauceting}
            title="Nhận 500 USDC testnet trên Arc"
            style={{
              borderColor: faucetSuccess ? "var(--success)" : undefined,
              color: faucetSuccess ? "var(--success)" : undefined,
            }}
          >
            <Coins size={15} color={faucetSuccess ? "var(--success)" : "var(--warning)"} />
            {isFauceting ? "Đang cấp..." : faucetSuccess ? "Đã nhận +500!" : t("faucet")}
          </button>

          {/* USDC Balance Pill */}
          {account && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "var(--radius-md)",
                background: "rgba(16, 23, 41, 0.8)",
                border: "1px solid var(--border-subtle)",
                fontSize: "0.85rem",
                fontFamily: "var(--font-mono)",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>USDC:</span>
              <strong style={{ color: "var(--cyan)" }}>${usdcBalance}</strong>
            </div>
          )}

          {/* Connected Wallet Pill */}
          {account ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.35rem 0.65rem",
                borderRadius: "var(--radius-md)",
                background: "rgba(99, 102, 241, 0.12)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                fontSize: "0.82rem",
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
              }}
              onClick={() => setIsAuthModalOpen(true)}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: walletMode === "CIRCLE_EMBEDDED" ? "var(--primary-light)" : "var(--cyan)",
                  boxShadow: "0 0 8px currentColor",
                }}
              />
              <span>{truncateAddress(account)}</span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "0.1rem 0.35rem",
                  borderRadius: "4px",
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "var(--text-secondary)",
                }}
              >
                {walletMode === "CIRCLE_EMBEDDED" ? "Circle EOA" : "MetaMask"}
              </span>
            </div>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => setIsAuthModalOpen(true)}>
              <UserIcon size={15} />
              {t("login")}
            </button>
          )}

          {/* Language Switcher */}
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setLanguage(language === "vi" ? "en" : "vi")}
            style={{ padding: "0.4rem 0.6rem" }}
            title="Đổi ngôn ngữ / Change language"
          >
            <Globe size={14} />
            <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>
              {language === "vi" ? "VI" : "EN"}
            </span>
          </button>

          {/* User Logout if logged in */}
          {user && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={logout}
              title={t("logout")}
              style={{ padding: "0.4rem 0.55rem" }}
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  );
};
