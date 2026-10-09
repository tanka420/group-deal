# GroupDeal lộ trình ma trận yêu cầu và kiểm thử tài chính

Triển khai theo các giai đoạn có đầu ra kiểm chứng được. Giai đoạn đầu chốt semantics và nền kỹ thuật; sau đó chạy một hành trình xuyên suốt, mở đủ các nhánh sản phẩm và kiểm vận hành. Toàn dự án chỉ hoàn tất khi các chức năng bắt buộc trong [đặc tả sản phẩm](./01_SAN_PHAM_VA_NGHIEP_VU.md) chạy trên cùng bản triển khai và có bằng chứng phù hợp.

Thứ tự dưới đây là đề xuất cho dự án mới. Thời gian và nhân sự cần ước lượng sau khi chốt team, delivery providers, topology và tải nghiệm thu; không đặt deadline giả từ số lượng task.

[Mục lục](./README.md) · [Phần tiếp](./03B_KIEM_THU_VA_NGHIEM_THU.md)

## 1 Giai đoạn và phụ thuộc

| Giai đoạn | Công việc | Đầu ra để chuyển bước |
|---|---|---|
| 0 Chốt đặc tả | Đọc bộ bàn giao, lập scope/decision log, chốt metric/price/early/cancel/delivery authority, threat model, state/capability matrix; kiểm tài liệu/provider hiện hành | ADR và reference examples; owner cho quyết định mở; wireframe và sitemap; bản probe capability |
| 1 Khởi tạo nền | Repository mới, lockfile/runtime/compiler, CI, schemas, amount types, manifest, auth/session/wallet proof, database/migration/ACL, design tokens | Fresh checkout cài/build/test được; secret separation và fixture isolation; cấu hình môi trường mẫu |
| 2 Protocol và accounting | Contract mới, reference model độc lập, terms/principal/tier, finalise, rebate, delivery/breach/dispute/claim/cancel; event schema, bounds và batch | Unit/property/fuzz/invariant tests; ABI/events thống nhất; quyền từng actor được test |
| 3 Lát cắt xuyên suốt | Seller product/rights/delivery test/draft/publish → buyer OTP/ví/funding/buy → index/receipt → finalise → giao → confirm → buyer/seller claim | Chạy được qua UI/API và môi trường tích hợp; operation recovery, private entitlement và per-order reconciliation |
| 4 Hoàn thiện nghiệp vụ | Cả hai metric, limits/quantity/early, hai loại ví, bốn nhóm delivery, timeout/refund/dispute, fallback, support/review/profile/notifications/sharing/API/SDK | Traceability và E2E cho từng nhánh; mỗi CTA có backend/contract/provider behavior thật |
| 5 Hoàn thiện vận hành | Webhook/email retry/DLQ, metrics/alerts, migration, replay/rebuild, secret/key rotation, backup/restore drill, load/gas, responsive/a11y/i18n | Runbook đã diễn tập; test failure/recovery; evidence không lộ dữ liệu riêng tư |
| 6 Nghiệm thu Arc Testnet | Đóng source/build/manifest, deploy/verify, chạy đa principal qua UI/API/Circle/Reown/provider/chain; review độc lập | Hồ sơ nghiệm thu cùng release, không còn lỗi chặn và mọi yêu cầu bắt buộc có bằng chứng |

UI có thể thiết kế và dựng component trong giai đoạn 0–2 với fixture có nhãn đúng, nhưng data/capability contract phải chốt trước ghép hành động tài chính. Product/delivery và support có thể được xây cùng nền protocol theo dependency; schema/event thay đổi phải cập nhật các lớp bị tác động.

Lát cắt giai đoạn 3 giúp phát hiện sai ranh giới sớm; không thay checklist hoàn tất giai đoạn 4–6. Mainnet và mở rộng thanh toán là đợt phát hành sau với hồ sơ riêng.

## 2 Giao việc cho nhóm phát triển

| Nhóm trách nhiệm | Đầu ra chịu trách nhiệm |
|---|---|
| Chủ sản phẩm | Scope, policy decisions, license/delivery semantics, tiêu chuẩn rights review, ngôn ngữ UX và acceptance |
| Thiết kế/frontend | Sitemap, design system, buyer/seller/operator, wallet/funding/pending/recovery, responsive/a11y/i18n |
| Contract/accounting | Protocol, authority model, event schema, reference model, invariant/fuzz/gas và deployment verification |
| Backend/data | Auth/session/ACL, stable identities, transactions/constraints, operations, receipts, projection và reconciliation |
| Tích hợp | Circle/Reown/Bridge, delivery providers, SMTP, webhook/SDK, callback verification và retries |
| QA/vận hành | Traceability, test data/actors, CI, live evidence, observability, incident/recovery drill và review release |

Một người có thể phụ trách nhiều nhóm khi team nhỏ. Trong nghiệm thu quyền tài chính, actor/key và vai trò thử vẫn phải độc lập theo thiết kế; người rà soát cuối cần độc lập với người triển khai phần được kiểm.

