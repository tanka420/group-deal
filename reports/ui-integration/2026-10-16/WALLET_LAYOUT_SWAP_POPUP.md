# Ví, hoán đổi và khung trang — 16/10/2026

Frontend `fe9a004c5721a05cf2e1b9cd8bac0e175741676c` đã push và triển khai lúc 07:58:52Z. Backend giữ `52bbaef5e8f87ae670c1d78ad352c61458f70ea3`, PID3601831, NRestarts0. Gói chỉ cập nhật static frontend; không restart backend hoặc thay DB/config/Nginx, không kết thúc phiên đang dùng.

## Kết quả theo yêu cầu

- Trang Ví có Số dư thanh toán bên trái, Hoạt động ví bên phải, cùng chiều cao trên desktop; danh sách có vùng cuộn riêng và dùng được bàn phím. Mobile xếp dọc với lịch sử cuộn. Bỏ khối Nạp USDC trong trang Ví.
- Hoán đổi mở popup cùng cơ chế dialog với Gửi/Nhận. Nhập số lượng, chọn token, xem số nhận dự kiến, tối thiểu, trượt giá và phí ở dưới. Không trình bày ví gửi/nhận cho swap; bước gửi USDC vẫn có địa chỉ người nhận.
- Đợi ngừng nhập800ms rồi lấy báo giá thật từ API hiện hành; tự làm mới khi hết hạn trong popup đang mở/hiện. Đổi số lượng/cặp token/phiên thì bỏ kết quả cũ. Lỗi phải bấm thử lại; không tự lặp vô hạn. Đóng popup dừng lịch cập nhật. API quote vẫn lưu yêu cầu chưa ký theo cơ chế hiện hành, không giữ nonce hoặc gọi ký.
- Màn kiểm tra cũng tự cập nhật báo giá swap chỉ khi mọi bước còn PLANNED, kiểm trạng thái server trước. Yêu cầu đã approve/ký/gửi giữ nguyên để phục hồi; không tự tạo lại hoặc ký tiếp. Quyền approve đúng số lượng, spender, trần phí và chữ ký riêng cho swap giữ nguyên.
- Các trang Ví/Tài khoản/Hỗ trợ/Tài liệu/Người bán dùng chiều rộng của main-content1280px, không thu hẹp thêm900/1120px. Khung dialog và nội dung đọc có giới hạn riêng khi cần.
- Khối glass-card hover dùng shadow, giữ nền/viền. Nút trắng giữ viền1px, hover viền màu chủ đạo và shadow. Giữ trạng thái focus/disabled.

## Kiểm đúng phần thay đổi

Frontend typecheck và production build đạt. Browser fixture chặn toàn bộ API/provider thật, không khởi động backend/DB snapshot. Đã kiểm:

- Bố cục, vùng cuộn24 hoạt động, cùng chiều rộng, hover và không tràn ở375/1440px; xem ảnh desktop/mobile.
- Tự tính/tự đổi phí hết hạn, debounce, phản hồi đến sai thứ tự, nhập không hợp lệ, đóng popup, lỗi route và retry; đổi chiều token/precision6–8 chữ số/trượt giá.
- Approve rồi swap bằng hai chữ ký riêng; refresh unsigned và không tự thay yêu cầu đã approve.
- Gửi đúng nonce, từ chối ký/phục hồi hash, tự chờ biên nhận/thành công, mở lại sau hết hạn, Circle chờ hash, OTP email tại chỗ, hai nhánh repair phí Circle.
- Build thực: route guest375/1440 và yêu cầu Circle cũ cần xác thực tại chỗ; không gửi provider hoặc yêu cầu tài chính.

Các lượt đầu có assertion cũ (nút nạp toàn header, màu primary cũ, tên nút xác thực Circle trước đây) và nhãn select trượt giá chứa options; đã sửa đúng selector/theme và liên kết label riêng, rerun phần liên quan đạt. Giữ lịch sử runner thất bại trong packet, không diễn giải thành toàn bộ kiểm đạt ngay từ lần đầu. Không chạy full test/CI.

## Đối chiếu VPS và giới hạn

91 file trong gói delta,181 file full build; toàn bộ byte cài đặt khớp. Giữ asset cũ và ba entry rollback tại `frontend-wallet-layout-vWcvUM/before`. HTTPS đối chiếu index/main JS/WalletPage/AccountPage/SupportPage và CSS; bốn route200, health200, API ví khách401 và Circle reauth khách401. Nginx không đổi. Backup đúng backend source, VERIFIED/privateRestore/BACKUP_CURRENT,95held jobs không đổi; dịch vụ và các timer còn hoạt động. Không ký/broadcast, replay đơn1–5 hoặc release held jobs.

Đây là hoàn tất delta giao diện và triển khai, không là nghiệm thu toàn dự án. Kế thừa proof gửi/nhận USDC và swap ví ngoài hiện hành; không có giao dịch tài chính live mới trong lượt UI này. Circle swap/cirBTC, offhost RPO/RTO và G5/G6 vẫn OPEN, candidate NOT_FROZEN. Người dùng tự OTP/ký khi kiểm giao dịch thật. Bằng chứng hiện hành được ghim tại `reports/evidence/CURRENT_UI_WALLET_LATEST.json` ở workspace bàn giao.
