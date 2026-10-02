import React, { useState, useRef, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { useExternalWallet } from "../context/ExternalWalletContext";
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
  Bell,
} from "lucide-react";

import { FundingModal } from "./FundingModal";

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
  const { user, token, logout, circleWalletSyncing, circleWalletError, retryCircleWallet, circleCredentials } = useAuth();
  const { account, usdcBalance, balanceError, walletMode, externalSignerReady, reconnectExternalWallet } = useWeb3();
  const external = useExternalWallet();
  const [walletActionError, setWalletActionError] = useState<string | null>(null);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

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

  const refreshNotifications = async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadNotifications(data.unread || 0);
    } catch (error) {
      console.warn("Could not load notifications", error);
    }
  };

  useEffect(() => {
    if (!user || !token) {
      setNotifications([]);
      setUnreadNotifications(0);
      return;
    }
    void refreshNotifications();
    const timer = window.setInterval(() => void refreshNotifications(), 30_000);
    return () => window.clearInterval(timer);
  }, [user, token]);

  const openNotification = async (notification: any) => {
    if (!token) return;
    if (!notification.readAt) {
      await fetch(`/api/notifications/${notification.id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshNotifications();
    }
    if (["#orders", "#seller", "#operator"].includes(notification.link)) {
      onTabChange(notification.link.substring(1));
      setIsDropdownOpen(false);
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


  const truncate = (str: string, len = 6) =>
    str ? `${str.substring(0, len)}...${str.substring(str.length - 4)}` : "";

  const isSeller = user?.roles?.includes("seller");
  const isOperator = user?.roles?.includes("operator");
  const accountLabel =
    user?.sellerProfile?.displayName ||
    user?.email?.split("@")[0] ||
    (account ? truncate(account, 6) : "Tài khoản ví");

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
          {/* Funding & Testnet Faucet */}
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setIsFundingModalOpen(true)}
            title="Nạp USDC, CCTP Bridge & Testnet Faucet"
          >
            <Coins size={15} color="var(--warning)" />
            <span>Nạp USDC</span>
          </button>

          {/* User Account / Dropdown */}
          {!user ? (
            <button className="btn btn-sm btn-primary" onClick={() => setIsAuthModalOpen(true)}>
              <UserIcon size={15} />
              {t("login")}
            </button>
          ) : (
            <div className="account-dropdown-wrapper" ref={dropdownRef}>
              <button
                className="btn btn-sm btn-secondary"
                aria-label={`Thông báo${unreadNotifications ? `, ${unreadNotifications} chưa đọc` : ""}`}
                onClick={() => {
                  setIsDropdownOpen((prev) => !prev);
                  void refreshNotifications();
                }}
                style={{ position: "relative", paddingInline: "0.65rem" }}
              >
                <Bell size={16} />
                {unreadNotifications > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-0.35rem",
                      right: "-0.35rem",
                      minWidth: "1rem",
                      height: "1rem",
                      paddingInline: "0.2rem",
                      borderRadius: "999px",
                      background: "var(--danger)",
                      color: "white",
                      fontSize: "0.65rem",
                      lineHeight: "1rem",
                    }}
                  >
                    {Math.min(unreadNotifications, 99)}
                  </span>
                )}
              </button>
              {/* Account Pill Trigger */}
              <button
                className="account-pill-btn"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
              >
                <div className="avatar-circle">
                  {user.email
                    ? user.email.substring(0, 1).toUpperCase()
                    : account
                      ? account.substring(2, 3).toUpperCase()
                      : "U"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", textAlign: "left", lineHeight: 1.2 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    {accountLabel}
                  </span>
                  <span className="font-mono" style={{ fontSize: "0.72rem", color: "var(--cyan)" }}>
                    {account
                      ? (usdcBalance === null ? balanceError || "Đang tải số dư..." : `${usdcBalance} USDC${balanceError ? " · chưa cập nhật" : ""}`)
                      : circleWalletSyncing
                        ? "Đang đồng bộ ví Circle..."
                        : "Chưa có ví hoạt động"}
                  </span>
                </div>
                <ChevronDown size={14} color="var(--text-muted)" />
              </button>

              {/* Floating Dropdown Menu */}
              {isDropdownOpen && (
                <div className="account-dropdown-menu">
                  {/* User Profile Header */}
                  <div className="dropdown-user-header">
                    <div className="dropdown-email">
                      {user.email || (user.loginMethod === "CIRCLE_EMAIL" ? "Đăng nhập email qua Circle" : "Đăng nhập bằng chữ ký ví EVM")}
                    </div>
                    <div className="dropdown-roles">
                      <span className="role-tag buyer">Buyer</span>
                      {isSeller && <span className="role-tag seller">Seller</span>}
                      {isOperator && <span className="role-tag operator">Admin</span>}
                    </div>

                    {circleWalletSyncing && !account && (
                      <div style={{ marginTop: "0.65rem", color: "var(--cyan)", fontSize: "0.75rem" }}>
                        Đã đăng nhập. Ví Arc đang được Circle đồng bộ trong nền.
                      </div>
                    )}
                    {(circleWalletError || walletActionError) && <p role="alert">{circleWalletError || walletActionError}</p>}
                    {user.loginMethod === "CIRCLE_EMAIL" && !circleWalletSyncing && (
                      <button className="btn btn-sm btn-secondary" onClick={() => {
                        if (!circleCredentials) setIsAuthModalOpen(true);
                        else void retryCircleWallet();
                      }}>
                        {circleCredentials ? "Đồng bộ lại ví Circle" : "Xác thực email để ký / đồng bộ ví"}
                      </button>
                    )}
                    {walletMode === "EXTERNAL_REOWN" && !externalSignerReady && (
                      <button className="btn btn-sm btn-secondary" onClick={() => {
                        setWalletActionError(null);
                        void reconnectExternalWallet().catch((error) => setWalletActionError(error.message));
                      }}>Kết nối lại ví để ký</button>
                    )}

                    {account && (
                      <div className="dropdown-wallet-box">
                        <span>{truncate(account, 6)}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            {walletMode === "CIRCLE_EMBEDDED" ? "Circle EOA" : "Reown EVM"}
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

                  <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                      Thông báo {unreadNotifications > 0 && `(${unreadNotifications} mới)`}
                    </div>
                    {notifications.length === 0 ? (
                      <div style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}>
                        Chưa có thông báo.
                      </div>
                    ) : (
                      notifications.slice(0, 5).map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => void openNotification(notification)}
                          style={{
                            width: "100%",
                            border: 0,
                            borderRadius: "0.5rem",
                            background: notification.readAt ? "transparent" : "rgba(34, 211, 238, 0.08)",
                            color: "inherit",
                            textAlign: "left",
                            padding: "0.5rem",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: "0.76rem", fontWeight: notification.readAt ? 500 : 700 }}>
                            {notification.title}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                            {notification.message}
                          </div>
                        </button>
                      ))
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


                    <div className="dropdown-divider" />

                    {/* Logout */}
                    <button
                      className="dropdown-menu-item"
                      style={{ color: "var(--danger)" }}
                      onClick={() => {
                        logout();
                        setWalletActionError(null);
                        void external.disconnect().catch(() => setWalletActionError("Đã đăng xuất ứng dụng, nhưng ví chưa ngắt kết nối."));
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
      <FundingModal isOpen={isFundingModalOpen} onClose={() => setIsFundingModalOpen(false)} />
    </header>
  );
};
