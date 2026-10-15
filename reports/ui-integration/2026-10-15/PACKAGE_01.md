# Gói 01 — nền điều hướng và URL

## Quyết định hiện hành

Ngày 15/10/2026 người dùng đã duyệt hướng thiết kế, R1–R8, mã đơn `order.id` xuyên buyer/seller/admin và hai khu Người dùng / Phân quyền riêng. Quyết định này thay ghi chú “chưa duyệt” trong bàn giao và preview ngày 15/10. Được sửa checkout sạch, push `codex/license-key-csv-studio`, triển khai từng gói lên VPS; người dùng tự ký ví.

Baseline source: `d560ce95ce5ed6de2a9478781608361e4da1ca0d`; checkout sạch trước sửa: `.cache/ci/c-322e58ff`. Root có thay đổi kế thừa và không dùng làm nguồn ứng dụng.

## Phạm vi gói này

- Component PrimaryNavigation dùng chung desktop/mobile. Menu buyer vào Khám phá, Đơn mua, Ví, Tài khoản, Hỗ trợ; seller có thêm Kênh người bán; khu admin có menu riêng. Đây là điều hướng, chưa phải tách phiên admin/backend.
- Chuông và tài khoản có state/panel riêng; Escape trả focus đúng trigger. Menu mobile dùng DialogSurface có focus trap và scroll lock. Scrollbar của popover nằm trong khung.
- Đưa NotificationPreferences/ContactEditor, SellerFollowsPanel và SessionManager ra `/account`; WalletManager ra `/wallet`; inbox ra `/notifications`. Giữ hành vi, kiểm quyền và API hiện có. Trang ví là nền tích hợp, chưa có gửi/swap mới và chưa hoàn tất thiết kế ví.
- Route `/explore`, `/orders`, `/deals/:id`, `/sellers/:id`, `/seller`, `/admin`, `/admin/deals/:id/:view`, `/support`, `/support/orders/:id`, `/support/tickets/:id`, `/wallet`, `/account`, `/notifications`, `/docs`. Link hash cũ được chuyển bằng replaceState; Back/Forward dùng history. Docs còn truy cập trực tiếp, không nằm trong consumer nav.
- Bộ lọc catalog hiện có lưu vào URL và khôi phục khi reload/Back/Forward. Link từ catalog sang deal giữ đường quay lại qua returnTo. ID không sinh lại; chuyển path không đổi principal/ownership.
- Sửa kiểm route khi quay lại checkout sau đăng nhập. Không tự ký hoặc tạo thêm yêu cầu khi đổi route.
- Nginx fallback chỉ cho các path ứng dụng được liệt kê trong `config/nginx/groupdeal-app-routes.conf`; `/api/`, `/health`, missing assets và file ẩn giữ xử lý cũ.

## Hợp đồng dữ liệu và các gói còn lại

| Yêu cầu | Nguồn / quyết định | Trạng thái sau gói 01 |
|---|---|---|
| R1 menu mobile | PrimaryNavigation + DialogSurface | Đã triển khai và kiểm fixture; kiểm hosted ghi riêng trong CHECKS |
| R2 catalog | API hiện có q/category/status/metric/newest/oldest/cursor; giá theo currentPriceBaseUnits trên toàn tập | URL hiện có đã nối; price range, purchasable, price/end sort, chip/draft reset còn ở gói catalog |
| R3 danh sách đơn | order.id ổn định; paid gross khác rebate/refund; chỉ gọi ngày mua khi có mốc mua được xác minh | Tìm đơn/ngày/trạng thái, STT, pagination và định dạng mã đơn còn ở gói buyer |
| R4 review/follows/thread | API review và thread theo order, support ticket theo quyền; SellerFollowsPanel hiện có | Follows đã chuyển vào tài khoản; review/thread/chi tiết đơn vẫn giữ UI cũ, chưa khép thiết kế mới |
| R5 ngữ cảnh | Deal ID, lựa chọn mua, principal, pending checkpoint; không ký lại khi chưa rõ kết quả | ReturnTo catalog, auth handoff và pending checkout đã kiểm; ma trận funding/swap/delivery/confirm/dispute/claim còn mở |
| R6 tiền/ngày | Base-unit USDC, timezone Asia/Saigon, thiếu dữ liệu không giả 0; metric theo campaign | Không đổi semantics hiện có; component tiền/ngày thống nhất còn ở gói buyer/ví |
| R7 copy/form/a11y | Giữ VI/EN, focus trap/Escape, lỗi API và form hiện có | Header/menu/trang nền có VI/EN; wizard/copy các màn nghiệp vụ còn mở |
| R8 Home/menu | Không lặp deal/giảm giá giả; menu theo phiên/vai trò | Menu mới; Home/Explore mới còn ở gói catalog |
| Người dùng / Phân quyền | Danh bạ operator hiện có là read-only; mọi mutation cần capability backend thực | Chưa thêm mutation hoặc tách phiên admin; cần gói admin riêng |

## Kiểm và giới hạn

Kiểm scoped gồm route round-trip/rejection, browser navigation và guest checkout bị ảnh hưởng, frontend typecheck/build; fixture HTTP/RPC tách biệt, không backend/DB snapshot. Thêm test returnTo sau reload; lần đầu selector dùng sai nhãn Back to Explore, đã sửa sang nhãn thực Back to deals rồi kiểm lại.

Đã xem ảnh 375/768/1440. Lỗi header mobile chia hai hàng do CSS cũ đã sửa; bỏ animation mờ ở menu mới. Probe P1/P2 báo contrast vì không đọc gradient avatar/nút cũ; ảnh cho thấy chữ trắng trên nền xanh. P3/P6 logo báo do clipped gradient text; ảnh chữ xanh đậm rõ. P5 chữ Arc đã bỏ theo header mới. Footer P4 xuống hàng có chủ ý, không mất link. Viền card catalog thuộc UI cũ, gói catalog sẽ xử lý. Scrollbar mới đã đưa về 4px. Không gọi đây là nghiệm thu toàn bộ accessibility.

Không chạy full test/CI, reset/seed, replay đơn 1–5, release 95 held jobs, gửi email hay ký ví. Backend/DB/config auth không đổi. Nghiệm thu G5/G6, Safe độc lập, incident/offhost recovery và các gói còn lại vẫn mở. CHECKS của gói mới phải có source/deploy/CI riêng; không gắn PASS T286 cho source mới.

## Triển khai và rollback

Build từ source đã ghim, dùng đúng public Circle/Reown config hiện hành, quét artifact. Upload chỉ static public files; giữ assets cũ; đổi index/fallback/manifest bằng rename có bản trước để rollback. Thêm fallback Nginx, `nginx -t` trước reload; rollback đúng config trước nếu kiểm thất bại. Không restart service backend. Đối chiếu HTTP HTML/asset hashes và PID/NRestarts trước/sau. Kết quả thực tế lưu vào bằng chứng gói, không coi mô tả này là deployment đã thành công.
