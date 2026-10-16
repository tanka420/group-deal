# Đối chiếu hành trình và vận hành hiện hành

Ngày16/10/2026, backend/frontend324bca2 tại thời điểm đọc. Source sạch a10370c, ops28f62e0. Không tạo yêu cầu, ký, phát giao dịch, gửi email hoặc đổi tài khoản thật.

Đã tìm thấy Circle1USDC→1.154436EURC do user thực hiện: approve nonce7/hash54391bfc… và swap nonce8/hash70480ca8… đều CONFIRMED. Verifier receipt thuần của runtime hiện tại khớp admission; call/principal/nonce/canonical finality/phí/minimum1.142920EURC/output/reservations RELEASED đều đúng. Đây là recheck giao dịch có sẵn; không phải hành trình UI đăng nhập mới trên bundle324. Circle chiều ngược và cirBTC vẫn thiếu execution proof. Không yêu cầu ký lại giao dịch đã xong.

Hai external receipt gặp HTTP429 đã đọc lại đạt ở nhịp300ms. Approval af47 cũ thiếu networkFee tùy chọn đã persist; receipt/nonce/block/reservation vẫn đúng và đọc được phí, không backfill hoặc sửa hồ sơ. Các request approve-only giữ nguyên SWAP PLANNED/no hash. Ledger44flows/56reservations giữ SHA2567d0f952c….

8email SENT hiện có toàn TEST cũ/source event vắng/thuộc held; không có email mới từ sau upgrade. Không dùng SENT này hoặc ops mail để chứng nhận email nghiệp vụ/inbox. Không đọc email/license payload và không release95held.

Fresh conformance377runtime/181public files đạt; PID3655922/NRestarts0, backup đúngsource VERIFIED/privateRestore/auditSQLite/sourceRows/BACKUP_CURRENT và timers active. Safe finalized67484825 đúngmanifest,2/3/nonce0/version1.5.0/modulesrỗng. Packet message mới chỉ kiểm soát owner,0chữ ký, custody chưa chứng minh; hết hạn17/10/2026T10:33:46Z. Không có máy đích offhost, không export archive/credentials mới, chưa incident/RPO/RTO.

Proof bất biến: E:/apps/group-deal/reports/evidence/journey-ops-current/2026-10-16T10-33-46-101Z/CHECKS.json, SHA2566f8b1b8583f169df4d37ed03ecbb6f0283934c0c10607f38ad0201a4d3ddf6bd. Trong cùng thư mục có G5_MATRIX.md, SAFE_CONTROL_RUNBOOK.md, OFFHOST_PREPARATION.md và READ_ATTEMPTS.md. Candidate NOT_FROZEN, G5/G6 OPEN; chưa đủ điều kiện G6 ký nhận.
