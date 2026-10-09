import {OperatorAccess} from "./components/OperatorAccess";
import React, { lazy, useState, useEffect, useRef } from "react";
import { LanguageProvider } from "./context/LanguageContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Web3Provider } from "./context/Web3Context";
import { Header } from "./components/Header";
import { AuthModal } from "./components/AuthModal";
import { useWeb3 } from "./context/Web3Context";
import { SellerRegisterModal } from "./components/SellerRegisterModal";
import { ExplorePage } from "./pages/ExplorePage";
import { DeferredPage } from "./components/DeferredPage";
import { parseAppHash, operatorDealHash, type AppRoute } from "./utils/appRoute";
import { Store, Sparkles, Lock, ArrowRight } from "lucide-react";
import { useLanguage } from "./context/LanguageContext";
import { focusPageElement, revealFocus } from "./utils/focus";

const CampaignDetailPage = lazy(() => import("./pages/CampaignDetailPage").then(module => ({ default: module.CampaignDetailPage })));
const BuyerDashboard = lazy(() => import("./pages/BuyerDashboard").then(module => ({ default: module.BuyerDashboard })));
const SellerDashboard = lazy(() => import("./pages/SellerDashboard").then(module => ({ default: module.SellerDashboard })));
const OperatorPortal = lazy(() => import("./pages/OperatorPortal").then(module => ({ default: module.OperatorPortal })));
const DeveloperDocs = lazy(() => import("./pages/DeveloperDocs").then(module => ({ default: module.DeveloperDocs })));
const PublicSellerProfile = lazy(() => import("./pages/PublicSellerProfile").then(module => ({ default: module.PublicSellerProfile })));
const SupportPage = lazy(() => import("./pages/SupportPage").then(module => ({ default: module.SupportPage })));

