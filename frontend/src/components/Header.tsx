import React, { useState, useRef, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { AuthModal } from "./AuthModal";
import { SellerRegisterModal } from "./SellerRegisterModal";
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
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenSellerRegistration: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  onOpenSellerRegistration,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const { user, logout, verifyOtp } = useAuth();
  const { account, usdcBalance, claimFaucet, walletMode } = useWeb3();

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFauceting, setIsFauceting] = useState(false);
  const [faucetSuccess, setFaucetSuccess] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const handleCopyWallet = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (account) {
      navigator.clipboard.writeText(account);
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    }
  };

  // Demo shortcut: Switch to operator account
  const handleSwitchToAdmin = async () => {
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "operator@groupdeal.io" }),
      });
      const data = await res.json();
      await verifyOtp("operator@groupdeal.io", data.code || "123456");
      setIsDropdownOpen(false);
      onTabChange("operator");
    } catch (e: any) {
      alert("Lỗi chuyển tài khoản Admin: " + e.message);
    }
  };

  const truncate = (str: string, len = 6) =>
    str ? `${str.substring(0, len)}...${str.substring(str.length - 4)}` : "";

  const isSeller = user?.roles?.includes("seller");
  const isOperator = user?.roles?.includes("operator");

  return (
    <header className="header">
      <div className="header-inner">
        {/* Brand & Arc Testnet Badge */}
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

        {/* Clean Primary Navigation (Uncluttered) */}
        <nav className="nav-links">
          <button
            className={`nav-item ${currentTab === "explore" ? "active" : ""}`}
            onClick={() => onTabChange("explore")}
          >
            <Compass size={17} />
            {t("explore")}
          </button>

          <button
            className={`nav-item ${currentTab === "docs" ? "active" : ""}`}
            onClick={() => onTabChange("docs")}
          >
            <Code2 size={17} />
            {t("devDocs")}
          </button>
        </nav>

        {/* Right Actions & Account Dropdown */}
        <div className="header-actions">
          {/* Quick Faucet */}
          <button
            className="btn btn-sm btn-secondary"
            onClick={handleFaucet}
            disabled={isFauceting}
            title="Nhận 500 Test USDC trên Arc Testnet"
            style={{
              borderColor: faucetSuccess ? "var(--success)" : undefined,
              color: faucetSuccess ? "var(--success)" : undefined,
            }}
          >
            <Coins size={15} color={faucetSuccess ? "var(--success)" : "var(--warning)"} />
            {isFauceting ? "Đang cấp..." : faucetSuccess ? "Đã nhận +500!" : t("faucet")}
          </button>

          {/* User Account / Dropdown */}
          {!user ? (
            <button className="btn btn-sm btn-primary" onClick={() => setIsAuthModalOpen(true)}>
              <UserIcon size={15} />
              {t("login")}
            </button>
          ) : (
            <div className="account-dropdown-wrapper" ref={dropdownRef}>
              {/* Account Pill Trigger */}
              <button
                className="account-pill-btn"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
              >
                <div className="avatar-circle">
                  {user.email ? user.email.substring(0, 1).toUpperCase() : "U"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", textAlign: "left", lineHeight: 1.2 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    {user.sellerProfile?.displayName || user.email.split("@")[0]}
                  </span>
                  <span className="font-mono" style={{ fontSize: "0.72rem", color: "var(--cyan)" }}>
                    ${usdcBalance} USDC
                  </span>
                </div>
                <ChevronDown size={14} color="var(--text-muted)" />
              </button>

              {/* Floating Dropdown Menu */}
              {isDropdownOpen && (
                <div className="account-dropdown-menu">
                  {/* User Profile Header */}
                  <div className="dropdown-user-header">
                    <div className="dropdown-email">{user.email}</div>
                    <div className="dropdown-roles">
                      <span className="role-tag buyer">Buyer</span>
                      {isSeller && <span className="role-tag seller">Seller</span>}
                      {isOperator && <span className="role-tag operator">Admin</span>}
                    </div>

                    {account && (
                      <div className="dropdown-wallet-box">
                        <span>{truncate(account, 6)}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            {walletMode === "CIRCLE_EMBEDDED" ? "Circle EOA" : "MetaMask"}
                          </span>
                          <button
                            onClick={handleCopyWallet}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex" }}
                            title="Copy ví"
                          >
                            {copiedWallet ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Menu Items */}
                  <div className="dropdown-menu-list">
                    {/* Buyer Orders */}
                    <button
                      className="dropdown-menu-item"
                      onClick={() => {
                        onTabChange("orders");
                        setIsDropdownOpen(false);
                      }}
                    >
                      <ShoppingBag size={16} color="var(--primary-light)" />
                      <span>{t("myOrders")}</span>
                    </button>

                    {/* Seller Studio: Only visible if registered seller */}
                    {isSeller ? (
                      <button
                        className="dropdown-menu-item highlight-seller"
                        onClick={() => {
                          onTabChange("seller");
                          setIsDropdownOpen(false);
                        }}
                      >
                        <Store size={16} />
                        <span>{t("sellerStudio")}</span>
                      </button>
                    ) : (
                      /* If not seller: Show Register as Seller */
                      <button
                        className="dropdown-menu-item"
                        style={{ color: "var(--cyan)" }}
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onOpenSellerRegistration();
                        }}
                      >
                        <Sparkles size={16} />
                        <span>Đăng ký mở Kênh Người Bán</span>
                      </button>
                    )}

                    {/* Operator Portal: STRICTLY for Admin / Operator */}
                    {isOperator && (
                      <button
                        className="dropdown-menu-item highlight-operator"
                        onClick={() => {
                          onTabChange("operator");
                          setIsDropdownOpen(false);
                        }}
                      >
                        <ShieldAlert size={16} />
                        <span>{t("operatorPortal")}</span>
                      </button>
                    )}

                    <div className="dropdown-divider" />

                    {/* Language Switch */}
                    <button
                      className="dropdown-menu-item"
                      onClick={() => setLanguage(language === "vi" ? "en" : "vi")}
                    >
                      <Globe size={16} />
                      <span>Ngôn ngữ: <strong>{language === "vi" ? "Tiếng Việt" : "English"}</strong></span>
                    </button>

                    {/* Demo shortcut to switch to Admin */}
                    {!isOperator && (
                      <button
                        className="dropdown-menu-item"
                        onClick={handleSwitchToAdmin}
                        style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                      >
                        <ShieldCheck size={15} color="#fbbf24" />
                        <span>Đăng nhập Admin (Test Demo)</span>
                      </button>
                    )}

                    <div className="dropdown-divider" />

                    {/* Logout */}
                    <button
                      className="dropdown-menu-item"
                      style={{ color: "var(--danger)" }}
                      onClick={() => {
                        logout();
                        setIsDropdownOpen(false);
                      }}
                    >
                      <LogOut size={16} />
                      <span>{t("logout")}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  );
};
