# Gói 04 — Kênh người bán

Baseline `bd6d87a05caabd61d0dffbeb2616467181807f2e`. Giữ backend `8d31d16`, contract, API, principal và kho native hiện hành. Thay frontend/Nginx, kiểm bằng fixture riêng; VPS vẫn writer duy nhất.

- Sidebar desktop và menu mobile ở đầu workspace. Các khu có URL riêng: `/seller`, `/seller/orders`, `/seller/revenue`, `/seller/disputes`, `/seller/products`, `/seller/profile`, `/seller/integrations`, `/seller/create?draft=ID`. Back/reload giữ khu và bộ lọc; hash cũ vẫn dùng được.
- Tìm mã/tên, trạng thái, khoảng ngày UTC+7 cho đơn; tìm/lọc chiến dịch, sắp mới nhất trước và tải thêm20. Lọc toàn bộ dữ liệu thuộc seller từ API hiện có. STT tách mã; tổng toàn kênh ghi rõ không theo filter. Metric hiển thị người mua hoặc đơn vị đúng campaign, thiếu dữ liệu để chưa xác minh.
- Phân bổ/rút tiền tách thành khu riêng, dùng các trường đã xác minh và ví payout của từng đơn. Giữ ManagedClaim/ManagedOrderAction, cửa sổ dispute và recovery, không thêm lệnh tài chính mới.
- Khu tranh chấp chỉ lấy DISPUTED/RESOLVED. Component chung buyer/seller trình bày lý do, liên kết HTTPS hợp lệ và ghi chú phân xử có sẵn; không suy thành tiền đã về ví. Trao đổi theo đơn giữ quyền hiện hành, không cấp cho seller quyền phân xử.
- Hiển thị review và phản hồi seller qua API reply-review hiện có. Close giữ nháp; POST chưa rõ kết quả giữ cờ phục hồi theo user/order và chặn gửi lại đến khi người dùng đọc lại. Không lưu nội dung riêng tư vào browser storage. Các phản hồi muộn phải đúng phiên.
- Giữ form sản phẩm/hồ sơ khi đổi khu trong phiên trang; chuyển khỏi sản phẩm đóng xác nhận archive để portal không nằm trên khu khác. Các checkpoint sản phẩm, campaign draft, hồ sơ ký, fulfillment và webhook được giữ. Profile/product vẫn dùng được khi API inventory khác lỗi.

## Ngữ cảnh hành trình

| Hành trình | Dữ liệu giữ | Khi chưa rõ kết quả | Đường tiếp |
|---|---|---|---|
| Tạo / tiếp tục campaign | draftID trong URL; form và checkpoint của wizard hiện có | Dùng đúng yêu cầu/receipt cũ; không tạo lại campaign | Quay danh sách campaign hoặc mở lại draftID |
| Giao tài nguyên / quyết toán / claim | order.id, campaignId, buyer principal/payout của order; ManagedFulfillment/ManagedOrderAction/ManagedClaim | Giữ transaction checkpoint; dùng lịch sử recovery | Về đúng đơn/khu seller; chỉ user ký |
| Phản hồi review | order.id, tài khoản, nháp trong dialog | Cờ sessionStorage không chứa text; đọc lại review trước tiếp tục | Ghi nhận response khi ACK khớp hoặc chỉnh sau readback |
| Tranh chấp | Mã đơn, lý do/bằng chứng/ghi chú hiện có | Không suy chuyển tiền từ metadata | Trao đổi theo đơn hoặc ticket hỗ trợ riêng |

## Kiểm và giới hạn

Scoped:13ca seller workspace (tiền chính xác, metadata thiếu, phiên, payout, webhook),4ca tích hợp mới (URL/filter/mobile/nháp/metric/review),5ca liên quan sản phẩm/profile/held webhook,1ca buyer dispute context; route22roundtrip/8reject, type/build. CI cần giữ chế độ dev cho các ca dùng Web3Context fixture; ca mới kiểm thêm built. Không chạy full pipeline.

Chưa hoàn tất admin Users/Permissions/auth riêng, ví gửi/swap, email nghiệp vụ, proof Safe/offhost và G5/G6. Không replay đơn1–5 hoặc release95held. Scoped UI proof không thay nghiệm thu toàn dự án.