const MainApp: React.FC = () => {
  const { user, token } = useAuth();
  const { account } = useWeb3();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [purchaseAuth, setPurchaseAuth] = useState(false);
  const purchaseReturnFocus = useRef<HTMLElement|null>(null);
  const openAuth = () => { purchaseReturnFocus.current = null; setPurchaseAuth(false); setIsAuthOpen(true); };
  const closeAuth = () => {
    const target = purchaseReturnFocus.current; purchaseReturnFocus.current = null;
    setIsAuthOpen(false); setPurchaseAuth(false);
    if (target) requestAnimationFrame(() => { if (target.isConnected) focusPageElement(target); });
  };
  useEffect(() => {
    if (purchaseAuth && user && token && account && user.activeWallet?.toLowerCase() === account.toLowerCase()) { setIsAuthOpen(false); setPurchaseAuth(false); }
  }, [purchaseAuth, user?.id, user?.activeWallet, token, account]);
  const { language } = useLanguage();
  const [route, setRoute] = useState<AppRoute>(() => parseAppHash(window.location.hash));
  const currentTab = route.kind === "tab" ? route.tab : route.kind === "support" ? route.path : route.kind === "operator-deal" ? "operator" : route.kind === "not-found" ? "not-found" : "explore";
  const selectedCampaignId = route.kind === "campaign" ? route.id : null;
  const selectedSellerId = route.kind === "public-seller" ? route.id : null;
  const selectedOperatorDeal = route.kind === "operator-deal" ? { id: route.id, view: route.view } : null;
  const [isSellerModalOpen, setIsSellerModalOpen] = useState(false);
  useEffect(()=>{
    let keyboard=false,frame=0;
    const schedule=(target:HTMLElement)=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(document.activeElement===target)revealFocus(target);});};
    const keydown=(event:KeyboardEvent)=>{if(event.key==="Tab")keyboard=true;};
    const pointerdown=()=>{keyboard=false;};
    const focusin=(event:FocusEvent)=>{const target=event.target;if(keyboard&&target instanceof HTMLElement&&target.closest(".main-content"))schedule(target);};
    const resize=()=>{const target=document.activeElement;if(target instanceof HTMLElement&&target.closest(".main-content"))schedule(target);};
    // Async status rows can move a keyboard-focused input even without a window resize.
    const content=document.querySelector<HTMLElement>(".main-content");
    const contentResize=new ResizeObserver(()=>{if(keyboard)resize();});
    if(content)contentResize.observe(content);
    document.addEventListener("keydown",keydown,true);document.addEventListener("pointerdown",pointerdown,true);document.addEventListener("focusin",focusin);window.addEventListener("resize",resize);
    return()=>{contentResize.disconnect();cancelAnimationFrame(frame);document.removeEventListener("keydown",keydown,true);document.removeEventListener("pointerdown",pointerdown,true);document.removeEventListener("focusin",focusin);window.removeEventListener("resize",resize);};
  },[]);

  // Resolve the initial fragment and every navigation through the same route rules.
  useEffect(() => {
    const handleHash = () => setRoute(parseAppHash(window.location.hash));
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    if (route.kind === "not-found") focusPageElement(document.getElementById("route-not-found-heading"));
  }, [route.kind]);

  const navigate = (hash: string) => {
    setRoute(parseAppHash(hash));
    window.location.hash = hash;
  };
  const handleSelectCampaign = (id: string) => navigate("#campaign-" + id);
  const handleBackToExplore = () => navigate("");
  const handleTabChange = (tab: string) => navigate("#" + tab);

  const isSeller = user?.roles?.includes("seller");

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content" onClick={event=>{event.preventDefault();focusPageElement(document.getElementById("main-content"));}}>{language==="en"?"Skip to main content":"Đến nội dung chính"}</a>
      <AuthModal isOpen={isAuthOpen} onClose={closeAuth}/>
      <Header
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onOpenSellerRegistration={() => setIsSellerModalOpen(true)}
        onOpenAuth={openAuth}
      />

      <main className="main-content" id="main-content" tabIndex={-1}>
        <DeferredPage route={selectedSellerId ? `public-seller:${selectedSellerId}` : selectedCampaignId ? `campaign:${selectedCampaignId}` : currentTab}>
        {route.kind === "not-found" ? (
          <section className="glass-card ui-state route-not-found" aria-labelledby="route-not-found-heading">
            <p className="eyebrow">404</p>
            <h1 id="route-not-found-heading" tabIndex={-1}>{language === "en" ? "Page not found" : "Không tìm thấy trang"}</h1>
            <p className="muted">{language === "en" ? "This link does not match a supported page. Return to explore deals." : "Liên kết này không thuộc trang được hỗ trợ. Bạn có thể quay lại khám phá deal."}</p>
            <button className="btn btn-primary" onClick={handleBackToExplore}>{language === "en" ? "Explore deals" : "Khám phá deal"}</button>
          </section>
        ) : selectedSellerId ? <PublicSellerProfile key={selectedSellerId} sellerId={selectedSellerId} onBack={handleBackToExplore}/> : selectedCampaignId ? (
          <CampaignDetailPage
            key={selectedCampaignId}
            campaignId={selectedCampaignId}
            isAuthOpen={isAuthOpen}
            onRequestAuth={() => { purchaseReturnFocus.current = document.querySelector<HTMLElement>('.deal-join-cta'); setPurchaseAuth(true); setIsAuthOpen(true); }}
            onBack={handleBackToExplore}
            onGoToOrders={() => handleTabChange("orders")}
          />
        ) : (
          <>
            {currentTab === "explore" && (
              <ExplorePage onSelectCampaign={handleSelectCampaign} />
            )}

            {currentTab === "orders" && <BuyerDashboard key={user?.id}/>}
            {(currentTab === 'support' || currentTab.startsWith('support-ticket-') || currentTab.startsWith('support-order-')) && <SupportPage key={JSON.stringify([user?.id,token,user?.activeWallet,user?.roles.includes('operator'),currentTab])} route={currentTab}/>}

            {/* SELLER STUDIO TAB WITH REGISTRATION GUARD */}
            {currentTab === "seller" && (
              isSeller ? (
                <SellerDashboard key={user?.id}/>
              ) : (
                <div className="glass-card access-state">
                  <div className="ui-row"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      background: "rgba(6, 182, 212, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 1.5rem",
                      boxShadow: "none",
                    }}
                  >
                    <Store size={32} color="var(--cyan)" />
                  </div>

                  <h2 style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>
                    {language === "en" ? "Seller profile required" : "Kênh Người Bán Chưa Được Kích Hoạt"}
                  </h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "2rem" }}>
                    {language === "en" ? "Set up your seller profile with a verified account wallet before creating group-buy campaigns for digital products." : "Để tạo chiến dịch mua chung sản phẩm số, hãy đăng ký hồ sơ người bán và ký bằng ví nhận tiền đã xác minh thuộc tài khoản."}
                  </p>

                  <div className="ui-row" style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                    <button className="btn btn-secondary" onClick={handleBackToExplore}>
                      {language === "en" ? "Back to Explore" : "Quay lại Khám phá"}
                    </button>
                    <button className="btn btn-primary" onClick={() => setIsSellerModalOpen(true)}>
                      <Sparkles size={16} />
                      {language === "en" ? "Set up seller profile" : "Đăng ký Kênh Người Bán Ngay"}
                    </button>
                  </div>
                </div>
              )
            )}

            {currentTab === "operator" && <OperatorAccess onBack={handleBackToExplore}><OperatorPortal key={user?.id} dealSelection={selectedOperatorDeal} onDealSelectionChange={selection => navigate(operatorDealHash(selection))}/></OperatorAccess>}

            {currentTab === "docs" && <DeveloperDocs />}
          </>
        )}
        </DeferredPage>
      </main>

      {/* Seller Registration Modal */}
      <SellerRegisterModal
        isOpen={isSellerModalOpen}
        onClose={() => setIsSellerModalOpen(false)}
        onSuccess={() => {
          setIsSellerModalOpen(false);
          handleTabChange("seller");
        }}
      />

      <footer className="app-footer"><div className="app-footer-inner"><div><strong>GroupDeal</strong> · {language==="en"?"Digital group buying on Arc Testnet":"Mua chung sản phẩm số trên Arc Testnet"}</div><div className="app-footer-links"><span>Chain ID: 5042002</span><span>USDC Native Gas</span><a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">ArcScan Explorer</a></div></div></footer>
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