Mỗi hạng mục có yêu cầu nguồn, đầu ra, dependencies, test/evidence và trạng thái. Dùng “Chưa bắt đầu → Đang làm → Chờ xác minh → Hoàn tất”; lỗi/vướng ghi điều kiện cụ thể. Chỉ đóng hạng mục khi chứng cứ áp dụng đúng source/deployment/version.

## 3 Ma trận truy vết yêu cầu

| Mã | Yêu cầu | Kiểm chứng bắt buộc |
|---|---|---|
| R01 | Khám phá và chi tiết sản phẩm | Catalog thật, filters/pagination, terms/license, metric/tier; privacy public/unlisted |
| R02 | Email OTP, Circle và ví ngoài | Login thật, subject được xác thực, wallet proof, không giữ khóa user; mua/claim cả hai loại ví |
| R03 | Account/identity/principal | Một account một count/campaign; atomic wallet binding; principal race; đổi/recovery không chuyển quyền |
| R04 | Seller/product/rights | Hồ sơ, payout proof, product/license version, identity/rights badges khác scope, evidence ACL |
| R05 | Campaign editor/publish | 2–5 tiers, hai metric, duration/limits/inventory/SLA, draft/version, delivery test, verified publication |
| R06 | Giá/early/limits | Giá trước update metric, final tier không lùi, quantity lũy kế, slot/stock race, cap/rounding và defaults |
| R07 | Checkout và operation | Commitment/gas đúng đơn vị, approval đúng, pending/revert/replaced, HTTP timeout/reload/cross-device, receipt/projection race |
| R08 | Delivery thật | License, file/link, invite/activation và webhook/API có adapter phù hợp; buyer nhận được; retry không cấp trùng |
| R09 | Confirm/SLA/dispute | Window đúng chain time, breach/timeout/refund, actor rights, evidence; operator partial/full resolution |
| R10 | Claim/conservation | Cumulative allocation/claimed; rebate trước/refund sau; rút đúng principal; no double pay; per-order/totals |
| R11 | Emergency và fallback | Security cancel phần unallocated; buyer dispute trực tiếp khi thành phần chính dừng; embedded scope có giới hạn |
| R12 | Hậu mãi và UX | Library/orders/profile, support/attachments/review/reply, inbox/email/preferences/follow/share/QR/widget |
| R13 | API/SDK/webhook | Schema/version/privacy/ACL; raw-body signature/dedup/retry/DLQ/SSRF; package consumer và receiver thật |
| R14 | Persistence và recovery | Constraints, concurrent writes, crash/restart, migrations, chain rebuild, offchain preservation, key/backup restore |
| R15 | Vận hành | Health/metrics/alert, fixed-block reconciliation, incident/rollback/restore runbook; tải/gas theo bounds đã chốt |
| R16 | Chất lượng giao diện | Vietnamese/English core, keyboard/dialog/focus, mobile/tablet/desktop, zoom, slow network/error states |
| R17 | Bản triển khai cuối | Source/build/manifest cố định, deploy verified, provider thật, đa principal, evidence và independent review |

Tiêu chí chi tiết có thể mở rộng nhưng không được xóa yêu cầu chỉ để một milestone xanh. Nếu một phương thức delivery chưa có provider phù hợp, ghi là chưa đạt nhánh đó và tiếp tục tích hợp; callback mock không thay provider delivery acceptance.

## 4 Bộ kiểm thử tài chính tối thiểu

Reference model phải được viết từ đặc tả, không import hàm tính rebate/allocation của implementation để làm expected result. Property/fuzz có seed, input bounds và cách tái hiện failure.

| Nhóm | Trường hợp phải kiểm |
|---|---|
| Validation | Tier count 1/2/5/6, threshold trùng/giảm, price trùng/âm/0, duration/SLA sai, inventory và account cap không hợp lệ |
| Metric | BUYER_COUNT khác UNITS_COUNT; một account mua nhiều order/units; nhiều ví không tăng count |
| Giá | Buyer thứ 20 trong ví dụ khóa tier trước tăng metric; multi-tier jump; final tier không lùi; gross cộng order |
| Early | Off fields bằng 0; fixed/BPS; percentage rounding; q>1 chỉ một unit; mua lại; last-slot race; require-slot revert |
| Inventory | Last-unit race, mua quantity lớn, tổng account cap, hết hàng finalise đúng |
| Identity/auth | Sai chain/hub/campaign/terms/address/action/nonce/quantity/deadline; replay; hai ví tranh principal; payment revert không ghim principal |
| Allocation | Base/early rebate, partial dispute, breach, confirm/timeout; tất cả không âm và sum đúng gross |
| Claim | Buyer/seller partial cumulative, claim lặp, rebate đã rút rồi refund mới, recipient cố định, transfer failure atomic |
| Hủy | Unallocated hoàn buyer, allocation đã chốt giữ nguyên, seller đã rút không bị thu hồi, batch retry không lặp |
| Bounds | Nhiều order, batch gas, finalise không loop toàn bộ buyer, integer giới hạn/làm tròn/overflow |

Kiểm conservation theo từng order và campaign sau mỗi transition. Với token/protocol có hành vi lỗi, transition phải revert hoặc giữ state hợp lệ; không tạo allocation mà không có escrow.

