import React from "react";
import { Code2, Globe, Shield, Terminal, Webhook, Cpu } from "lucide-react";

export const DeveloperDocs: React.FC = () => {
  return (
    <div style={{ maxWidth: "860px", margin: "0 auto" }}>
      <div style={{ marginBottom: "2.5rem" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Tài liệu Kỹ thuật & Tích hợp SDK</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>
          Hướng dẫn tích hợp GroupDeal trên mạng <strong>Arc Testnet (Circle Layer-1)</strong>, tài liệu Public Read API, xác thực chữ ký Webhook HMAC-SHA256 và nhúng Widget chỉ đọc.
        </p>
      </div>

      {/* 1. Network Parameters */}
      <div className="glass-card" style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Globe size={18} color="var(--cyan)" />
          1. Thông số Mạng Arc Testnet
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.88rem" }}>
          <div>
            <strong>Chain Name:</strong> Arc Testnet
          </div>
          <div>
            <strong>Chain ID:</strong> <code className="font-mono">5042002</code>
          </div>
          <div>
            <strong>RPC URL:</strong> <code className="font-mono">https://rpc.testnet.arc.io</code>
          </div>
          <div>
            <strong>Native Currency & Gas:</strong> USDC (18-decimal native view; cùng nguồn giá trị với ERC-20 USDC 6 decimals, không cộng đôi)
          </div>
          <div>
            <strong>Block Explorer:</strong>{" "}
            <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" style={{ color: "var(--cyan)" }}>
              https://testnet.arcscan.app
            </a>
          </div>
          <div>
            <strong>System USDC ERC-20 Address:</strong>{" "}
            <code className="font-mono" style={{ fontSize: "0.75rem" }}>0x3600000000000000000000000000000000000000</code>
          </div>
        </div>
      </div>

      {/* 2. Public Read API */}
      <div className="glass-card" style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Terminal size={18} color="var(--primary-light)" />
          2. Public Read REST API
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>
          Các bên thứ ba hoặc nền tảng đối tác có thể truy vấn dữ liệu chiến dịch thời gian thực mà không cần quyền quản trị:
        </p>

        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--cyan)", marginBottom: "0.25rem" }}>
            GET /api/v1/campaigns
          </div>
          <pre
            className="font-mono"
            style={{
              background: "rgba(0,0,0,0.4)",
              padding: "0.85rem",
              borderRadius: "var(--radius-md)",
              fontSize: "0.8rem",
              overflowX: "auto",
            }}
          >
{`curl -X GET "http://localhost:4000/api/v1/campaigns"`}
          </pre>
        </div>

        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--cyan)", marginBottom: "0.25rem" }}>
            GET /api/v1/campaigns/:id
          </div>
          <pre
            className="font-mono"
            style={{
              background: "rgba(0,0,0,0.4)",
              padding: "0.85rem",
              borderRadius: "var(--radius-md)",
              fontSize: "0.8rem",
              overflowX: "auto",
            }}
          >
{`curl -X GET "http://localhost:4000/api/v1/campaigns/1"`}
          </pre>
        </div>
      </div>

      {/* 3. Signed Webhook HMAC Verification */}
      <div className="glass-card" style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Webhook size={18} color="var(--warning)" />
          3. Xác thực Chữ ký Webhook HMAC-SHA256 (Node.js / TypeScript)
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>
          Mọi webhook gửi tới người bán đều kèm theo <code>X-GroupDeal-Signature</code> và <code>X-GroupDeal-Timestamp</code>. Người bán phải kiểm tra chữ ký và cửa sổ thời gian (300 giây) để chống tấn công replay.
        </p>

        <pre
          className="font-mono"
          style={{
            background: "rgba(0,0,0,0.4)",
            padding: "1rem",
            borderRadius: "var(--radius-md)",
            fontSize: "0.8rem",
            overflowX: "auto",
            lineHeight: 1.5,
          }}
        >
{`import crypto from "crypto";

function verifyGroupDealWebhook(rawBody, signatureHeader, timestampHeader, secret) {
  const timestamp = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);
  
  // 1. Kiểm tra chống Replay Attack (cửa sổ 5 phút)
  if (Math.abs(now - timestamp) > 300) {
    return false;
  }

  // 2. Tính toán HMAC-SHA256
  const payload = \`\${timestamp}.\${rawBody}\`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const providedSig = signatureHeader.replace(/^sha256=/, "");
  return crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(providedSig));
}`}
        </pre>
      </div>

      {/* 4. Embeddable Widget */}
      <div className="glass-card">
        <h3 style={{ fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Code2 size={18} color="var(--success)" />
          4. Nhúng Widget Chỉ Đọc (Read-only Embed Widget)
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>
          Người bán có thể sao chép đoạn mã Iframe sau để hiển thị widget động theo thời gian thực trên Shopify, WordPress hoặc trang landing page riêng:
        </p>
        <pre
          className="font-mono"
          style={{
            background: "rgba(0,0,0,0.4)",
            padding: "1rem",
            borderRadius: "var(--radius-md)",
            fontSize: "0.8rem",
            overflowX: "auto",
          }}
        >
{`<iframe
  src="http://localhost:4000/api/v1/campaigns/1/widget-data"
  width="380"
  height="220"
  frameborder="0"
  style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);"
></iframe>`}
        </pre>
      </div>
    </div>
  );
};
