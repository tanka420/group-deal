## Hiện hành — 21/10/2026: username/OAuth đã deploy; mở lại toàn bộ phần từng hoãn

Chỉ dẫn mới của user21Oct thay các dòng hoãn trong lịch sử: username/social, Circle, admin live và OneDrive đều trở lại phạm vi hoàn thành. Giữ Arc Testnet, người dùng tự OTP/ký/consent, VPS writer duy nhất; không reset/seed/replay đơn1–6/giải phóng95held.

Backend **47f3f64da4915e9b46c37ff7b9e09f048e2f8293**, frontend **6e643c8181daada6b33f3874d8e2a3e56b0af8e6**, ops backup **9734d195644dee1b5a77abca0d6c86cc7ecf18ca** đã push/deploy. Seller chọn username trước publication mới; liên kết X/GitHub/Discord bằng OAuth+PKCE, gắn đúng phiên/provider/ID ổn định và duy nhất toàn hệ thống; có ngắt và hiển thị công khai. Chưa cấu hình/consent OAuth live; không ghi đã nghiệm thu provider.

55 scoped identity checks, regression snapshot cũ,10 source/emitted runtime-upgrade cases và các kiểm auth/profile/wallet/product/SQLite liên quan đạt. Desktop/390px CUA fixture đạt; VI quan sát, không coi đã kiểm EN/200%/OAuth live. Build backend/frontend đạt,9 HTTPS routes/guard/assets đạt. Lần deploy đầu bị guard từ chối do thêm collection rỗng vào snapshot; rollback bản cũ/health200 đã kiểm. Sửa lazy collections, không giảm guard; lần sau native preparation **HEALTHY**, mọi field/ledger giữ. Runtime **389 file**, public **186 file**; PID **1339439**, NRestarts0, native **.cache/application-recovery/drill-bqoqaE/candidate**. Backup mới source47f3 private-restore verified/BACKUP_CURRENT.

Native22:07:30UTC:19users/6campaigns/6orders/44ops/8grants/12inventory;ledger52/72/SHAee7087ef1992baf86b322aaf1259487d90fa0a17bf7c544c7ef5c16c3559ce17;5đơn cũSHAf864e1a7f21a123450f6d17111f2f0bbc5514557bb47d048b1cd521622b24ae9/95held giữ. FILE_LINKorder6 đã rút đủ, không làm lại. Safe T/A/N giữ khai báo tách quyền khôi phục; chữ ký18Oct đã hết hạn, không fresh control cho candidate mới.

CURRENT [CHECKS.json](E:/apps/group-deal/reports/evidence/project-completion/2026-10-20T21-38-39-093Z/CHECKS.json), SHA256 **f933b9affb8598ab3d6f3ae01f9bcdc69d8d6038f78b37e683995cf000d7efb8**, 341648bytes/51artifacts. Checkout source duy nhất **E:/apps/group-deal/.cache/ci/c-322e58ff**, remote github, branchcodex/license-key-csv-studio. Rootreports là nơi giữ evidence. NginxSHAfafecfbe84ef0a55ed70f2bd1378544ac2b265cf4bd673a95df848f3e4b77cc9 giữ. **NOT_FROZEN/G5OPEN/G6OPEN/acceptanceEligible=false/wholeProjectAccepted=false.** Tiếp OneDrive/ops độc lập, rồi tài liệu human actions và prompt chat mới; không dừng ở kế hoạch.

# Kế hoạch phát triển sau bản đầu — GroupDeal

Cập nhật 18/10/2026 (Asia/Saigon). Người dùng đã đồng ý lưu các tính năng bên dưới cho giai đoạn sau và tiếp tục kế hoạch hoàn thiện hiện hành. Đây là backlog, không phải source đã triển khai, không bổ sung điều kiện chặn nghiệm thu G5/G6 của bản hiện hành.

## POST-V1-01 — Username và liên kết mạng xã hội của seller

**Trạng thái:** HOÃN SAU BẢN ĐẦU. Chưa bắt đầu triển khai; chưa đăng ký OAuth app, thay DB, thay luồng đăng nhập hoặc yêu cầu seller cũ bổ sung username.

**Mục đích:** cho buyer truy cập tài khoản mạng xã hội đã được seller xác thực quyền kiểm soát, rồi tự đối chiếu và đánh giá người bán.

Phạm vi cần giữ khi mở gói:

- Username GroupDeal bắt buộc với seller, buyer tùy chọn; tách username GroupDeal khỏi tên hiển thị và username mạng xã hội.
- Liên kết xác thực X, GitHub, Discord. Hiển thị icon dịch vụ + username + hyperlink hồ sơ tương ứng.
- Mỗi tài khoản mạng xã hội chỉ liên kết với một tài khoản GroupDeal tại một thời điểm, theo provider + ID ổn định; chống trùng cả khi có yêu cầu đồng thời hoặc đổi username bên nhà cung cấp.
- Khi chuyển liên kết phải ngắt tại tài khoản GroupDeal cũ rồi xác thực lại ở tài khoản mới. Không tự chuyển hoặc gộp tài khoản.
- Xác thực liên kết không chứng nhận uy tín, chất lượng hoặc quyền phân phối. Giữ riêng dấu seller được xét duyệt hiện hành.

Thiết kế đề xuất, cần rà lại khi triển khai: từng dịch vụ tùy chọn; chưa bổ sung đăng nhập xã hội hoặc điểm uy tín; quyền OAuth tối thiểu; bảo vệ phiên/callback; có ngắt liên kết và cập nhật hiển thị công khai. Seller cũ vẫn xử lý được đơn và quyền lợi cũ.

Đặc tả và các trường hợp cần kiểm: reports/ui-integration/2026-10-18/SELLER_SOCIAL_LINKS_REQUIREMENTS.md. Đọc bản trên checkout để xem yêu cầu; artifact và hồ sơ triển khai hiện hành vẫn ở E:/apps/group-deal/reports.

**Thời điểm xem xét lại:** sau khi hoàn thiện phạm vi bản hiện hành, đủ bằng chứng G5/G6 và bàn giao. Khi bắt đầu phải đối chiếu source mới nhất, quyền truy cập/chi phí/chính sách API của nhà cung cấp và lập gói kiểm chứng riêng. Không tự kéo backlog này trở lại trước G5/G6 vì các bước hiện hành đang chờ người dùng hoặc offhost.

## Thứ tự công việc hiện hành được giữ nguyên

R5–R7 đã khép source và hồ sơ UI hữu hạn theo CURRENT; tiếp tục Người dùng/Phân quyền → các hành trình thật còn thiếu → vận hành → freeze candidate khi đủ điều kiện → G5/G6 và bàn giao. Admin authenticated live vẫn do người dùng hoãn; tiếp tục các phần độc lập trong lúc chờ OTP/chữ ký hoặc máy offhost.

Prompt tiếp tục: reports/PROMPT_CHAT_MOI_2026-10-18.md. Báo cáo cũ đề xuất đưa social/username trước G5/G6 đã được quyết định này thay thế.
