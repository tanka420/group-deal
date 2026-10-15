import { PrimaryNavigation } from "./PrimaryNavigation";
import { DialogSurface } from "./DialogSurface";
import { Menu } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useWeb3 } from "../context/Web3Context";
import { useExternalWallet } from "../context/ExternalWalletContext";
import {NotificationInbox} from "./NotificationInbox";
import {useNotificationInbox,InboxItem} from "../services/notificationInbox";
import {
  ShoppingBag,
  Store,
  ShieldAlert,
  Coins,
  Globe,
  User as UserIcon,
  LogOut,
  ChevronDown,
  Copy,
  Check,
  Sparkles,
  Bell,
  Users,
} from "lucide-react";

import { FundingModal } from "./FundingModal";
import { revealFocus } from "../utils/focus";
import { authErrorMessage } from "../services/authPresentation";
import { messageText, type UiMessage } from "../utils/uiMessage";

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenSellerRegistration: () => void;
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  onOpenSellerRegistration,
  onOpenAuth,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const { user, token, logout, logoutState="NONE",sessionNotice=null,refreshUser,circleWalletSyncing, circleWalletError, retryCircleWallet, circleCredentials,circleWalletChoices=[] } = useAuth();
  const { account, usdcBalance, balanceError, walletMode, externalSignerReady, reconnectExternalWallet } = useWeb3();
  const external = useExternalWallet();
  const [walletActionError, setWalletActionError] = useState<UiMessage | null>(null);

  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const inbox=useNotificationInbox(token,user?.id),unreadNotifications=inbox.unread;

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const openAccount = () => { accountButtonRef.current?.focus(); setIsDropdownOpen(false); onOpenAuth(); };
  const headerRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    const element=headerRef.current;if(!element)return;
    const update=()=>{
      document.documentElement.style.setProperty("--app-header-height",`${element.getBoundingClientRect().height}px`);
      const target=document.activeElement;if(target instanceof HTMLElement&&target.closest(".main-content"))revealFocus(target);
    };
    const observer=new ResizeObserver(update);update();observer.observe(element);
    return()=>{observer.disconnect();document.documentElement.style.removeProperty("--app-header-height");};
  },[]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false); setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(()=>{setIsDropdownOpen(false);setNotificationsOpen(false);setMobileOpen(false);},[currentTab,user?.id]);
  const go=(tab:string)=>{setIsDropdownOpen(false);setNotificationsOpen(false);setMobileOpen(false);onTabChange(tab);};
  const openNotification = async (notification:InboxItem) => {
    if(!await inbox.markRead(notification))return;
    if(notification.link&&(["#orders","#seller","#operator"].includes(notification.link)||/^#(?:campaign|order)-[A-Za-z0-9_-]{1,180}$/.test(notification.link)||/^#support-ticket-tkt_[a-f0-9-]{36}$/.test(notification.link))){
      go(notification.link.slice(1));
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
    (account ? truncate(account, 6) : language === "en" ? "Wallet account" : "Tài khoản ví");

  return (
    <header className="header" ref={headerRef}>
      <div className="header-inner">
        {/* Brand & Arc Testnet Badge */}
        <div className="header-brand" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <a
            href="/"
            className="logo-group"
            onClick={(e) => {
              e.preventDefault();
              onTabChange("home");
            }}
          >
            <div className="logo-mark"><Users size={23} aria-hidden="true"/></div>
            <span className="logo-text">
              GroupDeal
            </span>
          </a>

        </div>

        <div className="desktop-navigation"><PrimaryNavigation currentTab={currentTab} seller={Boolean(isSeller)} admin={currentTab==='operator'} onNavigate={go}/></div>
        <button className="btn btn-secondary mobile-menu-button" type="button" aria-label={language==='en'?'Open navigation':'Mở điều hướng'} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={()=>{setIsDropdownOpen(false);setNotificationsOpen(false);setMobileOpen(true);}}><Menu size={20} aria-hidden="true"/></button>
        {/* Right Actions & Account Dropdown */}
        <div className="header-actions">
          {/* Funding & Testnet Faucet */}
          <button
            className="btn btn-sm btn-secondary header-funding"
            onClick={() => setIsFundingModalOpen(true)}
            title={language==="en"?"Fund USDC, CCTP Bridge & Testnet Faucet":"Nạp USDC, CCTP Bridge & Testnet Faucet"}
          >
            <Coins size={15} color="var(--warning)" />
            <span>{language==="en"?"Fund USDC":"Nạp USDC"}</span>
          </button>

          {/* User Account / Dropdown */}
          {!user ? (
            <button className="btn btn-sm btn-primary header-login" onClick={onOpenAuth}>
              <UserIcon size={15} />
              <span className="header-auth-label">{t("login")}</span>
            </button>
          ) : (
            <div className="account-dropdown-wrapper" ref={dropdownRef} onKeyDown={event=>{
              if(event.key==="Escape"){event.stopPropagation();if(notificationsOpen){setNotificationsOpen(false);notificationButtonRef.current?.focus();}else{setIsDropdownOpen(false);accountButtonRef.current?.focus();}}
            }}>
              <button
                ref={notificationButtonRef}
                className="btn btn-sm btn-secondary"
                aria-expanded={notificationsOpen}
                aria-controls="header-notifications"
                aria-label={language==="en"?`Notifications${unreadNotifications?`, ${unreadNotifications} unread`:""}`:`Thông báo${unreadNotifications ? `, ${unreadNotifications} chưa đọc` : ""}`}
                onClick={() => {
                  setIsDropdownOpen(false);setNotificationsOpen(prev=>!prev);
                  void inbox.reload();
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
              {notificationsOpen&&<div className="account-dropdown-menu notification-popover" id="header-notifications" role="region" aria-label={language==='en'?'Notifications':'Thông báo'}><div className="popover-scroll"><NotificationInbox rows={inbox.rows} pending={inbox.pending} error={inbox.error} cursor={inbox.cursor} onReload={()=>void inbox.reload()} onMore={()=>void inbox.more()} onOpen={notification=>void openNotification(notification)}/><button className="btn btn-secondary" onClick={()=>go('notifications')}>{language==='en'?'All notifications':'Tất cả thông báo'}</button></div></div>}
              {/* Account Pill Trigger */}
              <button
                className="account-pill-btn"
                ref={accountButtonRef}
                aria-expanded={isDropdownOpen}
                aria-controls="header-account"
                onClick={() => {setNotificationsOpen(false);setIsDropdownOpen(prev=>!prev);}}
              >
                <div className="avatar-circle">
                  {user.email
                    ? user.email.substring(0, 1).toUpperCase()
                    : account
                      ? account.substring(2, 3).toUpperCase()
                      : "U"}
                </div>
                <div className="account-summary" style={{ display: "flex", flexDirection: "column", textAlign: "left", lineHeight: 1.2 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    {accountLabel}
                  </span>
                  <span className="font-mono" style={{ fontSize: "0.72rem", color: "var(--cyan)" }}>
                    {account
                      ? (usdcBalance === null ? (balanceError ? (language === "en" ? "Balance unavailable" : "Chưa đọc được số dư") : (language === "en" ? "Loading balance…" : "Đang tải số dư…")) : `${usdcBalance} USDC${balanceError ? (language === "en" ? " · update pending" : " · chưa cập nhật") : ""}`)
                      : circleWalletSyncing
                        ? (language === "en" ? "Syncing Circle wallet…" : "Đang đồng bộ ví Circle…")
                        : (language === "en" ? "No active wallet" : "Chưa có ví hoạt động")}
                  </span>
                </div>
                <ChevronDown size={14} color="var(--text-muted)" />
              </button>

              {/* Floating Dropdown Menu */}
              {isDropdownOpen && (
                <div className="account-dropdown-menu" id="header-account" role="region" aria-label={language==="en"?"Account menu":"Menu tài khoản"}><div className="popover-scroll">
                  {/* User Profile Header */}
                  <div className="dropdown-user-header">
                    <div className="dropdown-email">
                      {user.email || (user.loginMethod === "CIRCLE_EMAIL" ? (language === "en" ? "Circle email sign-in" : "Đăng nhập email qua Circle") : (language === "en" ? "EVM wallet sign-in" : "Đăng nhập bằng chữ ký ví EVM"))}
                    </div>
                    <div className="dropdown-roles">
                      <span className="role-tag buyer">{language === "en" ? "Buyer" : "Người mua"}</span>
                      {isSeller && <span className="role-tag seller">{language === "en" ? "Seller" : "Người bán"}</span>}
                      {isOperator && <span className="role-tag operator">{language === "en" ? "Operator" : "Vận hành"}</span>}
                    </div>

                    {circleWalletSyncing && !account && (
                      <div style={{ marginTop: "0.65rem", color: "var(--cyan)", fontSize: "0.75rem" }}>
                        {language === "en" ? "Signed in. Circle is syncing your Arc wallet in the background." : "Đã đăng nhập. Ví Arc đang được Circle đồng bộ trong nền."}
                      </div>
                    )}
                    {(circleWalletError || walletActionError) && <p role="alert">{circleWalletError ? (language === "en" ? "The Circle signing wallet is unavailable. Reauthenticate or retry synchronization." : "Chưa dùng được ví ký Circle. Xác thực lại hoặc thử đồng bộ ví.") : walletActionError && messageText(walletActionError, language)}</p>}
                    {circleWalletChoices.length>0&&<button type="button" className="btn btn-primary" onClick={openAccount}>{language==="en"?"Choose your Circle wallet":"Chọn ví Circle của bạn"}</button>}
                    <button className="btn btn-sm btn-secondary" onClick={openAccount}>{language === "en" ? "Account details" : "Thông tin tài khoản"}</button>
                    {user.loginMethod === "CIRCLE_EMAIL" && !circleWalletSyncing && (
                      <button className="btn btn-sm btn-secondary" onClick={() => {
                        if (!circleCredentials) openAccount();
                        else void retryCircleWallet();
                      }}>
                        {circleCredentials ? (language === "en" ? "Resync Circle wallet" : "Đồng bộ lại ví Circle") : (language === "en" ? "Authenticate email for signing / wallet sync" : "Xác thực email để ký / đồng bộ ví")}
                      </button>
                    )}
                    {walletMode === "EXTERNAL_REOWN" && !externalSignerReady && (
                      <button className="btn btn-sm btn-secondary" onClick={() => {
                        setWalletActionError(null);
                        void reconnectExternalWallet().catch((error) => setWalletActionError(authErrorMessage(error, "WALLET")));
                      }}>{language === "en" ? "Reconnect wallet to sign" : "Kết nối lại ví để ký"}</button>
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
                            title={language === "en" ? "Copy wallet address" : "Sao chép địa chỉ ví"}
                            aria-label={language === "en" ? "Copy wallet address" : "Sao chép địa chỉ ví"}
                          >
                            {copiedWallet ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="dropdown-menu-list">
                    <button className="dropdown-menu-item" onClick={()=>go('account')}>{language==='en'?'Account settings':'Cài đặt tài khoản'}</button>
                    <button className="dropdown-menu-item" onClick={()=>go('wallet')}>{language==='en'?'Wallet':'Ví'}</button>
                    <button className="dropdown-menu-item" onClick={()=>go('support')}>{language==='en'?'Support':'Hỗ trợ'}</button>
                  </div>
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
                    {user && (
                      <button
                        className="dropdown-menu-item highlight-operator"
                        onClick={() => {
                          onTabChange("operator");
                          setIsDropdownOpen(false);
                        }}
                      >
                        <ShieldAlert size={16} />
                        <span>{isOperator?t("operatorPortal"):(language==="en"?"Operator access":"Quyền operator")}</span>
                      </button>
                    )}

                    <div className="dropdown-divider" />

                    {/* Language Switch */}
                    <button
                      className="dropdown-menu-item"
                      onClick={() => setLanguage(language === "vi" ? "en" : "vi")}
                    >
                      <Globe size={16} />
                      <span>{language==="en"?"Language":"Ngôn ngữ"}: <strong>{language === "vi" ? "Tiếng Việt" : "English"}</strong></span>
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
                </div></div>
              )}
            </div>
          )}
        </div>
      </div>

      {(logoutState!=="NONE"||sessionNotice)&&<div className="session-banner" role={logoutState==="UNCONFIRMED"||sessionNotice==="UNAVAILABLE"?"alert":"status"}>
        {logoutState==="PENDING"?(language==="en"?"Signed out here. Waiting for server revocation…":"Đã đăng xuất trên máy này. Đang chờ máy chủ xác nhận thu hồi…"):logoutState==="CONFIRMED"?(language==="en"?"Signed out. Server session revocation confirmed.":"Đã đăng xuất. Máy chủ đã xác nhận thu hồi phiên."):logoutState==="UNCONFIRMED"?(language==="en"?"Signed out here. Server revocation could not be confirmed. Sign in again and review your sessions.":"Đã đăng xuất trên máy này. Chưa xác nhận được thu hồi ở máy chủ. Đăng nhập lại để kiểm tra các phiên."):sessionNotice==="ENDED"?(language==="en"?"This sign-in session has ended. Sign in again to continue.":"Phiên đăng nhập đã kết thúc. Đăng nhập lại để tiếp tục."):(language==="en"?"Unable to verify your session. Check the connection and retry.":"Chưa kiểm tra được phiên đăng nhập. Kiểm tra kết nối và thử lại.")}
        {sessionNotice==="UNAVAILABLE"&&<button className="btn btn-sm btn-secondary" onClick={()=>void refreshUser()}>{language==="en"?"Retry session check":"Kiểm tra lại phiên"}</button>}
      </div>}

      {mobileOpen&&<DialogSurface label={language==='en'?'Navigation':'Điều hướng'} id="mobile-navigation" className="navigation-dialog" onClose={()=>setMobileOpen(false)}><h2>{language==='en'?'Navigation':'Điều hướng'}</h2><PrimaryNavigation currentTab={currentTab} seller={Boolean(isSeller)} admin={currentTab==='operator'} onNavigate={go}/></DialogSurface>}
      <FundingModal isOpen={isFundingModalOpen} onClose={() => setIsFundingModalOpen(false)} />
    </header>
  );
};
