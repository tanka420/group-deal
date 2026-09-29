import React, { useState, useEffect } from "react";
import { LanguageProvider } from "./context/LanguageContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Web3Provider } from "./context/Web3Context";
import { Header } from "./components/Header";
import { SellerRegisterModal } from "./components/SellerRegisterModal";
import { ExplorePage } from "./pages/ExplorePage";
import { CampaignDetailPage } from "./pages/CampaignDetailPage";
import { BuyerDashboard } from "./pages/BuyerDashboard";
import { SellerDashboard } from "./pages/SellerDashboard";
import { OperatorPortal } from "./pages/OperatorPortal";
import { DeveloperDocs } from "./pages/DeveloperDocs";
import { Store, Sparkles, Lock, ArrowRight } from "lucide-react";

const MainApp: React.FC = () => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>("explore");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isSellerModalOpen, setIsSellerModalOpen] = useState(false);

  // Hash-based router listener
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#campaign-")) {
        const id = hash.replace("#campaign-", "");
        setSelectedCampaignId(id);
      } else if (hash === "#orders") {
        setCurrentTab("orders");
        setSelectedCampaignId(null);
      } else if (hash === "#seller") {
        setCurrentTab("seller");
        setSelectedCampaignId(null);
      } else if (hash === "#operator") {
        setCurrentTab("operator");
        setSelectedCampaignId(null);
      } else if (hash === "#docs") {
        setCurrentTab("docs");
        setSelectedCampaignId(null);
      } else {
        setSelectedCampaignId(null);
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaignId(id);
    window.location.hash = `#campaign-${id}`;
  };

  const handleBackToExplore = () => {
    setSelectedCampaignId(null);
    setCurrentTab("explore");
    window.location.hash = "";
  };

  const handleTabChange = (tab: string) => {
    setCurrentTab(tab);
    setSelectedCampaignId(null);
    window.location.hash = `#${tab}`;
  };

  const isSeller = user?.roles?.includes("seller");
  const isOperator = user?.roles?.includes("operator");

  return (
    <div className="app-container">
      <Header
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onOpenSellerRegistration={() => setIsSellerModalOpen(true)}
      />

      <main className="main-content">
        {selectedCampaignId ? (
          <CampaignDetailPage
            campaignId={selectedCampaignId}
            onBack={handleBackToExplore}
            onGoToOrders={() => handleTabChange("orders")}
          />
        ) : (
          <>
            {currentTab === "explore" && (
              <ExplorePage onSelectCampaign={handleSelectCampaign} />
            )}

            {currentTab === "orders" && <BuyerDashboard />}

            {/* SELLER STUDIO TAB WITH REGISTRATION GUARD */}
            {currentTab === "seller" && (
              isSeller ? (
                <SellerDashboard />
              ) : (
                <div className="glass-card" style={{ maxWidth: "680px", margin: "3rem auto", textAlign: "center", padding: "3rem 2rem" }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      background: "rgba(6, 182, 212, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 1.5rem",
                      boxShadow: "0 0 25px rgba(6, 182, 212, 0.25)",
                    }}
                  >
                    <Store size={32} color="var(--cyan)" />
                  </div>

                  <h2 style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>
                    Kênh Người Bán Chưa Được Kích Hoạt
                  </h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "2rem" }}>
                    Tài khoản của bạn hiện tại là <strong>Buyer (Người mua)</strong>. Để tạo chiến dịch bán sản phẩm số, cấu hình tier giá nhóm và nhận thanh toán USDC, bạn cần đăng ký hồ sơ người bán và chứng minh quyền kiểm soát ví nhận tiền (Payout Wallet).
                  </p>

                  <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                    <button className="btn btn-secondary" onClick={handleBackToExplore}>
                      Quay lại Khám phá
                    </button>
                    <button className="btn btn-primary" onClick={() => setIsSellerModalOpen(true)}>
                      <Sparkles size={16} />
                      Đăng ký Kênh Người Bán Ngay
                    </button>
                  </div>
                </div>
              )
            )}

            {/* OPERATOR PORTAL WITH STRICT ADMIN GUARD */}
            {currentTab === "operator" && (
              isOperator ? (
                <OperatorPortal />
              ) : (
                <div className="glass-card" style={{ maxWidth: "680px", margin: "3rem auto", textAlign: "center", padding: "3rem 2rem" }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      background: "rgba(245, 158, 11, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 1.5rem",
                      boxShadow: "0 0 25px rgba(245, 158, 11, 0.25)",
                    }}
                  >
                    <Lock size={32} color="var(--warning)" />
                  </div>

                  <h2 style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>
                    Khu Vực Quản Trị Hệ Thống (Admin Only)
                  </h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "2rem" }}>
                    Cổng vận hành này chỉ dành riêng cho tài khoản Quản trị viên (Operator / Security Multisig) để thực hiện trọng tài phân bổ tranh chấp, duyệt huy hiệu người bán và đối soát tài chính Smart Contract. Tài khoản người dùng thông thường không có quyền truy cập.
                  </p>

                  <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                    <button className="btn btn-secondary" onClick={handleBackToExplore}>
                      Về trang chủ
                    </button>
                  </div>
                </div>
              )
            )}

            {currentTab === "docs" && <DeveloperDocs />}
          </>
        )}
      </main>

      {/* Seller Registration Modal */}
      <SellerRegisterModal
        isOpen={isSellerModalOpen}
        onClose={() => setIsSellerModalOpen(false)}
        onSuccess={() => {
          setIsSellerModalOpen(false);
          setCurrentTab("seller");
        }}
      />

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "2rem 1.5rem",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <strong>GroupDeal</strong> • Nền tảng Mua chung Sản phẩm số trên Arc Testnet (Circle Layer-1)
          </div>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <span style={{ color: "var(--cyan)" }}>Chain ID: 5042002</span>
            <span>USDC Native Gas</span>
            <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>
              ArcScan Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Web3Provider>
          <MainApp />
        </Web3Provider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
