# GroupDeal bảo mật vận hành và bài học kỹ thuật

Phần 4 của thiết kế kỹ thuật, gồm mục 11–13. Đọc cùng kiến trúc, contract/dữ liệu và workflow ở các phần 02, 02B, 02C. Chính sách vận hành chưa chốt cần được ghi thành quyết định trước nghiệm thu.

[Mục lục](./README.md) · [Phần trước](./02C_GIAO_DICH_VA_TICH_HOP.md)

## 11 Bảo mật dữ liệu và delivery

Entitlement/evidence/contact bí mật dùng mã hóa authenticated như AES-256-GCM với key ID/version, nonce đúng, ACL và audit truy cập nhạy cảm. Key theo mục đích, có rotation và recovery; không dùng cùng secret cho identity derivation, session, encryption và webhook.

Nếu backend giải mã được, sản phẩm phải mô tả là mã hóa lưu trữ có kiểm quyền, không hứa chỉ buyer có thể giải mã. Email/notification chỉ thông báo có hàng; buyer mở qua authenticated route. Tài nguyên object storage không public, signed URL có TTL và quyền tải lại theo snapshot policy.

Circle identity lấy từ provider subject đã xác thực; không merge account từ email request hoặc device token chưa chứng minh user. Đổi contact và recovery cần proof riêng. Stable campaign identity mapping không đổi khi xoay secret; giữ version/mapping cũ để truy order và quyền cũ.

Session bị revoke hoặc account change phải vô hiệu intent chưa được phép tiếp tục theo policy, nhưng không chuyển quyền claim đã ghim. Signature/nonce/token, entitlement, email và evidence riêng tư không vào log, browser trace public hoặc evidence artifact chia sẻ.

## 12 Vận hành và cấu hình

Tách môi trường local, staging và Arc acceptance; `.env.example` chỉ chứa tên biến/placeholder. Cấu hình gồm manifest/RPC, Circle server/app identifiers, Reown project, SMTP/email, storage, purpose-separated keys, outbox, alert destination và policies. Secret thật được cấp riêng, không nằm trong repository hoặc bản bàn giao công khai.

Có health/liveness/readiness cho API, provider, projection coverage và worker; metrics indexer lag, reconciliation delta, pending operations lâu, SLA nguy cơ, queue age/retries/DLQ và delivery failure. Threshold, SLO, capacity, RPO/RTO là quyết định vận hành cần ghi trước nghiệm thu.

Backup cần database, private objects, encrypted entitlements, identity mappings, schema/deployment metadata và khả năng truy key version an toàn. Restore vào môi trường tách biệt, validate scope/chain/keys, làm mới auth theo policy, giữ outbound/delivery workers bị khóa đến khi review và đối soát xong; không tự redrive email/webhook cũ.

Runbook phải có deploy/rollback, migration, secret rotation, outage/provider failover, indexer rebuild, stuck transaction recovery, dispute fallback, emergency cancel và restore drill. Kiểm dependency/secret và CI trên source/build cố định; không upload database, credentials hoặc private evidence như artifact kiểm thử.

## 13 Bài học cần tránh lặp lại

- Boolean đã claim làm khóa khoản refund phát sinh sau rebate; dùng cumulative amounts.
- Tổng campaign khớp nhưng order sai; kiểm per-order ở cùng block.
- API/indexer đến khác thứ tự làm mất private metadata; dùng stable IDs và idempotent merge.
- Hash terms đổi nhưng content/license snapshot không được review lại; version và binding phải khớp.
- Callback/HTTP thành công bị coi là giao hàng hoặc settlement; yêu cầu evidence tương ứng.
- Gộp native/ERC-20 USDC hoặc emitter khác nhau gây đếm tiền hai lần; precision và nguồn rõ.
- Chuỗi test local hoặc script dùng một khóa cho nhiều role bị coi là live product acceptance; nghiệm thu đa principal qua sản phẩm thật.
- Recovery dựng lại projection nhưng bỏ mất entitlement/identity/support hoặc gửi lại side effect; backup và replay cần tách hai lớp.
