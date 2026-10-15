# Gói 03 — Đơn mua và tham chiếu mã đơn

Phạm vi tiếp theo của thiết kế đã duyệt ngày 15/10/2026. Baseline source `e1968bafe0eaa766eacc67580997f217e7e6fab8`; backend runtime vẫn ứng dụng `8d31d1691885238b0b0045335cc2aeccfadedac8`. Chỉ thay frontend, Nginx route và fixture kiểm; không thay schema, contract, quyền hoặc chạy DB snapshot local.

## Hành vi

- `/orders`: tìm mã đơn/tên sản phẩm, trạng thái, ngày ghi nhận UTC+7, mới nhất trước; lọc toàn bộ tập đơn thuộc tài khoản mà API hiện hành trả về, rồi hiển thị 20 đơn/lần. STT tách khỏi mã đơn; tiền hàng đã cam kết tách khỏi claimable. Tổng rebate/refund phía trên ghi rõ là của toàn bộ tài khoản.
- `/orders/:id`: chi tiết chỉ chọn từ các đơn API được phép trả về; giữ luồng tài nguyên, confirm/dispute/claim và lịch sử recovery. Back giữ bộ lọc; reload/deep link và hash `#order-ID` tương thích. Nginx chỉ fallback route hợp lệ, không trả HTML cho API/asset không tồn tại.
- Component mã đơn hiển thị và sao chép `order.id` tại buyer, seller, admin overview/orders/transactions/disputes và hỗ trợ. Thông báo buyer có source orderId hợp lệ mở đúng chi tiết. Không dùng onchainOrderId, txHash hoặc STT thay mã nghiệp vụ.
- Đánh giá đã gửi và phản hồi seller hiện trong chi tiết. Đóng review/dispute giữ bản nháp trong phiên trang; đổi tài khoản xóa nháp. Kết quả gửi review chưa rõ yêu cầu đọc lại đơn; backend singleton giữ nguyên.
- Trao đổi buyer–seller dùng API messages và ACL hiện có, tách khỏi ticket hỗ trợ. Nháp giữ khi đóng; checkpoint chỉ lưu cờ chưa xác nhận theo user/order trong sessionStorage, không lưu nội dung. Mất phản hồi POST chặn gửi tiếp; phải tải lại lịch sử và xác nhận đã kiểm tra. Không tự retry API không có idempotency.
- Lịch sử cũ trong Support dùng trường `timestamp` của service thật. Fixture cũ dùng nhầm `createdAt` đã được thay bằng service OrderThreadService để kiểm đúng hợp đồng API.

## Kiểm và giới hạn

Kiểm unit cho khoảng ngày UTC+7, ngày thiếu/sai, tìm/sort toàn tập, route; browser fixture cho list/detail/back/reload, draft, unknown acknowledgement, notification, tài nguyên và bảo vệ phiên, phần admin đổi tham chiếu, hỗ trợ và quản lý seller theo dõi tại `/account`. Không chạy full suite. Lỗi duplicate React key giữa OrderList và TransactionHistory được phát hiện bằng ca lọc/đổi URL và đã sửa.

Chưa đóng toàn bộ R3–R7 hay G5/G6: gói seller/admin riêng và ví gửi/swap còn tiếp theo; đây không phải chứng cứ giao dịch hoặc chữ ký live mới. Chưa thay proof Safe, email nghiệp vụ, incident/offhost recovery. Không replay đơn1–5 hoặc release95held.
