import React, { Suspense, useState } from "react";
import { useLanguage } from "../context/LanguageContext";

class PageBoundary extends React.Component<{
  children: React.ReactNode;
  fallback: React.ReactNode;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export const DeferredPage: React.FC<{ route: string; children: React.ReactNode }> = ({ route, children }) => {
  const { language } = useLanguage();
  const [reloading, setReloading] = useState(false);
  return (
    <PageBoundary key={route} fallback={
      <section className="glass-card" role="alert">
        <h2>{language === "en" ? "Could not display this page" : "Không thể hiển thị trang này"}</h2>
        <p>{language === "en" ? "Reload the page to try again. Your saved transaction checkpoints remain available." : "Tải lại trang để thử lại. Các mốc giao dịch đã lưu vẫn được giữ."}</p>
        <button className="btn btn-secondary" disabled={reloading} onClick={() => { setReloading(true); window.location.reload(); }}>
          {language === "en" ? "Reload page" : "Tải lại trang"}
        </button>
      </section>
    }>
      <Suspense fallback={<p role="status" aria-live="polite" aria-busy="true">{language === "en" ? "Loading page…" : "Đang tải trang…"}</p>}>
        {children}
      </Suspense>
    </PageBoundary>
  );
};
