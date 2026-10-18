# Giao hàng nhiều đơn vị: đối chiếu bằng chứng hiện có — 18/10/2026

Đã xác minh lại receipt giao đơn1 bằng10 public RPC chỉ đọc, tại finalized 67777571 (0x4e63270bedb365027fac2d490f82a4e5e4e461076938031efbf3b54061637801). Receipt 0x67995c72cd80a2bd9e486260de349cb401b149a2e29fb3ad7aa84245393191fd, block 66445153, nonce1: recordDelivery/campaign1/order1/proofHash/principal/value0/event và canonical block khớp bản gốc. Order tại receipt block DELIVERED, quantity2; timestamp/proof giữ nguyên trên current chain và native hiện CONFIRMED. Operation cũ vẫn PROJECTED. Không gửi lại giao dịch.

14 kiểm native và14 kiểm chain đạt. Hai grant có unitIndex0/1, ACTIVE, buyer/snapshot/resource binding khớp, hai key ID khác nhau vẫn ASSIGNED đúng order/operation/resource/seller; activatedAt bằng deliveryTimestamp. Hai redeemedAt khớp bằng chứng buyer thật ngày10/10. Resource metadata vẫn6825byte/hash 57bd74a84d9f39872ff722cfeafcbf9296c78177c539e7ba1e2373fe930e9686. Không đọc hoặc giải mã key/ciphertext/resource bytes để kiểm lại nội dung trong gói này.

Proof seller thật ngày10/10 và hai response ZIP200 từ UI buyer authenticated được kiểm hash và kế thừa đúng timestamp. Chưa tái chạy authenticated download trên bundle hiện hành; lịch sử không xác nhận tệp đã lưu vào Downloads của Chrome. Không tải lại tài nguyên hoặc replay redeem để thay bằng chứng cũ.

Mapping G5-07 trước đây ghi chung nhiều đơn vị còn thiếu, trong khi đã có đơn1 LICENSE_KEY quantity2 và hai response thật. Hồ sơ mới ghi đúng nhánh đã quan sát. Metadata hiện tại: campaign1/order1 quantity2 CONFIRMED có2 active/2 redeemed; campaign2/order2 quantity2 RESOLVED có2 active/0 redeemed; campaign3/order3 quantity2 BREACHED_REFUNDED không grant; campaign4/orders4/5 quantity1 CONFIRMED mỗi đơn1 active/1 redeemed. Đây là coverage metadata, không là receipt/reconciliation mọi đơn.

Cả4 campaign/5đơn đều LICENSE_KEY. ZIP tải qua license không chứng minh phương thức FILE_LINK. FILE_LINK, ACCOUNT_INVITE/provider activation và WEBHOOK/receiver thật vẫn thiếu execution; shortage/race/retry/wrong-principal/outage/current UI và recovery cần proof riêng. Không suy guard test/inventory/source thành live acceptance.

VPS writer backend30fea223380affc471cc91f4ab2390814ddaa87c, PID97197/NRestarts0,377runtime khớp trước đọc; SQLite read-only/BEGIN select các trường cho phép, before-after metadata ổn định,95held giữ. Public181/backup/privateRestore/BACKUP_CURRENT/timer và Safe được kế thừa từ gói reports/evidence/safe-control-readiness/2026-10-18T03-39-47-536Z/CHECKS.json theo timestamp03:38/03:35 UTC, không gọi là đã kiểm mới trong gói này. Ledger/email cũng giữ timestamp riêng. Không source/deploy/fulltest/CI, app local/DB snapshot, provider request, email hoặc ký/broadcast.

Người dùng đã trả lời “Tôi sẽ cung cấp chữ ký và xác nhận custody”; hiện chưa nhận chữ ký hoặc attestation, chưa xác minh custody. Giữ gói Safe gốc; không gia hạn tự động hoặc dùng sau hết hạn. Circle/admin live tiếp tục hoãn; username/social POST-V1. Offhost/RPO/RTO và các branch G5 khác còn mở. NOT_FROZEN;G5/G6 OPEN;acceptanceEligible=false.

Proof: reports/evidence/delivery-branches-readonly/2026-10-18T03-42-11-407Z/CHECKS.json
SHA256: 9b48a7083ccd338d73540deec96ec58058e388a777dd07a81d7abd3bff8be9cf
