# SDK webhook — 18/10/2026

Source SDK 416ab71a7f94cd8b71aa6b34780d373eb9f7bf52. Runtime frontend 8dc5cf1ee3a10c2e1065ba755c99b39a778b6f07, backend 30fea223380affc471cc91f4ab2390814ddaa87c, ops 73b6fae5a33eda1dfc9ab6c3364d9fcfa65809b8 giữ nguyên. Không deploy hoặc restart ứng dụng; SDK không nằm trong 377 runtime inputs được admission. Gói SDK riêng chưa publish registry.

Đã tái hiện payload có HMAC hợp lệ chứa JSON numeric overflow 1e400 được receiveWebhook chấp nhận thành Infinity. Khi durable inbox JSON.stringify để lưu thì số này thành null, làm payload lưu khác với event được nhận. Consumer hiện từ chối mọi number không hữu hạn trước gọi inbox.persist, khớp bộ lọc finite của producer. Số hữu hạn, chuỗi và boolean giữ nguyên.

10 ca mới chạy từ tarball được npm pack, cài offline vào consumer riêng và dùng HTTP receiver/SQLite loopback: ±overflow không chèn inbox; finite exponent/primitive lưu đúng; concurrent duplicate/reopen chỉ một event; tamper/stale/event mismatch/malformed HMAC bị từ chối; nested/prototype/null/oversize bị từ chối; lỗi storage không trả ACK thành công; receiver thực từ chối overflow, nhận một lần và restart giữ nguyên QUEUED payload. SDK build đạt. Target test:webhook kiểm đúng delta; npm test mặc định đã nối ca này cho các lần CI sau, không chạy full CI ở gói này.

Giữ log FAIL trước sửa và hai lượt PASS (lượt cuối sau thay package test script). Tarball cuối SHA256 68999196583628f61b9beed75320b2538f05cd1521efc73160d8baf2275c33a3, 19154 bytes; kiểm chỉ package.json/README/examples/receiver/dist được đóng gói, không private input/source/test. Loopback/fixture không chứng minh provider callback hoặc receiver độc lập live.

VPS quan sát 2026-10-18T01:59:42.092Z: PID97197/NRestarts0; 377 runtime/181public khớp, SDK runtime inputs0; backup VERIFIED/privateRestore/BACKUP_CURRENT và timers active;95held giữ. Không DB local snapshot, DB write live, provider create/transfer, email mới, ký/broadcast hoặc replay đơn1–5. Metadata ví/email và authority/Safe kế thừa theo timestamp ở parent; không gọi đó là lần đọc tài chính/Safe mới. Username/social tiếp tục hoãn; admin live vẫn user hoãn.

G5-11 đã bổ sung đúng proof packed SDK/HTTP có thực thi; phần independent receiver/provider/outage/DLQ live còn OPEN. Toàn candidate NOT_FROZEN; G5/G6 OPEN.

Proof: reports/evidence/sdk-webhook-envelope/2026-10-18T01-57-10-729Z/CHECKS.json
SHA256: 8785648326f936d19fc31bfd2b2fda97d972572ec89745a58e54db0e79d2af7f
