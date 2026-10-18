# Commit/metric/cap — 18/10/2026

Read-only public RPC và native SQLite cho đúng năm đơn đã hoàn tất, không tạo/replay buy hoặc finalize. Frontend 8dc5cf1ee3a10c2e1065ba755c99b39a778b6f07, backend 30fea223380affc471cc91f4ab2390814ddaa87c, SDK 416ab71a7f94cd8b71aa6b34780d373eb9f7bf52, ops 73b6fae5a33eda1dfc9ab6c3364d9fcfa65809b8 giữ; source checkout 3287908fdcc54dde92efcca8a1e246447459d193, không sửa/deploy app hoặc chạy test/CI.

| Campaign | Metric | Buyer/units | Giới hạn mỗi account/inventory | Đơn đã đọc receipt |
|---|---|---|---|---|
| 1 | UNITS_COUNT | 1/2 | 2/2 | 1 |
| 2 | UNITS_COUNT | 1/2 | 2/2 | 2 |
| 3 | UNITS_COUNT | 1/2 | 2/2 | 3 |
| 4 | BUYER_COUNT | 2/2 | 1/2 | 4,5 |

50 public RPC methods đã đối chainId/Hub bytecode/manifest;5 successful commitment receipts khớp hash/from/to/value0/block canonical/event principal/campaign identity/quantity/locked price/gross/early flags với native. Contract terms và state đọc ở block receipt (trạng thái cuối block, không giả là ngay sau riêng transaction); block đọc lại canonical. Current finalized 67766671/0x9f713287802928609e1f38dfa704332ee5aa1ec9571bd4afe4d246c3aaf5054c:4 campaign terms/tiers/order IDs/counters/total gross/cap/inventory/status/timing/final price khớp native và các order. Mọi giá trị native trước-sau đọc được đối theo thứ tự canonical, không ghi DB;377 runtime files khớp admission,PID97197/NRestarts0/95held giữ.

Campaign1–3: một buyer mua2units, UNITS_COUNT=2. Campaign4: hai buyer khác identity mua mỗi người1unit, BUYER_COUNT tiến1→2. Cả bốn có successful identity chạm maxPerAccount, units chạm inventory, trạng thái FINALIZED với finalizedAt trước endTime. Đây là proof thành công ở đúng biên, không là proof gửi quá cap/sold-out bị từ chối. Finalization state được đọc mới; gói này không re-read receipt finalize hay thực thi finalize lần nữa.

Tất cả4 campaign earlyRebateEnabled=false;5 receipt đều isEarlySupporter=false. Rebate do tier không chứng minh early supporter ON/slot exhaustion/cap. Không có rebuy cùng identity. Các ô này cùng principal mismatch/concurrency/negative cap/current-bundle recovery vẫn OPEN; không lấy năm đơn để đại diện mọi nhánh.

Giữ lượt đầu READ_UNCONFIRMED/CANONICAL_OR_NATIVE_CHANGED. Exporter đầu sort in-place hai array để lập báo cáo rồi so hash trực tiếp với thứ tự SQL mới, làm kiểm so sánh phụ thuộc thứ tự. Exporter cuối so snapshot theo thứ tự canonical và tách kiểm block với giá trị; vẫn giữ toàn bộ per-field/canonical guards. Lượt cuối đạt; không sửa source ứng dụng hoặc dữ liệu để làm xanh. Lượt đầu không được gọi PASS.

G5-04/G5-06 đã map đúng phạm vi quan sát. Claim order2/SDK/UI/ops/email/admin/Safe kế thừa đúng timestamp từ INHERITED. Circle chiều ngược đang chờ lượng user chốt và tự OTP/ký; admin live vẫn hoãn; receiver/provider/email thật, Safe control/custody và offhost/RPO–RTO còn thiếu. Username/social sau bản đầu. Candidate NOT_FROZEN; G5/G6 OPEN.

Proof: reports/evidence/commit-branches-readonly/2026-10-18T02-09-23-823Z/CHECKS.json
SHA256: 76ef0e9283f0719406db082c37eef353f5226942567d26ebc958d14e258d7d1a
