# GroupDeal prompt khởi tạo dự án mới

Dùng nội dung bên dưới để giao việc cho đội phát triển hoặc coding agent. Gửi kèm README và toàn bộ 9 phần đặc tả nhóm 01, 02, 03 theo [mục lục](./README.md), tổng cộng 11 file gồm prompt này. Đặt chúng trong repository mới và giữ làm đặc tả có version. Chờ nhận đủ bộ trước khi triển khai.

## Nội dung giao việc

Hãy xây dựng GroupDeal từ đầu bằng một codebase mới, theo bộ đặc tả đính kèm. Mục tiêu là sản phẩm web mua chung sản phẩm số hoàn chỉnh, vận hành và nghiệm thu trên Arc Testnet với USDC. Testnet là mạng của bản phát hành này; sản phẩm vẫn phải có các hành trình và tích hợp thật.

GroupDeal cho phép seller công bố các ngưỡng tham gia với giá giảm dần. Buyer chuyển USDC vào escrow khi cam kết, khóa giá hiện tại trước cập nhật metric và hưởng final price tốt nhất đã mở. Phần chênh lệch trở thành buyer allocation để rút; seller chỉ nhận phần được phân bổ sau delivery/confirm/timeout/dispute đúng quy tắc. Mỗi order nhận license/seat/quyền truy cập riêng đúng điều khoản sản phẩm.

Đọc toàn bộ đặc tả trước khi triển khai. Khởi tạo repository, database, manifests, deployment và hồ sơ nghiệm thu mới; không tiếp tục candidate/task packet/dữ liệu runtime/credentials của repository GroupDeal cũ. Có thể dùng tài liệu và source cũ làm tham khảo kỹ thuật nếu được cung cấp, nhưng phải hiện thực hóa và kiểm chứng theo mục tiêu bản mới.

### Phạm vi bắt buộc

1. Thị trường đầu tiên là Việt Nam; tiếng Việt là chính, luồng cốt lõi có tiếng Anh. Một account có thể là buyer và seller; operator và security có quyền riêng.
2. Buyer có email OTP, Circle User-Controlled EOA hoặc ví ngoài qua Reown, catalog/deal detail, quantity/terms/funding/gas, buy/pending/recovery, orders/library/entitlement, confirm/dispute/claim, support/review và account/security.
3. Seller có profile/payout proof, Product và license versions, rights review, delivery resources/adapters, drafts/wizard/preview/test/publish, PUBLIC/UNLISTED campaigns, orders/delivery/support/ledger/claim, share/QR/widget/webhook/SDK.
4. Operator có review/support/dispute workflows, evidence ACL, allocation trong quyền, reconciliation, health/queues/audit. Security Multisig xử lý emergency cancellation theo policy.
5. Campaign có 2–5 tiers, BUYER_COUNT hoặc UNITS_COUNT, account quantity cap, inventory tùy chọn, duration 24 giờ–30 ngày mặc định 7 ngày, SLA 24/48 giờ, early rebate mặc định tắt, fee ban đầu 0.
6. Sau first paid commit, khóa các điều khoản vật chất và payout. Tier không lùi; chưa đạt tier tiếp không tự coi thất bại. Ghim protocol và terms snapshot theo campaign/order.
7. Một account có một identity trong campaign; first paid commit ghim buyer principal nguyên tử. Ví khác cùng account không thay quyền. Account/contact/wallet recovery không chuyển claim. Active wallet binding được cưỡng chế bằng constraint/transaction.
8. Authorization mua bind chain/hub/campaign/terms/identity/principal/action/nonce/quantity/deadline và intent cap; contract chống replay. Tất cả tiền tính integer USDC 6 decimals. Native gas 18 decimals là biểu diễn của cùng tài sản, không cộng hai balance.
9. Delivery phải thực sự cấp quyền đúng order: license, protected file/link, account activation/invite và webhook/API adapter phù hợp. Secret ở offchain, có encryption/key versions/ACL; delivery job queued chưa phải đã giao.
10. Finalise rồi tính SLA; delivery onchain hợp lệ mở cửa sổ dispute 48 giờ. Breach/confirm/timeout/resolve làm allocation đúng contract. Operator chỉ chia phần đang tranh chấp giữa hai principal của order.
11. Buyer có đường dispute trực tiếp khi app/backend/evidence service dừng; embedded emergency capability do buyer kiểm soát, scope một order/thời hạn/nonce và không có quyền chuyển/rút/phân bổ tiền. Kiểm dependency provider thật.
12. Rebate/refund/seller proceeds là pull-claim, không hết hạn theo protocol. Dùng allocation và cumulative claimed amounts; rebate đã rút không khóa refund mới. Mỗi order luôn thỏa buyer allocation + seller gross allocation + unallocated = committed gross.
13. Contract là nguồn sự thật tài chính. API ghi intent/private data và verify receipt; journal/indexer/rebuild idempotent, scope deployment rõ; reconciliation per-order/per-campaign tại cùng block.
14. Có outbox email/in-app, signed webhook raw-body/timestamp/event ID/dedup/retry/DLQ, SDK packaged consumer, public DTO privacy, support attachments/reviews và seller metrics có định nghĩa.
15. Có CI, migrations, secret management, auth/ACL/audit/rate limits, strong auth cho thao tác nhạy cảm, health/alerts, load/batch bounds, backup/restore drill và runbook.

