# R5–R7 — lỗi trường sản phẩm và quyền phân phối

Ngày 17/10/2026 (UTC+7). Baseline fa08285; frontend live trước gói aa7bff7, backend 324bca2. Giữ mặc định approve đúng số tiền; không thêm tùy chọn hoặc đổi chính sách allowance trong gói này.

Đối chiếu source/proof: ProductStudio đã có command UUID, digest, receipt, giữ pending khi mất phản hồi và chống POST lặp. Form trước gói phụ thuộc validation của trình duyệt và lỗi chung; thiếu lỗi theo trường/focus cho nội dung trắng, số seat/ngày, giới hạn metadata và link HTTPS. Quyền phân phối thiếu kiểm trước checkpoint đối với statement trắng hoặc evidence không hợp lệ. Các proof recovery cũ không thay bằng chứng các lỗi này.

Sửa frontend: kiểm metadata theo giới hạn backend trước tạo UUID/checkpoint/request, lỗi VI/EN gắn aria-invalid/describedby; focus trường sai đầu tiên theo thứ tự DOM và cuộn đủ nhãn/lỗi dưới header. Ô số nguyên giữ chuỗi nhập để báo lỗi thập phân hoặc ngoài giới hạn; duration/activation trống vẫn null, supportDays=0 vẫn hợp lệ. Lỗi tự cập nhật khi sửa hoặc đổi ngôn ngữ; không xóa nháp. Giữ nguyên server guard, API, receipt và khóa gửi khi kết quả chưa rõ. Chỉ xác nhận thành công khớp receipt mới xóa nội dung.

Đã giữ lượt baseline FAIL tại aria-invalid số seat 0. Bốn ca mới VI/EN ở 375px/text200 và 21 hồi quy metadata/rights/receipt/đổi phiên/7 khổ đã PASS local trước hai dòng reset trạng thái validation khi mở phiên bản/hủy chỉnh sửa. Sau hai dòng cuối đang kiểm lại type/build/built và CI hẹp r7-product trên source chính xác. Chưa triển khai gói này tại thời điểm ghi ban đầu; không gọi CI/fixture là nghiệm thu live.

Giới hạn: file upload/import codes còn cần gói lỗi trường riêng; chưa whole-app/cross-browser hoặc hành trình seller thật. Admin live user hoãn; Circle chiều ngược/cirBTC/email nghiệp vụ, Safe owner/custody và offhost/RPO–RTO còn mở. Không app/DB local cũ, reset/seed/replay đơn1–5, ký/provider create thật, mutation tài khoản thật, giải phóng 95 held hoặc full test/CI. G5/G6 OPEN, candidate NOT_FROZEN.
