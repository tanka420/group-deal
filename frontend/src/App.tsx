import React, { useState, useEffect } from "react";
import { LanguageProvider } from "./context/LanguageContext";
import { AuthProvider } from "./context/AuthContext";
import { Web3Provider } from "./context/Web3Context";
import { Header } from "./components/Header";
import { ExplorePage } from "./pages/ExplorePage";
import { CampaignDetailPage } from "./pages/CampaignDetailPage";
import { BuyerDashboard } from "./pages/BuyerDashboard";
import { SellerDashboard } from "./pages/SellerDashboard";
import { OperatorPortal } from "./pages/OperatorPortal";
import { DeveloperDocs } from "./pages/DeveloperDocs";

const MainApp: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>("explore");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // Simple hash-based router listener
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

  return (
    <div className="app-container">
      <Header currentTab={currentTab} onTabChange={handleTabChange} />

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
            {currentTab === "seller" && <SellerDashboard />}
            {currentTab === "operator" && <OperatorPortal />}
            {currentTab === "docs" && <DeveloperDocs />}
          </>
        )}
      </main>

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