### Cách thực hiện

Đầu tiên lập decision log, architecture, state/capability matrix, data schemas, API/events và reference accounting model độc lập. Chốt các policy còn mở trước tính năng liên quan: buyer cancellation, early percentage/cap/rounding, delivery evidence authority, rights review, license/support/revocation, security topology và vận hành. Giữ defaults đã xác định; tiếp tục phần không phụ thuộc quyết định mở.

Stack tham chiếu là React/Vite/TypeScript, Node/TypeScript, Solidity, Circle/Reown và ethers hoặc viem. Pin versions đã kiểm tương thích và chọn database theo writer/HA thực tế. Kiểm tài liệu Arc/Circle/Reown hiện hành, probe chain/provider và khóa deployment manifest trước tích hợp.

Thiết kế ba khu vực buyer/seller/operator cùng brand. Dùng nền sáng xanh nhẹ, cards trắng, CTA xanh, media sản phẩm và price ladder/progress rail. Buyer nhìn rõ quyền sản phẩm, giá khóa, next tier, deadline và khoản có thể rút. Mobile, keyboard/focus, loading/empty/error/stale/recovery và i18n là phần nghiệm thu. Mọi CTA phải có behavior đúng quyền thật.

Làm theo lộ trình: nền và protocol → seller publish/buyer buy/delivery/claim xuyên suốt → các nhánh refund/dispute/fallback và tích hợp → vận hành/recovery → nghiệm thu Arc. Mock/fixtures phục vụ kiểm thử có nhãn; chúng không thay kết quả giao dịch/provider trên bản triển khai.

### Điều kiện hoàn tất

Chỉ gọi hoàn tất khi một seller tạo/publish và giao sản phẩm thật, buyer Circle và buyer external mua/nhận/claim qua ứng dụng trên Arc Testnet; rebate/refund/dispute/cancel/claim đúng principal và bảo toàn tiền; operator xử lý được các trường hợp trong quyền; outbox/webhook, reconciliation, monitoring, rebuild và restore hoạt động.

Kiểm unit, integration, E2E, property/fuzz cho tier/quantity/early/rounding/conservation và race. Kiểm timeout sau broadcast, revert/replaced, API/indexer race, provider outage, session/account/wallet changes, retry delivery, claim partial và recovery.

Hồ sơ nghiệm thu gắn một source/build/manifest/deployment, dùng principal độc lập, có receipt/event/block/balance và per-order reconciliation, buyer nhận entitlement, provider/webhook/email evidence, browser UX và review độc lập. Giao kèm fresh-checkout setup/deploy instructions, decision log, OpenAPI/ABI/SDK, test commands và runbook đã thử.

Mainnet, token khác, phí khác 0 và onramp cần quyết định/phát hành riêng. Không tự bật để mở rộng scope trong lúc xây bản đầu.
