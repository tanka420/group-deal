import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X, Copy, Check, QrCode, Code } from "lucide-react";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignTitle: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  campaignId,
  campaignTitle,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWidget, setCopiedWidget] = useState(false);

  const campaignUrl = `${window.location.origin}/#campaign-${campaignId}`;
  const embedSnippet = `<iframe src="${window.location.origin}/api/v1/campaigns/${campaignId}/widget-data" width="380" height="220" frameborder="0"></iframe>`;

  useEffect(() => {
    if (isOpen && campaignUrl) {
      QRCode.toDataURL(campaignUrl, { width: 200, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
        .then(setQrDataUrl)
        .catch(console.error);
    }
  }, [isOpen, campaignUrl]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, isLink: boolean) => {
    navigator.clipboard.writeText(text);
    if (isLink) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setCopiedWidget(true);
      setTimeout(() => setCopiedWidget(false), 2500);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <QrCode size={20} color="var(--primary-light)" />
            <h3 style={{ fontSize: "1.15rem" }}>Chia sẻ chiến dịch & Mã QR</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
          {campaignTitle}
        </p>

        {/* QR Code */}
        {qrDataUrl && (
          <div
            style={{
              background: "#ffffff",
              padding: "1rem",
              borderRadius: "var(--radius-lg)",
              width: "fit-content",
              margin: "0 auto 1.5rem",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
            }}
          >
            <img src={qrDataUrl} alt="Campaign QR Code" style={{ display: "block" }} />
          </div>
        )}

        {/* Copy Link */}
        <div className="form-group">
          <label className="form-label">Đường dẫn chiến dịch</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input type="text" className="form-input" value={campaignUrl} readOnly />
            <button
              className="btn btn-secondary"
              onClick={() => copyToClipboard(campaignUrl, true)}
              style={{ padding: "0.6rem 1rem" }}
            >
              {copiedLink ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
              {copiedLink ? "Đã copy" : "Copy"}
            </button>
          </div>
        </div>

        {/* Embed Widget Snippet */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Mã nhúng Widget chỉ đọc (Iframe / Website bán hàng)</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input type="text" className="form-input font-mono" value={embedSnippet} readOnly style={{ fontSize: "0.8rem" }} />
            <button
              className="btn btn-secondary"
              onClick={() => copyToClipboard(embedSnippet, false)}
              style={{ padding: "0.6rem 1rem" }}
            >
              {copiedWidget ? <Check size={16} color="var(--success)" /> : <Code size={16} />}
              {copiedWidget ? "Đã copy" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
