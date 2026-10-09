import React from "react";
import {useLanguage} from "../context/LanguageContext";
import {focusPageElement} from "../utils/focus";
import { Globe, Terminal, Webhook, Code2 } from "lucide-react";

const codeStyle:React.CSSProperties={background:"var(--bg-tertiary)",padding:"1rem",borderRadius:"var(--radius-md)",fontSize:"0.8rem",overflowX:"auto",lineHeight:1.6,maxWidth:"100%"};
export const DeveloperDocs:React.FC=()=> {
 const {language}=useLanguage(),text=(vi:string,en:string)=>language==="en"?en:vi;
 const topics=[["docs-network",text("Arc Testnet","Arc Testnet")],["docs-api",text("Public API","Public API")],["docs-webhook",text("Webhook & retry","Webhooks & retries")],["docs-delivery",text("SDK giao hàng","Delivery SDK")]];
 return (
  <article className="app-page developer-docs" aria-labelledby="integration-title">
    <p className="eyebrow">{text("Tài liệu & tích hợp","Docs & integrations")}</p><h1 id="integration-title">{text("Tích hợp với GroupDeal","Integrate with GroupDeal")}</h1>
    <p style={{color:"var(--text-secondary)"}}>Public API, giao hàng có receipt và webhook có inbox bền vững. SDK v2 là bản candidate trong repository; chưa phát hành lên registry.</p>
    <nav className="docs-topics" aria-label={text("Các mục tài liệu","Documentation topics")}>{topics.map(([id,label])=><button className="btn btn-secondary" key={id} onClick={()=>focusPageElement(document.getElementById(id))}>{label}</button>)}</nav>
    <section id="docs-network" tabIndex={-1} className="glass-card" style={{marginBlock:"1.5rem"}}>
      <h2><Globe size={20} aria-hidden="true"/> Arc Testnet</h2>
      <p>Chain ID <code>5042002</code>. Giá và số tiền của protocol dùng USDC ERC-20, 6 decimals; API trả số nguyên dạng chuỗi. Số dư native dùng trả gas không cộng thêm vào số dư ERC-20.</p>
      <p style={{overflowWrap:"anywhere"}}>USDC: <code>0x3600000000000000000000000000000000000000</code></p>
    </section>
    <section id="docs-api" tabIndex={-1} className="glass-card" style={{marginBlock:"1.5rem"}}>
      <h2><Terminal size={20} aria-hidden="true"/> Public Read API</h2>
      <p>Danh sách chỉ gồm deal public đã gắn deployment. Deal unlisted có thể truy cập bằng ID được chia sẻ. Giá/trạng thái là projection của indexer; quyết định tài chính cần kiểm chứng chain tại cùng block.</p>
      <pre style={codeStyle}>{`GET /api/v1/catalog?limit=12&sort=newest&q=studio&category=Software
GET /api/v1/campaigns?limit=20&sort=newest
GET /api/v1/campaigns/:internalCampaignId
GET /api/v1/campaigns/:internalCampaignId/widget-data
GET /api/v1/campaigns/:internalCampaignId/widget?lang=vi
GET /api/v1/sellers/:sellerId
GET /api/v1/sellers/:sellerId/campaigns?limit=12&sort=newest`}</pre>
      <p>List có limit 1–100 (mặc định 20), cursor theo chain startTime/ID và filter status/metric. Cursor ghim deployment và bộ lọc; dùng nextCursor cho trang tiếp theo. API đọc public có budget 120 request/phút theo peer/IP mỗi process; HTTP 429 trả Retry-After. Lỗi có code VALIDATION, NOT_FOUND hoặc SERVICE_UNAVAILABLE.</p>
      <p><code>sdk.getCatalog</code> có thêm q/category, tìm trong tên, mô tả, sản phẩm, vendor và edition công khai; không phân biệt hoa/thường, chuẩn hóa NFKC khi so khớp. Cursor ghim cả hai bộ lọc. Category facet chỉ gồm deal public của deployment hiện tại. Tổng số liệu gồm mọi trang phù hợp; totalGrossCommitted là cam kết tích lũy từ indexer, không phải doanh thu hoặc số dư escrow hiện tại. openCampaignCount áp dụng cùng điều kiện thời gian, tồn kho, terms và rights như widget.</p>
      <p>Response gồm <code>version</code>, <code>chainId</code>, <code>amountEncoding</code>, product/license công khai và quyền phân phối đã duyệt. <code>campaignUrl</code> lấy từ PUBLIC_APP_URL; trả null khi origin chưa cấu hình.</p>
      <p>Hồ sơ seller chỉ mở khi có deal PUBLIC khả dụng trên deployment hiện tại. Metric chỉ đếm các deal đó và sản phẩm khác nhau; không có số doanh thu, người theo dõi hoặc rating giả. ACCOUNT_CREDENTIAL_LINKED chỉ xác nhận ví payout của hồ sơ thuộc tài khoản; mỗi deal giữ ví payout đã ghim riêng. Quyền phân phối xem theo từng sản phẩm/deal. Cursor của danh sách seller ghim thêm seller ID, không dùng thay cursor của seller khác hoặc danh sách chung.</p>
    </section>
    <section id="docs-webhook" tabIndex={-1} className="glass-card" style={{marginBlock:"1.5rem"}}>
      <h2><Webhook size={20} aria-hidden="true"/> Nhận webhook và xử lý retry</h2>
      <p>Kiểm HMAC trên raw body và timestamp strict trong 300 giây. Cửa sổ thời gian vẫn cho phép nhận trùng: phải lưu toàn bộ event vào inbox với khóa duy nhất (subscription ID, event ID) trước khi trả HTTP 202. Retry và DLQ redrive giữ nguyên event ID.</p>
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
      <p>Ví dụ Node.js/SQLite chạy được nằm trong <code>sdk/examples/receiver.cjs</code>. Endpoint trên Arc dùng HTTPS/443, chỉ DNS public và không follow redirect. Webhook xác thực sự kiện; quyền tải tài nguyên cần luồng giao hàng riêng.</p>
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
      <h2><Code2 size={20} aria-hidden="true"/> Giao hàng qua SDK</h2>
      <p>Người bán dùng session của mình. Ví ký transaction đã chuẩn bị; SDK không giữ khóa ví. Khi mạng lỗi sau broadcast, phục hồi intent bằng cùng operation và txHash.</p>
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
      <p>Nếu giao dịch cũ đã revert hoặc nonce đã được giao dịch khác sử dụng, thử lại qua <code>retryDelivery</code>. Server kiểm lại receipt canonical và khả năng giao hàng trên chain, giữ nguyên tài nguyên, license và grant đã chuẩn bị. Không dùng lỗi ví, callback hoặc hash bị mất làm bằng chứng cho phép ký lại.</p>
      <pre style={codeStyle}>{`const retry = await sdk.retryDelivery(
  sellerSession, previousOperationId, immutableDeliveryRetryKey
);
// This prepares a new intent and does not broadcast.
// Keep the same retry key if the API response is lost.
const readyRetry = await sdk.readyOperation(sellerSession, retry.operation.id);
// Seller explicitly confirms and signs readyRetry.operation.
// Save its hash, then submit and finish this new operation.`}</pre>
      <p>Buyer chỉ nhận grant sau receipt và projection hợp lệ; quyền tải được kiểm tại redeem/download. RPC không xác minh được hoặc order không còn đủ điều kiện thì giữ reservation để phục hồi, không tự phát key khác hay thu hồi quyền order cũ.</p>
      <p>Giao hàng manual/provider dùng <code>fulfillOrder(session, orderId, content, txHash)</code> với receipt recordDelivery khớp proof và principal. Callback thành công chưa chứng minh entitlement đã giao.</p>
      <p><code>sdk.getWidgetData(id)</code> đọc JSON public; <code>/widget?lang=vi</code> hoặc <code>en</code> trả trang HTML chỉ đọc để nhúng iframe. Lấy mã nhúng trong hộp chia sẻ deal. Giá là mỗi đơn vị trước rebate, lấy từ indexer; deal đã chốt dùng giá chốt, deal bị giữ/kết thúc không hứa giá bậc tiếp theo.</p>
      <p>Widget tải lại khi hiển thị mỗi 45 giây và có nút tải lại. Nếu không xác nhận được dữ liệu hoặc deal đổi sang private, card/link cũ bị ẩn. Link unlisted vẫn xem được bởi người có link; ảnh và bản sao đã xuất không tự thu hồi. Response không cache, không đăng nhập hoặc tạo giao dịch.</p>
      <p>PUBLIC_APP_URL cần là origin HTTPS chính thức, với reverse proxy <code>/api/v1</code> trỏ về backend. CSP cho phép nhúng chỉ tại route widget, dùng nonce cho script/style và chỉ fetch JSON cùng origin; giữ frame policy chặt cho ứng dụng có đăng nhập. Khả năng này mới được kiểm tra local, chưa phải bằng chứng triển khai live.</p>
    </section>
  </article>
);
};
