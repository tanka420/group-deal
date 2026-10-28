import {ARC_EXPLORER,ARC_CHAIN_NAME,ARC_CHAIN_ID} from '../../../shared/network.mjs';
import React from "react";
import {useLanguage} from "../context/LanguageContext";
import {focusPageElement} from "../utils/focus";
import { Globe, Terminal, Webhook, Code2 } from "lucide-react";

const codeStyle:React.CSSProperties={background:"var(--bg-tertiary)",padding:"1rem",borderRadius:"var(--radius-md)",fontSize:"0.8rem",overflowX:"auto",lineHeight:1.6,maxWidth:"100%"};
export const DeveloperDocs:React.FC=()=> {
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==="en"?en:vi;
 const topics=[["docs-network",text(`${ARC_CHAIN_NAME}`,`${ARC_CHAIN_NAME}`)],["docs-api",text("Public API","Public API")],["docs-webhook",text("Webhook & retry","Webhooks & retries")],["docs-delivery",text("SDK giao hàng","Delivery SDK")]];
 return (
  <article className="app-page developer-docs" aria-labelledby="integration-title">
    <p className="eyebrow">{text("Tài liệu & tích hợp","Docs & integrations")}</p><h1 id="integration-title">{text("Tích hợp với GroupDeal","Integrate with GroupDeal")}</h1>
    <p style={{color:"var(--text-secondary)"}}>{language==='en'?<>Public APIs, receipt-based delivery and webhooks with a durable inbox. SDK v2 is a repository candidate and has not been published to a registry.</>:<>Public API, giao hàng có receipt và webhook có inbox bền vững. SDK v2 là bản candidate trong repository; chưa phát hành lên registry.</>}</p>
    <nav className="docs-topics" aria-label={text("Các mục tài liệu","Documentation topics")}>{topics.map(([id,label])=><button className="btn btn-secondary" key={id} onClick={()=>focusPageElement(document.getElementById(id))}>{label}</button>)}</nav>
    <section id="docs-network" tabIndex={-1} className="glass-card" style={{marginBlock:"1.5rem"}}>
      <h2><Globe size={20} aria-hidden="true"/> {ARC_CHAIN_NAME}</h2>
      <p>{language==='en'?<>Chain ID {ARC_CHAIN_ID}. Protocol prices and amounts use USDC ERC-20 with 6 decimals; the API returns integer strings. Native gas balance is separate from the ERC-20 balance.</>:<>Chain ID <code>{ARC_CHAIN_ID}</code>. Giá và số tiền của protocol dùng USDC ERC-20, 6 decimals; API trả số nguyên dạng chuỗi. Số dư native dùng trả gas không cộng thêm vào số dư ERC-20.</>}</p>
      <p style={{overflowWrap:"anywhere"}}>USDC: <code>0x3600000000000000000000000000000000000000</code></p>
    </section>
    <section id="docs-api" tabIndex={-1} className="glass-card" style={{marginBlock:"1.5rem"}}>
      <h2><Terminal size={20} aria-hidden="true"/> Public Read API</h2>
      <p>{language==='en'?<>Lists include public deals linked to the deployment. An unlisted deal is accessible through its shared ID. Prices and status are indexer projections; financial decisions require chain verification at the same block.</>:<>Danh sách chỉ gồm deal public đã gắn deployment. Deal unlisted có thể truy cập bằng ID được chia sẻ. Giá/trạng thái là projection của indexer; quyết định tài chính cần kiểm chứng chain tại cùng block.</>}</p>
      <pre style={codeStyle}>{`GET /api/v1/catalog?limit=12&sort=newest&q=studio&category=Software
GET /api/v1/campaigns?limit=20&sort=newest
GET /api/v1/campaigns/:internalCampaignId
GET /api/v1/campaigns/:internalCampaignId/widget-data
GET /api/v1/campaigns/:internalCampaignId/widget?lang=vi
GET /api/v1/sellers/:sellerId
GET /api/v1/sellers/:sellerId/campaigns?limit=12&sort=newest`}</pre>
      <p>{language==='en'?<>Lists accept a limit of 1–100 (default 20), a cursor based on chain startTime/ID, and status/metric filters. Cursors bind the deployment and filters; use nextCursor for the following page. Public reads have a budget of 120 requests per minute per peer/IP per process; HTTP 429 includes Retry-After. Error codes include VALIDATION, NOT_FOUND and SERVICE_UNAVAILABLE.</>:<>List có limit 1–100 (mặc định 20), cursor theo chain startTime/ID và filter status/metric. Cursor ghim deployment và bộ lọc; dùng nextCursor cho trang tiếp theo. API đọc public có budget 120 request/phút theo peer/IP mỗi process; HTTP 429 trả Retry-After. Lỗi có code VALIDATION, NOT_FOUND hoặc SERVICE_UNAVAILABLE.</>}</p>
      <p>{language==='en'?<>sdk.getCatalog also accepts q/category and searches public titles, descriptions, products, vendors and editions using case-insensitive NFKC normalization. Its cursor binds both filters. Category facets include only public deals in the current deployment. Totals include every matching page; totalGrossCommitted is cumulative indexed commitments, not revenue or the current escrow balance. openCampaignCount uses the same time, inventory, terms and rights conditions as the widget.</>:<><code>sdk.getCatalog</code> có thêm q/category, tìm trong tên, mô tả, sản phẩm, vendor và edition công khai; không phân biệt hoa/thường, chuẩn hóa NFKC khi so khớp. Cursor ghim cả hai bộ lọc. Category facet chỉ gồm deal public của deployment hiện tại. Tổng số liệu gồm mọi trang phù hợp; totalGrossCommitted là cam kết tích lũy từ indexer, không phải doanh thu hoặc số dư escrow hiện tại. openCampaignCount áp dụng cùng điều kiện thời gian, tồn kho, terms và rights như widget.</>}</p>
      <p>{language==='en'?<>Responses include version, chainId, amountEncoding, public product/license details and approved distribution rights. campaignUrl uses PUBLIC_APP_URL and is null when the origin is not configured.</>:<>Response gồm <code>version</code>, <code>chainId</code>, <code>amountEncoding</code>, product/license công khai và quyền phân phối đã duyệt. <code>campaignUrl</code> lấy từ PUBLIC_APP_URL; trả null khi origin chưa cấu hình.</>}</p>
      <p>{language==='en'?<>A seller profile is public only when it has an available PUBLIC deal in the current deployment. Metrics count those deals and distinct products; no revenue, follower or rating figures are fabricated. ACCOUNT_CREDENTIAL_LINKED only confirms that the profile payout wallet belongs to the account; each deal retains its own pinned payout wallet. Check distribution rights per product/deal. Seller-list cursors also bind the seller ID and cannot be reused for another seller or the general catalog.</>:<>Hồ sơ seller chỉ mở khi có deal PUBLIC khả dụng trên deployment hiện tại. Metric chỉ đếm các deal đó và sản phẩm khác nhau; không có số doanh thu, người theo dõi hoặc rating giả. ACCOUNT_CREDENTIAL_LINKED chỉ xác nhận ví payout của hồ sơ thuộc tài khoản; mỗi deal giữ ví payout đã ghim riêng. Quyền phân phối xem theo từng sản phẩm/deal. Cursor của danh sách seller ghim thêm seller ID, không dùng thay cursor của seller khác hoặc danh sách chung.</>}</p>
    </section>
    <section id="docs-webhook" tabIndex={-1} className="glass-card" style={{marginBlock:"1.5rem"}}>
      <h2><Webhook size={20} aria-hidden="true"/> {text("Nhận webhook và xử lý retry","Receiving webhooks and handling retries")}</h2>
      <p>{language==='en'?<>Verify the HMAC over the raw body and enforce a strict 300-second timestamp window. Events can still be duplicated within that window: persist the complete event in a durable inbox with a unique (subscription ID, event ID) key before returning HTTP 202. Retries and DLQ redrives retain the event ID.</>:<>Kiểm HMAC trên raw body và timestamp strict trong 300 giây. Cửa sổ thời gian vẫn cho phép nhận trùng: phải lưu toàn bộ event vào inbox với khóa duy nhất (subscription ID, event ID) trước khi trả HTTP 202. Retry và DLQ redrive giữ nguyên event ID.</>}</p>
      <pre style={codeStyle}>{`const sdk = new GroupDealSDK({
  baseUrl: configuredApiOrigin,
  webhookSecret: configuredWebhookSecret,
  webhookSubscriptionId: configuredSubscriptionId
});
const result = await sdk.receiveWebhook(rawBody, {
  signature: req.headers['x-groupdeal-signature'],
  timestamp: req.headers['x-groupdeal-timestamp'],
  eventId: req.headers['x-groupdeal-event-id'],
  event: req.headers['x-groupdeal-event']
}, durableInbox);
// durableInbox.persist() atomically inserts the full event.
// Duplicate => acknowledge; storage unavailable => retry (503).
// Process the inbox separately with idempotent business effects.`}</pre>
      <p>{language==='en'?<>A runnable Node.js/SQLite example is in sdk/examples/receiver.cjs. Arc endpoints require HTTPS/443, public DNS and no redirects. Webhooks authenticate events; resource access requires the separate delivery flow.</>:<>Ví dụ Node.js/SQLite chạy được nằm trong <code>sdk/examples/receiver.cjs</code>. Endpoint trên Arc dùng HTTPS/443, chỉ DNS public và không follow redirect. Webhook xác thực sự kiện; quyền tải tài nguyên cần luồng giao hàng riêng.</>}</p>
      <h3>{text('Mở sự kiện mới sau phục hồi','Enable new events after recovery')}</h3>
      <p>{text('Seller đăng nhập mới rồi vào Webhook, chuẩn bị lượt rà soát và chọn xác minh endpoint đã lưu. Receiver phải có đúng subscription ID và secret hiện có; không đưa secret vào yêu cầu rà soát. HTTP 200 chỉ được chấp nhận cùng chữ ký phản hồi hợp lệ. Job lịch sử và job trước xác minh vẫn được giữ để rà soát riêng.','Sign in again as the seller, open Webhooks, prepare a review, then verify the saved endpoint. The receiver must have the existing subscription ID and secret; do not include the secret in the review request. HTTP 200 requires a valid signed response. Historical jobs and jobs before verification remain held for separate review.')}</p>
      <pre style={codeStyle}>{`// Receiver: branch before receiveWebhook / durableInbox.
if (headers.event === 'subscription.review') {
  const answer = sdk.answerWebhookRecoveryChallenge(rawBody, headers);
  // Reply HTTP 200 with JSON answer, or HTTP 401 if null.
  // Do not insert a challenge into the order-event inbox.
}
// Seller integration: preserve the same UUID if preparation ACK is lost.
const { review } = await sdk.prepareWebhookRecoveryReview(sellerSession, commandUuid);
await sdk.verifyWebhookRecoveryReview(sellerSession, review.id);
const state = await sdk.getWebhookRecoveryReview(sellerSession, review.id);
// Only state.enabledForNewEvents proves approval for new jobs.
// Config, recovery context or deployment changes require a new review.`}</pre>
    </section>
    <section id="docs-delivery" tabIndex={-1} className="glass-card" style={{marginBlock:"1.5rem"}}>
      <h2><Code2 size={20} aria-hidden="true"/> {text("Giao hàng qua SDK","Delivery through the SDK")}</h2>
      <p>{language==='en'?<>Sellers use their own session. The wallet signs the prepared transaction; the SDK does not hold wallet keys. After a network failure following broadcast, recover the intent using the same operation and txHash.</>:<>Người bán dùng session của mình. Ví ký transaction đã chuẩn bị; SDK không giữ khóa ví. Khi mạng lỗi sau broadcast, phục hồi intent bằng cùng operation và txHash.</>}</p>
      <pre style={codeStyle}>{`const { operation } = await sdk.prepareDelivery(
  sellerSession, internalOrderId, immutableRetryKey
);
const ready = await sdk.readyOperation(sellerSession, operation.id);
// Seller wallet broadcasts operation.calldata to operation.hubAddress.
await sdk.submitOperation(sellerSession, operation.id, txHash);
const finished = await sdk.finishDelivery(sellerSession, operation.id, txHash);
// Only finished.operation.phase === 'PROJECTED' completes delivery.
// Retry after an unknown receipt:
await sdk.recoverOperation(sellerSession, operation.id, txHash);`}</pre>
      <p>{language==='en'?<>If the previous transaction reverted or another transaction consumed its nonce, use retryDelivery. The server rechecks the canonical receipt and onchain delivery eligibility, retaining the prepared resources, license and grant. Wallet errors, callbacks or a missing hash do not prove that signing again is permitted.</>:<>Nếu giao dịch cũ đã revert hoặc nonce đã được giao dịch khác sử dụng, thử lại qua <code>retryDelivery</code>. Server kiểm lại receipt canonical và khả năng giao hàng trên chain, giữ nguyên tài nguyên, license và grant đã chuẩn bị. Không dùng lỗi ví, callback hoặc hash bị mất làm bằng chứng cho phép ký lại.</>}</p>
      <pre style={codeStyle}>{`const retry = await sdk.retryDelivery(
  sellerSession, previousOperationId, immutableDeliveryRetryKey
);
// This prepares a new intent and does not broadcast.
// Keep the same retry key if the API response is lost.
const readyRetry = await sdk.readyOperation(sellerSession, retry.operation.id);
// Seller explicitly confirms and signs readyRetry.operation.
// Save its hash, then submit and finish this new operation.`}</pre>
      <p>{language==='en'?<>Buyers receive a grant only after a valid receipt and projection; redeem/download checks resource access. If RPC verification is unavailable or the order is no longer eligible, retain the reservation for recovery without automatically issuing another key or revoking an existing order entitlement.</>:<>Buyer chỉ nhận grant sau receipt và projection hợp lệ; quyền tải được kiểm tại redeem/download. RPC không xác minh được hoặc order không còn đủ điều kiện thì giữ reservation để phục hồi, không tự phát key khác hay thu hồi quyền order cũ.</>}</p>
      <p>{language==='en'?<>Manual/provider delivery uses fulfillOrder(session, orderId, content, txHash) with a recordDelivery receipt matching the proof and principal. A successful callback does not prove that an entitlement was delivered.</>:<>Giao hàng manual/provider dùng <code>fulfillOrder(session, orderId, content, txHash)</code> với receipt recordDelivery khớp proof và principal. Callback thành công chưa chứng minh entitlement đã giao.</>}</p>
      <p>{language==='en'?<>sdk.getWidgetData(id) reads public JSON; /widget?lang=vi or en returns a read-only HTML page for an iframe. Copy the embed code from the deal sharing dialog. Prices are per unit before rebate and come from the indexer; finalized deals use the clearing price. Held or ended deals do not promise the next tier price.</>:<><code>sdk.getWidgetData(id)</code> đọc JSON public; <code>/widget?lang=vi</code> hoặc <code>en</code> trả trang HTML chỉ đọc để nhúng iframe. Lấy mã nhúng trong hộp chia sẻ deal. Giá là mỗi đơn vị trước rebate, lấy từ indexer; deal đã chốt dùng giá chốt, deal bị giữ/kết thúc không hứa giá bậc tiếp theo.</>}</p>
      <p>{language==='en'?<>Visible widgets refresh every 45 seconds and include a refresh button. If data cannot be confirmed or a deal becomes private, the old card and link are hidden. Anyone with an unlisted link can still view it; exported images and copies cannot be recalled automatically. Responses are not cached and do not authenticate or create transactions.</>:<>Widget tải lại khi hiển thị mỗi 45 giây và có nút tải lại. Nếu không xác nhận được dữ liệu hoặc deal đổi sang private, card/link cũ bị ẩn. Link unlisted vẫn xem được bởi người có link; ảnh và bản sao đã xuất không tự thu hồi. Response không cache, không đăng nhập hoặc tạo giao dịch.</>}</p>
      <p>{language==='en'?<>PUBLIC_APP_URL must be the official HTTPS origin, with /api/v1 reverse-proxied to the backend. CSP allows embedding only on the widget route, uses nonces for scripts/styles and fetches JSON only from the same origin. Keep the authenticated application frame policy strict. Local checks of this capability do not establish live deployment acceptance.</>:<>PUBLIC_APP_URL cần là origin HTTPS chính thức, với reverse proxy <code>/api/v1</code> trỏ về backend. CSP cho phép nhúng chỉ tại route widget, dùng nonce cho script/style và chỉ fetch JSON cùng origin; giữ frame policy chặt cho ứng dụng có đăng nhập. Khả năng này mới được kiểm tra local, chưa phải bằng chứng triển khai live.</>}</p>
    </section>
  </article>
);
};
