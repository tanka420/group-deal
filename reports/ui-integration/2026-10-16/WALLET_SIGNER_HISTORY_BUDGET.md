# Sửa lỗi giới hạn đọc lịch sử signer — 16/10/2026

Backend `393fa6d38fc368ea848d3960fae02d3d88136592`, pin backup `e478f19aeea91f2652a82a8ba5fac33eb716c5fb` đã push và triển khai. Frontend giữ `66b3d720dbf2a28edbd889b5931c2bfe9bcfabd4`.

## Nguyên nhân đã tái hiện

Thông báo “Chưa đọc được trạng thái giao dịch để xác minh ví” xuất hiện tại READY của ví ngoài `0x580c…d21ae`, HTTP503. Ba yêu cầu mới nhất bị chặn đều PLANNED, chưa nonce/hash. Ví có13 reservation RELEASED cần đọc lại. Verifier cũ dùng tối đa128RPC cho lịch sử thường; kiểm13 giao dịch cần130RPC. Đọc lại bằng đúng verifier runtime cũ dừng ở128 với `SIGNER_READ_BUDGET_EXHAUSTED` sau6.817s.

Phép chẩn đoán chỉ đọc SQLite/RPC. Owner bindings lấy từ reservation đã lưu, utility crypto được thay bằng hàm chặn truy cập key và chặn mọi app/store/service import. Đây là đối chiếu nguyên nhân trong pure verifier, không là chứng nhận authenticated READY hoặc giao dịch mới.

## Thay đổi

Budget là `max(128, 20 × số hồ sơ lịch sử)` sau kiểm tối đa64 hồ sơ, nên trần1280RPC. Một hồ sơ hiện cần tối đa10RPC cho exact call,13 cho nonce replacement,15 cho BUY expiry hoặc18 cho bridge mint. Mọi bằng chứng vẫn được đọc lại, kể cả RELEASED; không cache/chia sẻ kết quả để thay canonical recheck. Giữ hạn25s đọc và30s proof, bound owner/context/nonce, kiểm reorg/finality, SQL atomic commit và mọi hold chưa rõ kết quả. Không sửa dữ liệu tài chính/lịch sử, không cấp quyền ký tự động.

Thêm7 hồi quy cho13/64 hồ sơ, legacy unreserved, quá64 từ chối trước RPC, reorg ở lần đọc130, pending receipt và deadline25s. Sửa hồi quy nhiều BUY expired để phù hợp budget theo số hồ sơ; runner signer-ready nhận test mới.

## Kiểm chứng và triển khai

- 7 history-budget +18 expired-BUY +20 signer foundation +14 READY integration +37 wallet-service =96 ca đạt; build TypeScript backend đạt. Lần đầu một assertion kiểm vị trí reorg chưa đúng đã được sửa và giữ log thất bại. Không chạy full test/CI, frontend không đổi.
- Nâng native từ dữ liệu writer hiện hành, reconciliation HEALTHY;39 walletFlows/51 reservations nguyên SHA `30bac0546f8d07384dff1a3e6c30a6141c38d788fdaecde17e8dc66f0972c349`;95 held worker jobs giữ nguyên. Maintenance13.595s; PID3638966/NRestarts0, native `.cache/application-recovery/drill-jlqIZt/candidate`.
- Verifier mới trên cùng13 bằng chứng live đọc đủ130RPC, đạt trong6.839s; không commit plan, gọi READY/provider create, ký hoặc broadcast.
- Public UI hash giữ nguyên;4 route200/health200, khách wallet/reauth/preview/start401. Backup đúng source mới VERIFIED/private restore/BACKUP_CURRENT, ba timer active.
- Lịch sử đọc lúc09:17:01Z:39 hồ sơ gồm27 quote-only ẩn,12 activity (10confirmed/2approve chưa swap/0pending); không xóa hồ sơ cũ. User đã hoàn tất thêm một Circle swap trước deploy theo DB, chưa được dùng làm bằng chứng financial execution độc lập trong gói này.

Backend upgrade kết thúc phiên cũ; người dùng tải lại `/wallet`, đăng nhập và thao tác hoán đổi trên popup. Yêu cầu PLANNED đã hết quote cần phí/quote hiện hành theo luồng preview; không ký lại giao dịch đã hoàn tất. Chưa có authenticated swap mới sau bản sửa này. Giữ giới hạn64 và deadline hiện hành; không tuyên bố throughput của64 hồ sơ trên RPC thật. G5/G6, các bằng chứng Circle swap/cirBTC/Safe/offhost/R5–R7 còn thiếu vẫn mở.
