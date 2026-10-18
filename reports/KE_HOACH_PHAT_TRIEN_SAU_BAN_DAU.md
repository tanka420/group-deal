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
