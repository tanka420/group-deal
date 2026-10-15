# Gói 02 — Home và catalog

Baseline c5531fff274985a8c441fdb95a41f7fb17325e3e. Sửa trong checkout sạch, theo thiết kế và R2/R8 đã duyệt.

- Home tại `/` tách Khám phá `/explore`, lấy tối đa 3 deal thật đang nhận mua, danh mục thật, không điền deal giả hoặc giá giảm giả. Menu/legacy hash có cùng route; back từ chi tiết giữ đường về.
- Khám phá mặc định chỉ nhận mua. API dùng cùng `purchaseHeld` như card (thời gian, capacity, trạng thái kết thúc, rights/terms). Đây là projection công khai; khả năng mua vẫn kiểm lại khi checkout.
- Min/max theo giá hiện tại mỗi đơn vị trước rebate, số nguyên 6 chữ số USDC, không Number/float. Trống là không giới hạn; từ chối âm, exponent, quá 6 số thập phân và min>max. Lọc, số lượng và sort toàn tập ở API trước phân trang; sort mới nhất/hạn kết thúc/giá tăng/giảm. Giữ API sort cũ và cursor v1 khi phù hợp; sort mới dùng cursor v2 gắn đầy đủ filter và deployment.
- Chip xóa từng điều kiện; Xóa bộ lọc bỏ mọi điều kiện. Drawer có bản nháp; Đặt lại chỉ đổi nháp, Áp dụng mới cập nhật; Escape/Đóng bỏ nháp filter. URL giữ điều kiện và Back/Forward/reload. Có tải/rỗng/lỗi/thử lại/tải thêm/hết kết quả, không tự suy tổng từ số card đã tải.
- Field status/metric cũ còn được API/URL hỗ trợ, không đưa vào UI buyer mặc định. Card giữ metric và license thật.

## Kiểm scoped

API fixture cô lập: public_catalog, public_api, public_seller PASS, gồm mọi trang, giá rất lớn, cận bao gồm, giá tier hiện tại thay vì tier tương lai, cutoff/time/capacity, scope cursor, privacy và query lỗi. Không đọc DB snapshot local hoặc gọi provider live.

Browser dev: 13 ca catalog + navigation PASS, gồm 7 khổ cho VI/EN và 3 khổ Home. Đã xem ảnh Home375 và drawer375; khung cuộn nằm trong dialog, nút áp dụng luôn thấy. Typecheck frontend/backend và route 14 roundtrip/7 rejected paths. Build/CI/deployment có proof riêng sau khi ghim commit; báo cáo này không thay bằng chứng hosted.

## Runtime và phạm vi

Backend delta chỉ publicPagination và shared/catalogQuery (cùng file JS biên dịch); không schema, accounting, principal, worker policy hoặc config. Cần quy trình native runtime admission khi đổi backend; giữ bản rollback, dữ liệu hiện hành, 95 held jobs, reconciliation và quyền nguyên vẹn. Không chạy full CI, gửi email, tự ký, replay đơn1–5 hay release held work.

Gói buyer/seller/admin/ví và G5/G6 tiếp tục sau gói này. Đây không phải nghiệm thu toàn dự án.
